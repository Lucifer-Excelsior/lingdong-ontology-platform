import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  AgentAskInputSchema,
  ConfigureCapabilityInputSchema,
} from "@lingdong/contracts";
import { withTenantDb } from "../db/client.js";
import { requireRoles, type SessionActor } from "../security/guards.js";
import { askOntologyAgent } from "../services/agent-service.js";
import {
  configureGovernedCapability,
  issueMcpApiToken,
  listMcpApiTokens,
  revokeMcpApiToken,
} from "../services/m5-benchmark-and-mcp-service.js";
import {
  generateContractRenewalBriefDocx,
  generateItuReviewReportDocx,
} from "../services/m5-docx-exporter-service.js";
import { importFdeReleaseBundleZip } from "../services/m6-fde-bundle-import-service.js";

type AppEnv = { Variables: { actor: SessionActor } };

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const modelerGuard = requireRoles("OWNER", "MODELER");
const ownerGuard = requireRoles("OWNER");

export const m5M6Routes = new Hono<AppEnv>();

m5M6Routes.post("/workspaces/:id/capabilities/configure", modelerGuard, async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  try {
    const parsed = ConfigureCapabilityInputSchema.parse(await c.req.json());
    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(await configureGovernedCapability(txDb, actor.tenantId, workspaceId, parsed), 201)
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "动作编排保存失败" }, 400);
  }
});

m5M6Routes.post("/workspaces/:id/agent/ask-stream", async (c) => {
  const actor = c.get("actor");
  const workspaceId = c.req.param("id");
  const parsed = AgentAskInputSchema.parse({
    ...(await c.req.json()),
    workspaceId,
  });

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: JSON.stringify({
        type: "step",
        step: "1. 挂载冻结修订 TBox 与活跃 ABox 命名图执行受控 SPARQL 检索...",
      }),
    });
    await stream.writeSSE({
      data: JSON.stringify({
        type: "step",
        step: `2. 校验角色脱敏策略 (${actor.role}) 与 PROV-O 文档字符锚点...`,
      }),
    });

    const result = await withTenantDb(actor.tenantId, (txDb) =>
      askOntologyAgent(txDb, actor, workspaceId, parsed.sessionId, parsed.question)
    );

    await stream.writeSSE({
      data: JSON.stringify({
        type: "step",
        step: result.message.pendingAction
          ? `3. 已生成 ${result.message.pendingAction.autonomyTier} 受治理执行计划 (${result.message.pendingAction.planCode})`
          : "3. 证据对齐完毕，流式输出受治理结论...",
      }),
    });

    const fullText = result.message.content;
    const chunkSize = 24;
    for (let i = 0; i < fullText.length; i += chunkSize) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: "delta",
          text: fullText.slice(i, i + chunkSize),
        }),
      });
    }

    await stream.writeSSE({
      data: JSON.stringify({
        type: "done",
        message: result.message,
        plans: result.plans,
      }),
    });
  });
});

m5M6Routes.get("/workspaces/:id/portal/itu-review-report.docx", (c) => {
  const doc = generateItuReviewReportDocx();
  return new Response(Buffer.from(doc.bytes), {
    status: 200,
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="${doc.filename}"`,
    },
  });
});

m5M6Routes.get("/workspaces/:id/portal/renewal-brief/:contractFile", async (c) => {
  const actor = c.get("actor");
  const rawParam = c.req.param("contractFile");
  const contractNo = rawParam.replace(/\.docx$/i, "");
  const doc = await generateContractRenewalBriefDocx(contractNo, actor.role);
  return new Response(Buffer.from(doc.bytes), {
    status: 200,
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename="${doc.filename}"`,
    },
  });
});

m5M6Routes.get("/workspaces/:id/mcp-tokens", (c) => {
  const actor = c.get("actor");
  return c.json({ tokens: listMcpApiTokens(actor.tenantId, c.req.param("id")) });
});

m5M6Routes.post("/workspaces/:id/mcp-tokens", ownerGuard, async (c) => {
  const actor = c.get("actor");
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    roleScope?: "VIEWER" | "OPERATOR";
  };
  const issued = issueMcpApiToken(
    actor.tenantId,
    c.req.param("id"),
    body.name ?? "外部智能体只读访问密钥",
    body.roleScope === "OPERATOR" ? "OPERATOR" : "VIEWER"
  );
  return c.json(issued, 201);
});

m5M6Routes.delete("/workspaces/:id/mcp-tokens/:tokenId", ownerGuard, (c) => {
  const actor = c.get("actor");
  const ok = revokeMcpApiToken(actor.tenantId, c.req.param("tokenId"));
  return c.json({ ok, message: ok ? "已吊销该 MCP 访问令牌" : "未找到令牌" });
});

m5M6Routes.post("/releases/import-bundle", modelerGuard, async (c) => {
  const actor = c.get("actor");
  try {
    const form = await c.req.parseBody();
    const uploaded = form["file"];
    if (!(uploaded instanceof File)) {
      return c.json({ error: "请上传有效的 .zip 不可变方案包文件" }, 400);
    }
    const zipBytes = new Uint8Array(await uploaded.arrayBuffer());
    const overrideSlug = typeof form["targetSlug"] === "string" ? form["targetSlug"] : undefined;
    const overrideName = typeof form["targetName"] === "string" ? form["targetName"] : undefined;
    let credentialMapping: Record<string, string> | undefined;
    if (typeof form["credentialMappingJson"] === "string" && form["credentialMappingJson"].trim()) {
      try {
        credentialMapping = JSON.parse(form["credentialMappingJson"]) as Record<string, string>;
      } catch {
        return c.json({ error: "credentialMappingJson 不是合法 JSON 对象" }, 400);
      }
    }

    return await withTenantDb(actor.tenantId, async (txDb) =>
      c.json(
        await importFdeReleaseBundleZip(
          txDb,
          actor.tenantId,
          `${actor.name} (${actor.role})`,
          { zipBytes, overrideSlug, overrideName, credentialMapping }
        ),
        201
      )
    );
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "FDE 方案包验签导入失败" }, 400);
  }
});
