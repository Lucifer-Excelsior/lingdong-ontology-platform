import { generateObject, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { ChangeSetProposal } from "@lingdong/contracts";
import { consumeAndCheckLlmTokens } from "./ga-license-and-quota.js";
import { getEffectiveLlmConfig } from "./llm-config-service.js";

const FusedProposalListSchema = z.object({
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
        fusionStatus: z.enum(["CORROBORATED", "CONFLICT_DETECTED", "SINGLE_SOURCE"]),
        conflictNote: z.string().optional(),
        evidenceSources: z
          .array(
            z.object({
              kind: z.enum(["DOCUMENT", "MULTIMODAL", "DATABASE_SCHEMA"]),
              label: z.string(),
              detail: z.string(),
            })
          )
          .min(1),
      })
    )
    .min(1)
    .max(5),
});

/**
 * Item #2A: Invokes tenant's configured OpenAI-compatible Vision LLM (e.g. Qwen-VL / GPT-4o)
 * to extract ER entities, relations, and normative rules from uploaded PNG/JPG/WEBP diagrams.
 */
export async function analyzeDiagramImageWithVlm(
  tenantId: string,
  filename: string,
  imageBytes: Uint8Array,
  mimeType: string,
  userNote?: string
): Promise<string | null> {
  const cfg = getEffectiveLlmConfig(tenantId);
  if (!cfg.enabled || !cfg.apiKey.trim()) return null;
  await consumeAndCheckLlmTokens(tenantId, 800);

  try {
    const openai = createOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl || undefined });
    const res = await generateText({
      model: openai(cfg.modelId || "qwen-vl-max"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `请作为企业本体架构师分析这张业务架构图/ER图/流程图（文件名：${filename}），提取其中的核心业务实体类、实体间关系连线、关键属性及风控约束。${userNote ? `用户补充说明：${userNote}` : ""}`,
            },
            {
              type: "image",
              image: Buffer.from(imageBytes),
              mimeType,
            },
          ],
        },
      ],
      maxTokens: 600,
    });
    return res.text.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Item #2B: Invokes tenant's configured LLM via Vercel AI SDK `generateObject()`
 * to cross-validate Document + Multimodal + Database Schema metadata for arbitrary domains.
 */
export async function runLlmCrossSourceFusion(params: {
  tenantId: string;
  workspaceId: string;
  workspaceName: string;
  existingClasses: string[];
  docSummary: string;
  multimodalSummary: string;
  schemaSummary: string;
  instruction?: string;
}): Promise<{ proposals: ChangeSetProposal[]; modelId: string } | null> {
  const cfg = getEffectiveLlmConfig(params.tenantId);
  if (!cfg.enabled || !cfg.apiKey.trim()) return null;
  await consumeAndCheckLlmTokens(params.tenantId, 1200);

  try {
    const openai = createOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl || undefined });
    const res = await generateObject({
      model: openai(cfg.modelId || "qwen-max"),
      schema: FusedProposalListSchema,
      prompt: [
        `你是企业本体融合建模专家（工作空间：${params.workspaceName}）。`,
        `现有本体类：${params.existingClasses.join(", ") || "无"}`,
        `【制度文档证据】\n${params.docSummary.slice(0, 1800) || "无"}`,
        `【多模态图件证据】\n${params.multimodalSummary.slice(0, 1200) || "无"}`,
        `【数据库/系统元数据】\n${params.schemaSummary.slice(0, 1800) || "无"}`,
        `【架构师补充指令】${params.instruction || "交叉比对上述多源材料，标出多源印证项(CORROBORATED)与口径冲突项(CONFLICT_DETECTED)"}`,
      ].join("\n\n"),
    });

    const nowId = Date.now();
    const proposals: ChangeSetProposal[] = res.object.proposals.map((item, idx) => ({
      id: `prop-llmfuse-${nowId}-${idx}`,
      workspaceId: params.workspaceId,
      kind: item.kind,
      title: item.title,
      localName: item.localName,
      targetClassLocalName: item.targetClassLocalName,
      rangeOrDatatype: item.rangeOrDatatype,
      minInclusive: item.minInclusive,
      evidenceAnchor: item.evidenceSources.map((s) => s.label).join(" + "),
      rationale: item.rationale,
      confidence: item.fusionStatus === "SINGLE_SOURCE" ? "WEAK" : "STRONG",
      selectedByDefault: item.fusionStatus !== "SINGLE_SOURCE",
      status: "PENDING",
      fusionStatus: item.fusionStatus,
      evidenceSources: item.evidenceSources,
      conflictNote: item.conflictNote,
    }));

    return { proposals, modelId: cfg.modelId };
  } catch {
    return null;
  }
}
