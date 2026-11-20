export function buildOpenApi31Document(serverOrigin = "http://127.0.0.1:8280") {
  return {
    openapi: "3.1.0",
    info: {
      title: "灵·洞本体工作站 V7.0 Enterprise Decision OS API",
      version: "7.0.0",
      description:
        "面向大型政企生产环境的语义本体工程平台 OpenAPI 3.1 规范：涵盖零信任认证、OWL 2/SHACL 本体建模、多源证据融合、ABAC 密级管控、NL-to-SPARQL 问图、影子图 What-If 推演、异步作业队列（SSE）与 MCP 协议。",
    },
    servers: [{ url: serverOrigin, description: "当前工作站 API 节点" }],
    tags: [
      { name: "Cluster & Ops", description: "健康探针、无状态集群拓扑与异步作业调度" },
      { name: "Auth & Security", description: "零信任认证、会话吊销与 ABAC 数据密级管控" },
      { name: "Ontology & 37-Std", description: "本体建模、OWL/SHACL 诊断、公理、推理规则与生命周期" },
      { name: "AI & Decision Portal", description: "NL-to-SPARQL 自然语言问图与影子图 What-If 推演" },
    ],
    paths: {
      "/health": {
        get: { tags: ["Cluster & Ops"], summary: "存活探针 (Liveness)", responses: { "200": { description: "服务存活" } } },
      },
      "/readyz": {
        get: {
          tags: ["Cluster & Ops"],
          summary: "就绪探针 (Readiness: PG + Redis + GraphStore)",
          responses: { "200": { description: "集群组件就绪" }, "503": { description: "依赖不可用" } },
        },
      },
      "/api/cluster/health": {
        get: { tags: ["Cluster & Ops"], summary: "获取多副本集群拓扑与节点健康度", responses: { "200": { description: "集群健康快照" } } },
      },
      "/api/auth/login": {
        post: {
          tags: ["Auth & Security"],
          summary: "企业账号安全登录（scrypt + 分布式限流 + HttpOnly Cookie）",
          responses: { "200": { description: "登录成功" }, "401": { description: "认证失败" }, "429": { description: "触发限流锁定" } },
        },
      },
      "/api/auth/logout": {
        post: {
          tags: ["Auth & Security"],
          summary: "退出会话并写入 Redis 黑名单主动吊销令牌",
          responses: { "200": { description: "已吊销会话" } },
        },
      },
      "/api/workspaces/{id}/jobs": {
        get: { tags: ["Cluster & Ops"], summary: "列出工作空间异步作业队列", responses: { "200": { description: "作业列表" } } },
        post: {
          tags: ["Cluster & Ops"],
          summary: "投递异步后台作业（PG SKIP LOCKED 防重调度）",
          responses: { "202": { description: "已入队" } },
        },
      },
      "/api/workspaces/{id}/jobs/{jobId}/stream": {
        get: { tags: ["Cluster & Ops"], summary: "订阅异步作业实时 SSE 进度流", responses: { "200": { description: "text/event-stream" } } },
      },
      "/api/workspaces/{id}/portal/nl-query": {
        post: {
          tags: ["AI & Decision Portal"],
          summary: "本体感知自然语言问图（Text-to-SPARQL + ABAC 脱敏 + 原位证据锚点）",
          responses: { "200": { description: "查询结果与证据子图" } },
        },
      },
      "/api/workspaces/{id}/portal/whatif-simulate": {
        post: {
          tags: ["AI & Decision Portal"],
          summary: "影子图 What-If 级联风险推演（隔离命名图，生产零污染）",
          responses: { "200": { description: "推演影响半径与处置建议" } },
        },
      },
      "/api/workspaces/{id}/governance/abac-policy": {
        get: { tags: ["Auth & Security"], summary: "查询当前工作空间 ABAC 密级管控策略", responses: { "200": { description: "ABAC 策略对象" } } },
        put: { tags: ["Auth & Security"], summary: "更新 ABAC 密级策略（仅 OWNER）", responses: { "200": { description: "已更新" } } },
      },
      "/api/workspaces/{id}/governance/abac-preview": {
        post: { tags: ["Auth & Security"], summary: "按指定角色实时预览 ABAC 密级脱敏效果", responses: { "200": { description: "脱敏对比结果" } } },
      },
    },
  };
}

export function renderOfflineOpenApiHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>灵·洞本体工作站 V5.0 OpenAPI 3.1 开发者文档</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
    header { background: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 20px 32px; display: flex; justify-content: space-between; align-items: center; }
    main { max-width: 1080px; margin: 24px auto; padding: 0 20px 48px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; }
    .method { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 700; margin-right: 10px; }
    .GET { background: #e0f2fe; color: #0369a1; } .POST { background: #dcfce7; color: #15803d; } .PUT { background: #fef3c7; color: #b45309; }
    code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; }
    a.btn { background: #4f46e5; color: #fff; text-decoration: none; padding: 8px 14px; border-radius: 8px; font-size: 13px; }
  </style>
</head>
<body>
  <header>
    <div><h2 style="margin:0">灵·洞本体工作站 V5.0 · OpenAPI 3.1.0 离线开发者文档</h2><small style="color:#64748b">零外部 CDN 依赖 · 适用于政企离线信创内网</small></div>
    <a class="btn" href="/api/openapi.json" target="_blank">下载 OpenAPI JSON</a>
  </header>
  <main id="root">正在加载接口规范…</main>
  <script>
    fetch('/api/openapi.json').then(r => r.json()).then(spec => {
      const root = document.getElementById('root');
      root.innerHTML = Object.entries(spec.paths).map(([path, methods]) =>
        Object.entries(methods).map(([m, op]) =>
          '<div class="card"><span class="method ' + m.toUpperCase() + '">' + m.toUpperCase() + '</span><code>' + path + '</code>' +
          '<div style="margin-top:6px;color:#475569;font-size:13px">' + (op.summary || '') + '</div></div>'
        ).join('')
      ).join('');
    });
  </script>
</body>
</html>`;
}
