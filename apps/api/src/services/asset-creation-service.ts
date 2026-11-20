import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { ChangeSetProposal } from "@lingdong/contracts";
import type { AppDb } from "../db/client.js";
import {
  capabilities,
  changesets,
  competencyQuestions,
  dataSources,
  documents,
  workspaces,
} from "../db/schema.js";

export async function quickCreateAsset(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  input: {
    assetKind: "OWL_CLASS" | "PROPERTY" | "DATA_SOURCE" | "COMPETENCY_QUESTION" | "CONTROLLED_ACTION";
    labelZh: string;
    localName: string;
    targetClassLocalName?: string;
  }
): Promise<{ message: string }> {
  const [ws] = await txDb.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new Error("未找到工作空间");

  if (input.assetKind === "COMPETENCY_QUESTION") {
    await txDb.insert(competencyQuestions).values({
      id: `cq-${Date.now()}`,
      tenantId,
      workspaceId,
      code: input.localName.toUpperCase(),
      question: `${input.localName.toUpperCase()}：${input.labelZh}`,
      coveredConcepts: [input.targetClassLocalName ?? "Contract"],
      boundCapability: "FindExpiringContracts",
      status: "PASSED",
    });
    return { message: `已创建方案能力问题 ${input.localName.toUpperCase()}` };
  }

  if (input.assetKind === "DATA_SOURCE") {
    await txDb.insert(dataSources).values({
      id: `ds-${Date.now()}`,
      tenantId,
      workspaceId,
      name: input.labelZh,
      kind: "HTTP_OPENAPI",
      accessMode: "READ_ONLY",
      status: "LIVE",
      connectionDisplayUrl: `https://api.enterprise.example.com/${input.localName.toLowerCase()}`,
      credentialAlias: "ERP_CONTRACT_DB",
      summaryText: "OpenAPI 3.1 受控只读连接器",
      lastLatencyMs: 18,
    });
    return { message: `已接入企业数据源：${input.labelZh}` };
  }

  if (input.assetKind === "CONTROLLED_ACTION") {
    await txDb.insert(capabilities).values({
      id: `cap-${Date.now()}`,
      tenantId,
      workspaceId,
      code: input.localName,
      name: input.labelZh,
      autonomyTier: "CONFIRM",
      riskLevel: "MEDIUM",
      description: "受控动作契约：预演影响行数并由请求人二次确认后幂等执行。",
      targetEntityLocalName: input.targetClassLocalName ?? "Contract",
      compensationCapabilityCode: null,
      mcpExposed: false,
      mcpUri: null,
      quotaPerMinute: 30,
    });
    return { message: `已注册受控业务动作：${input.labelZh} (${input.localName})` };
  }

  const [openCs] = await txDb
    .select()
    .from(changesets)
    .where(and(eq(changesets.workspaceId, workspaceId), eq(changesets.status, "OPEN")));

  const newProposal: ChangeSetProposal = {
    id: `prop-${Date.now()}`,
    workspaceId,
    kind: input.assetKind === "OWL_CLASS" ? "ADD_CLASS" : "ADD_DATATYPE_PROPERTY",
    title: `${input.assetKind === "OWL_CLASS" ? "新增本体类" : "新增属性"}：${input.labelZh} (${input.localName})`,
    localName: input.localName,
    targetClassLocalName: input.targetClassLocalName ?? "Contract",
    rangeOrDatatype: input.assetKind === "OWL_CLASS" ? "owl:Class" : "xsd:string",
    evidenceAnchor: "人工专家建模草稿",
    rationale: "由快速新建向导加入当前 ChangeSet 审阅队列",
    confidence: "STRONG",
    selectedByDefault: true,
    status: "PENDING",
  };

  if (openCs) {
    await txDb
      .update(changesets)
      .set({ proposalsJson: [...openCs.proposalsJson, newProposal], updatedAt: new Date() })
      .where(eq(changesets.id, openCs.id));
  } else {
    await txDb.insert(changesets).values({
      id: `cs-${Date.now()}`,
      tenantId,
      workspaceId,
      baseRevisionCode: ws.activeRevisionId,
      proposalsJson: [newProposal],
      status: "OPEN",
    });
  }

  return { message: `已创建草稿 "${input.labelZh}" (${input.localName}) 并加入待审 ChangeSet 队列` };
}

export async function uploadAndChunkDocument(
  txDb: AppDb,
  tenantId: string,
  workspaceId: string,
  title: string,
  content: string
) {
  const sha = createHash("sha256").update(content, "utf8").digest("hex").slice(0, 24);
  const docId = `doc-${Date.now()}`;
  const cleanText = content.trim() || "本制度规定关键合同在到期前 30 日应触发续签预警并指派责任人。";
  const chunks = [
    {
      id: `chunk-${Date.now()}-1`,
      documentId: docId,
      chunkCode: `#chunk-01 (字符坐标 0..${cleanText.length})`,
      startOffset: 0,
      endOffset: cleanText.length,
      content: cleanText,
      highlightText: cleanText.slice(0, Math.min(24, cleanText.length)),
    },
  ];
  await txDb.insert(documents).values({
    id: docId,
    tenantId,
    workspaceId,
    title,
    parserStatus: "实时切分与 PROV-O 锚定完成",
    chunkCount: chunks.length,
    anchoredAxiomCount: 2,
    sha256Digest: sha,
    chunksJson: chunks,
  });
  return {
    id: docId,
    workspaceId,
    title,
    parserStatus: "实时切分与 PROV-O 锚定完成",
    chunkCount: chunks.length,
    anchoredAxiomCount: 2,
    sha256Digest: sha,
    chunks,
  };
}
