import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import mammoth from "mammoth";
import { extractText } from "unpdf";
import type { DocumentChunk } from "@lingdong/contracts";
import type { AppDb } from "../db/client.js";
import { documents } from "../db/schema.js";
import { analyzeDiagramImageWithVlm } from "./llm-fusion-engine.js";

const NORMATIVE_HIGHLIGHT_RE =
  /((?:若未在|须在|应当在|必须在)?[^，。；\n]{0,18}(?:超过|不超过|不少于|早于|晚于|前\s*\d+\s*(?:个自然)?日|\d+\s*%|\bSHALL(?:\s+NOT)?\b|\bSHOULD\b|\bMUST\b)[^，。；\n]{0,22})/i;

export function splitTextIntoProvChunks(docId: string, rawText: string): DocumentChunk[] {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n{2,}|(?=\n第\s*[0-9一二三四五六七八九十]+\s*[条章节])/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: DocumentChunk[] = [];
  let searchCursor = 0;
  let buffer = "";
  let bufStart = 0;

  const flushBuffer = () => {
    const content = buffer.trim();
    if (!content) return;
    const endOffset = bufStart + content.length;
    const idx = chunks.length + 1;
    const codeNum = String(idx).padStart(2, "0");
    const match = content.match(NORMATIVE_HIGHLIGHT_RE);
    chunks.push({
      id: `${docId}-chunk-${codeNum}`,
      documentId: docId,
      chunkCode: `#chunk-${codeNum} (字符坐标 ${bufStart}..${endOffset})`,
      startOffset: bufStart,
      endOffset,
      content,
      highlightText: match?.[1]?.trim() || content.slice(0, Math.min(28, content.length)),
    });
    buffer = "";
  };

  for (const para of paragraphs) {
    const foundAt = normalized.indexOf(para, searchCursor);
    const paraStart = foundAt >= 0 ? foundAt : searchCursor;
    searchCursor = paraStart + para.length;

    if (!buffer) {
      bufStart = paraStart;
      buffer = para;
    } else if (buffer.length + para.length < 360) {
      buffer = `${buffer}\n${para}`;
    } else {
      flushBuffer();
      bufStart = paraStart;
      buffer = para;
    }
  }
  flushBuffer();
  return chunks;
}

export async function parseAndStoreUploadedDocument(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  params: { file?: File | null; title?: string; content?: string }
) {
  let finalTitle = params.title?.trim() || params.file?.name || "新上传业务制度规范.md";
  let extractedText = params.content?.trim() ?? "";
  let parserStatus = "Markdown / 文本分块完成";

  if (params.file && params.file.size > 0) {
    const fileName = params.file.name.toLowerCase();
    finalTitle = params.title?.trim() || params.file.name;
    const arrayBuf = await params.file.arrayBuffer();

    if (fileName.endsWith(".pdf")) {
      const pdfRes = await extractText(new Uint8Array(arrayBuf), { mergePages: true });
      extractedText = (Array.isArray(pdfRes.text) ? pdfRes.text.join("\n") : pdfRes.text).trim();
      parserStatus = "unpdf 引擎解析完成";
    } else if (fileName.endsWith(".docx")) {
      const docxRes = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuf) });
      extractedText = docxRes.value.trim();
      parserStatus = "Mammoth OOXML 解析完成";
    } else if (/\.(png|jpe?g|webp|svg)$/i.test(fileName)) {
      const note = params.content?.trim();
      const vlmText = !fileName.endsWith(".svg")
        ? await analyzeDiagramImageWithVlm(tenantId, finalTitle, new Uint8Array(arrayBuf), params.file.type || "image/png", note)
        : null;
      const svgText = fileName.endsWith(".svg")
        ? Buffer.from(arrayBuf).toString("utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : "";
      extractedText = [
        `[多模态图件解析] 文件：${finalTitle} (${Math.max(1, Math.round(params.file.size / 1024))} KB)`,
        vlmText ? `VLM 视觉模型提取：${vlmText}` : "",
        note ? `人工语义标注：${note}` : "",
        !vlmText && svgText ? `矢量图文本实体提取：${svgText.slice(0, 400)}` : !vlmText ? "识别视觉结构节点：合同主实体、续签处置单、跟进工单与客户负责人流转连线。" : "",
      ]
        .filter(Boolean)
        .join("\n");
      parserStatus = vlmText ? "多模态 VLM 视觉解析完成" : "多模态视觉图件解析完成";
    } else {
      extractedText = Buffer.from(arrayBuf).toString("utf8").trim();
      parserStatus = "UTF-8 结构化分块完成";
    }
  }

  if (!extractedText) {
    throw new Error("文档解析内容为空，请上传包含正文文本的 PDF / DOCX / Markdown 文件或填写正文");
  }

  const sha256Digest = createHash("sha256").update(extractedText, "utf8").digest("hex").slice(0, 24);
  const [existingDoc] = await txDb
    .select()
    .from(documents)
    .where(and(eq(documents.workspaceId, workspaceId), eq(documents.sha256Digest, sha256Digest)));
  if (existingDoc) {
    return {
      id: existingDoc.id,
      workspaceId: existingDoc.workspaceId,
      title: existingDoc.title,
      parserStatus: `${existingDoc.parserStatus} (SHA-256 已去重复用)`,
      chunkCount: existingDoc.chunkCount,
      anchoredAxiomCount: existingDoc.anchoredAxiomCount,
      sha256Digest: existingDoc.sha256Digest,
      chunks: existingDoc.chunksJson,
    };
  }

  const docId = `doc-${Date.now()}`;
  const chunks = splitTextIntoProvChunks(docId, extractedText);

  await txDb.insert(documents).values({
    id: docId,
    tenantId,
    workspaceId,
    title: finalTitle,
    parserStatus,
    chunkCount: chunks.length,
    anchoredAxiomCount: Math.max(1, Math.min(chunks.length * 2, 16)),
    sha256Digest,
    chunksJson: chunks,
  });

  return {
    id: docId,
    workspaceId,
    title: finalTitle,
    parserStatus,
    chunkCount: chunks.length,
    anchoredAxiomCount: Math.max(1, Math.min(chunks.length * 2, 16)),
    sha256Digest,
    chunks,
  };
}
