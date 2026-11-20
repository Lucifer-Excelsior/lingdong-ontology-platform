import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ChangeSetProposal } from "@lingdong/contracts";
import type { AppDb } from "../db/client.js";
import { changesets, documents, ontologyRevisions, workspaces } from "../db/schema.js";
import { getEffectiveLlmConfig } from "./llm-config-service.js";

export { parseAndStoreUploadedDocument, splitTextIntoProvChunks } from "./document-parser-service.js";

const LlmProposalArraySchema = z.object({
  proposals: z
    .array(
      z.object({
        kind: z.enum(["ADD_CLASS", "ADD_DATATYPE_PROPERTY", "ADD_OBJECT_PROPERTY", "ADD_SHACL_CONSTRAINT"]),
        title: z.string(),
        localName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
        targetClassLocalName: z.string(),
        rangeOrDatatype: z.string(),
        minInclusive: z.number().optional(),
        rationale: z.string(),
        confidence: z.enum(["STRONG", "WEAK"]),
      })
    )
    .min(1)
    .max(4),
});

export async function extractProposalsFromDocChunks(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  documentId: string,
  chunkId?: string,
  instruction?: string
): Promise<{ proposals: ChangeSetProposal[]; engineUsed: string }> {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");

  const docRows = await txDb.select().from(documents).where(eq(documents.workspaceId, workspaceId));
  const targetDoc = docRows.find((d) => d.id === documentId) ?? docRows[0];
  if (!targetDoc) throw new Error("当前工作空间尚无已解析的制度文档");

  const targetChunk =
    targetDoc.chunksJson.find((c) => c.id === chunkId) ?? targetDoc.chunksJson[0];
  const anchorLabel = targetChunk
    ? `${targetChunk.chunkCode.split(" ")[0]} [${targetChunk.startOffset}..${targetChunk.endOffset}]`
    : "#chunk-01 [0..120]";

  const [rev] = await txDb
    .select()
    .from(ontologyRevisions)
    .where(
      and(
        eq(ontologyRevisions.workspaceId, workspaceId),
        eq(ontologyRevisions.revisionCode, ws.activeRevisionId)
      )
    );
  const defaultClass = rev?.classesJson[0]?.localName ?? "Contract";
  const existingNames = new Set([
    ...(rev?.classesJson.map((c) => c.localName.toLowerCase()) ?? []),
    ...(rev?.propertiesJson.map((p) => p.localName.toLowerCase()) ?? []),
  ]);

  let generated: ChangeSetProposal[] = [];
  let engineUsed = "PROV-O 确定性规则抽取器";

  const llmCfg = getEffectiveLlmConfig(tenantId);
  if (llmCfg.enabled && llmCfg.apiKey.trim() && targetChunk) {
    try {
      const openai = createOpenAI({ apiKey: llmCfg.apiKey, baseURL: llmCfg.baseUrl || undefined });
      const res = await generateObject({
        model: openai(llmCfg.modelId || "qwen-max"),
        schema: LlmProposalArraySchema,
        prompt: `基于以下业务制度原文片段抽取 OWL 2 EL 本体类、属性与 SHACL 约束提案：\n文档：《${targetDoc.title}》\n片段：${targetChunk.content}\n现有主类：${rev?.classesJson.map((c) => c.localName).join(", ")}\n补充要求：${instruction ?? "提取核心数值/天数阈值与关键属性"}`,
      });
      engineUsed = `大模型结构化抽取 (${llmCfg.modelId})`;
      generated = res.object.proposals.map((item, idx) => ({
        id: `prop-llm-${Date.now()}-${idx}`,
        workspaceId,
        kind: item.kind,
        title: item.title,
        localName: item.localName,
        targetClassLocalName: item.targetClassLocalName || defaultClass,
        rangeOrDatatype: item.rangeOrDatatype,
        minInclusive: item.minInclusive,
        evidenceAnchor: anchorLabel,
        rationale: `文档《${targetDoc.title}》· ${item.rationale}`,
        confidence: item.confidence,
        selectedByDefault: item.confidence === "STRONG",
        status: "PENDING",
      }));
    } catch {
      // Fall back cleanly to deterministic clause extraction if external model rejects JSON schema
    }
  }

  if (generated.length === 0 && targetChunk) {
    const text = targetChunk.content;
    const dayMatch = text.match(/(\d+)\s*(?:个自然)?(?:日|天)/);
    const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
    const amtMatch = text.match(/(\d+(?:\.\d+)?)\s*万/);
    const stamp = String(Date.now()).slice(-4);

    if (dayMatch) {
      const days = Number(dayMatch[1]);
      const propName = existingNames.has("reviewleaddays") ? `leadDays_${stamp}` : "reviewLeadDays";
      generated.push(
        {
          id: `prop-det-${Date.now()}-1`,
          workspaceId,
          kind: "ADD_DATATYPE_PROPERTY",
          title: `数据属性：合规提前期 (${propName})`,
          localName: propName,
          targetClassLocalName: defaultClass,
          rangeOrDatatype: "xsd:integer",
          evidenceAnchor: anchorLabel,
          rationale: `抽自《${targetDoc.title}》时限条款（提前 ${days} 日触发流转）`,
          confidence: "STRONG",
          selectedByDefault: true,
          status: "PENDING",
        },
        {
          id: `prop-det-${Date.now()}-2`,
          workspaceId,
          kind: "ADD_SHACL_CONSTRAINT",
          title: `SHACL 形状约束：${propName} 下限为 ${Math.max(7, Math.floor(days / 2))} 天`,
          localName: propName,
          targetClassLocalName: defaultClass,
          rangeOrDatatype: "xsd:integer",
          minInclusive: Math.max(7, Math.floor(days / 2)),
          evidenceAnchor: anchorLabel,
          rationale: "防止业务录入低于制度预警窗口导致履约违约",
          confidence: "STRONG",
          selectedByDefault: true,
          status: "PENDING",
        }
      );
    } else if (pctMatch || amtMatch) {
      const thresholdVal = Number(pctMatch?.[1] ?? amtMatch?.[1] ?? 15);
      const propName = pctMatch ? "penaltyCapRatio" : `thresholdAmount_${stamp}`;
      generated.push({
        id: `prop-det-${Date.now()}-3`,
        workspaceId,
        kind: "ADD_DATATYPE_PROPERTY",
        title: `数据属性：${pctMatch ? "违约赔偿上限比例" : "重大金额核算阈值"} (${propName})`,
        localName: propName,
        targetClassLocalName: defaultClass,
        rangeOrDatatype: "xsd:decimal",
        minInclusive: 0,
        evidenceAnchor: anchorLabel,
        rationale: `抽自《${targetDoc.title}》量化核算条款（基准值 ${thresholdVal}${pctMatch ? "%" : "万"}）`,
        confidence: "STRONG",
        selectedByDefault: true,
        status: "PENDING",
      });
    } else {
      const propName = `complianceNote_${stamp}`;
      generated.push({
        id: `prop-det-${Date.now()}-4`,
        workspaceId,
        kind: "ADD_DATATYPE_PROPERTY",
        title: `数据属性：条款合规核验标注 (${propName})`,
        localName: propName,
        targetClassLocalName: defaultClass,
        rangeOrDatatype: "xsd:string",
        evidenceAnchor: anchorLabel,
        rationale: `抽自《${targetDoc.title}》规范性要求段落`,
        confidence: "STRONG",
        selectedByDefault: true,
        status: "PENDING",
      });
    }
  }

  const [openCs] = await txDb
    .select()
    .from(changesets)
    .where(and(eq(changesets.workspaceId, workspaceId), eq(changesets.status, "OPEN")));

  const existingPending = (openCs?.proposalsJson ?? []).filter((p) => p.status === "PENDING");
  const pendingNames = new Set(existingPending.map((p) => `${p.kind}:${p.localName}`));
  const dedupedNew = generated.filter((g) => !pendingNames.has(`${g.kind}:${g.localName}`));
  const merged = [...dedupedNew, ...(openCs?.proposalsJson ?? [])];

  if (openCs) {
    await txDb
      .update(changesets)
      .set({ proposalsJson: merged, updatedAt: new Date() })
      .where(eq(changesets.id, openCs.id));
  } else {
    await txDb.insert(changesets).values({
      id: `cs-${Date.now()}`,
      tenantId,
      workspaceId,
      baseRevisionCode: ws.activeRevisionId,
      proposalsJson: merged,
      status: "OPEN",
    });
  }

  return { proposals: merged.filter((p) => p.status === "PENDING"), engineUsed };
}
