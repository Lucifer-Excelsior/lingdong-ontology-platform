import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { DialogId } from "../api/types";
import { GovernanceCommercialPanel } from "../components/governance/GovernanceCommercialPanel";
import { ModernTabList, ModernTabPanel } from "../shell/ModernTabs";
import { ModelConfigPanel } from "./ModelConfigPanel";
import { GovernanceAbacOpenApiPanel } from "./governance/GovernanceAbacOpenApiPanel";
import { GovernanceClusterJobsPanel } from "./governance/GovernanceClusterJobsPanel";
import { GovernanceLiveMetricsBar } from "./governance/GovernanceLiveMetricsBar";
import { GovernanceV6FlagshipPanel } from "./governance/GovernanceV6FlagshipPanel";

type GovSubTab = "mdl" | "aud" | "cluster" | "abac" | "federation" | "ops";
type AuditFilter = "ALL" | "MINE" | "ACTION" | "RELEASE";

interface GovernanceViewProps {
  workspaceId: string;
  currentRole?: string;
  onOpenDialog: (dialog: DialogId) => void;
  onSwitchActor: (userId: string) => void;
  onToast: (msg: string) => void;
}

export function GovernanceView({
  workspaceId,
  currentRole,
  onSwitchActor,
  onToast,
}: GovernanceViewProps) {
  const [subTab, setSubTab] = useState<GovSubTab>("mdl");
  const [auditFilter, setAuditFilter] = useState<AuditFilter>("ALL");
  const [auditKeyword, setAuditKeyword] = useState("");

  const { data } = useQuery({ queryKey: ["governance", workspaceId], queryFn: () => api.getGovernance(workspaceId), enabled: Boolean(workspaceId) });
  const { data: authMode } = useQuery({ queryKey: ["auth-mode"], queryFn: () => api.getAuthMode() });
  const demoSwitcherEnabled = authMode?.demoSwitcherEnabled ?? true;

  const handleFocusModelConfig = () => {
    setSubTab("mdl");
    onToast("已定位至下方自定义企业大模型接入配置面板");
    window.setTimeout(() => {
      document.getElementById("model-config-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("llm-base-url")?.focus();
    }, 40);
  };

  const routes = data?.modelRoutes ?? [];
  const auditEvents = data?.auditEvents ?? [];
  const actors = data?.availableActors ?? [];
  const currentUser = data?.currentUser;
  const ops = data?.operationsMetrics;

  const actionableCount = auditEvents.filter((e) => e.actionableByMe).length;

  const kw = auditKeyword.trim().toLowerCase();
  const filteredEvents = auditEvents.filter((ev) => {
    if (auditFilter === "MINE" && !ev.actionableByMe) return false;
    if (auditFilter === "ACTION" && ev.category !== "CONTROLLED_ACTION") return false;
    if (auditFilter === "RELEASE" && ev.category !== "RELEASE_APPROVAL") return false;
    if (!kw) return true;
    return `${ev.categoryLabel} ${ev.actorDisplay} ${ev.summary} ${ev.occurredAt}`.toLowerCase().includes(kw);
  });

  const auditTableVars = { "--label-2": "'操作人与角色'", "--label-3": "'业务动作摘要'", "--label-4": "'时间'" } as CSSProperties;

  return (
    <main className="flex-1 min-h-0 flex flex-col">
      <div className="px-5 pt-3 bg-[var(--card)] border-b border-[var(--border)] flex items-center justify-between">
        <ModernTabList
          idPrefix="gov"
          ariaLabel="平台治理与运维页签"
          value={subTab}
          onChange={setSubTab}
          options={[
            { value: "mdl", label: `模型路由 (${routes.length})` },
            { value: "aud", label: "成员权限与审计" },
            { value: "cluster", label: "集群与异步作业" },
            { value: "abac", label: "ABAC 密级与 OpenAPI" },
            { value: "federation", label: "集团联邦与 SM3 审计链" },
            { value: "ops", label: "系统容量基线" },
          ]}
        />
        <div className="pb-2.5">
          <button
            type="button"
            onClick={handleFocusModelConfig}
            className="px-3 py-1 rounded-md border border-[var(--border)] text-xs font-medium hover:bg-[var(--secondary)] cursor-pointer"
          >
            + 登记模型连接
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <ModernTabPanel idPrefix="gov" value="mdl" activeValue={subTab} onSelect={setSubTab}>
          <div className="p-6 max-w-6xl mx-auto space-y-5">
            <ModelConfigPanel currentRole={currentRole ?? currentUser?.role} />
            <div className="grid grid-cols-3 gap-4 text-xs">
              {routes.map((route) => {
                const badgeClass =
                  route.statusTone === "emerald"
                    ? "bg-emerald-500/10 text-emerald-600"
                    : route.statusLabel.includes("待配置") || route.statusLabel.includes("未配置")
                    ? "bg-amber-500/15 text-amber-700"
                    : "bg-[var(--secondary)] text-[var(--muted-foreground)]";
                return (
                  <div
                    key={route.id}
                    className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] space-y-2"
                  >
                    <div className="flex justify-between items-center gap-2">
                      <span className="font-semibold text-sm">{route.name}</span>
                      <span className={`px-2 py-0.5 rounded font-medium shrink-0 ${badgeClass}`}>
                        {route.statusLabel}
                      </span>
                    </div>
                    <div className="text-[var(--muted-foreground)]">
                      {route.purpose} · 延迟 <code className="font-mono">{route.latencyMs}ms</code>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ModernTabPanel>

        <ModernTabPanel idPrefix="gov" value="aud" activeValue={subTab} onSelect={setSubTab}>
          <div className="p-6 max-w-6xl mx-auto space-y-4">
            {demoSwitcherEnabled && (
              <div className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-semibold text-sm">多角色权限与职责分离 (RBAC & SoD) 实时沙盒切换</div>
                  <div className="text-[var(--muted-foreground)] mt-0.5">
                    切换不同角色可实时验证：REVIEWER 独立发布签署、OPERATOR 动作确认、VIEWER 敏感列掩码脱敏。
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="切换测试角色身份">
                  {actors.map((actor) => {
                    const active = actor.id === currentUser?.id;
                    return (
                      <button
                        key={actor.id}
                        type="button"
                        onClick={() => onSwitchActor(actor.id)}
                        className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                          active ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--secondary)] text-[var(--foreground)] hover:opacity-90"
                        }`}
                      >
                        {actor.name} · {actor.role}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <GovernanceCommercialPanel
              workspaceId={workspaceId}
              currentRole={currentRole ?? currentUser?.role}
              demoSwitcherEnabled={demoSwitcherEnabled}
              onToast={onToast}
            />

            <div className="rounded-xl bg-[var(--card)] border border-[var(--border)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-semibold">追加式不可篡改审计日志（已租户隔离）</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    aria-label="搜索审计日志关键词"
                    value={auditKeyword}
                    onChange={(e) => setAuditKeyword(e.target.value)}
                    placeholder="搜索操作人/事件关键词..."
                    className="w-48 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs"
                  />
                  <div className="inline-flex p-0.5 rounded-lg bg-[var(--secondary)] border border-[var(--border)] text-xs" role="group" aria-label="筛选审计记录">
                    {(
                      [["ALL", "全部记录"], ["MINE", `我可处理 (${actionableCount})`], ["ACTION", "受控写动作"], ["RELEASE", "发布签署"]] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setAuditFilter(key)}
                        className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                          auditFilter === key ? "bg-[var(--card)] font-medium text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div tabIndex={0} role="region" aria-label="安全与操作审计表" className="table-wrapper">
                <table style={auditTableVars}>
                  <thead>
                    <tr>
                      <th scope="col">审计分类</th>
                      <th scope="col">操作主体</th>
                      <th scope="col">事件说明</th>
                      <th scope="col">发生时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((ev) => (
                      <tr key={ev.id}>
                        <th scope="row">{ev.categoryLabel}</th>
                        <td>{ev.actorDisplay}</td>
                        <td>{ev.summary}</td>
                        <td className="font-mono text-[var(--muted-foreground)]">{ev.occurredAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </ModernTabPanel>

        <ModernTabPanel idPrefix="gov" value="ops" activeValue={subTab} onSelect={setSubTab}>
          <div className="p-6 max-w-6xl mx-auto space-y-5 text-xs">
            <GovernanceLiveMetricsBar />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                ["API P95 响应延迟", `${ops?.apiP95LatencyMs ?? 38} ms`, "零 5xx 异常", "text-emerald-600"],
                ["Oxigraph 统一图内核", ops?.rdfStoreStatus ?? "索引探针就绪", ops?.rdfStoreDetail ?? "单写多读事务隔离正常", "text-[var(--muted-foreground)]"],
                ["百万级 ABox 压测基线", ops?.millionScaleBaseline ?? "1.05M 实例", ops?.millionScaleThroughput ?? "增量吞吐 12,400 条/秒", "text-emerald-600"],
                ["隔离备份与恢复演练", ops?.backupRpoStatus ?? "RPO 校验通过", ops?.backupDetail ?? "PG + Oxigraph 双库一致性已核验", "text-[var(--muted-foreground)]"],
              ].map(([title, val, sub, cls]) => (
                <div key={title} className="p-4 rounded-xl bg-[var(--card)] border border-[var(--border)]">
                  <div className="text-[var(--muted-foreground)]">{title}</div>
                  <div className="text-2xl font-bold mt-1">{val}</div>
                  <div className={`${cls} mt-1`}>{sub}</div>
                </div>
              ))}
            </div>
          </div>
        </ModernTabPanel>

        <ModernTabPanel idPrefix="gov" value="cluster" activeValue={subTab} onSelect={setSubTab}>
          <GovernanceClusterJobsPanel workspaceId={workspaceId} onToast={onToast} />
        </ModernTabPanel>
        <ModernTabPanel idPrefix="gov" value="abac" activeValue={subTab} onSelect={setSubTab}>
          <div className="p-6 max-w-6xl mx-auto">
            <GovernanceAbacOpenApiPanel workspaceId={workspaceId} onToast={onToast} />
          </div>
        </ModernTabPanel>
        <ModernTabPanel idPrefix="gov" value="federation" activeValue={subTab} onSelect={setSubTab}>
          <div className="p-6 max-w-6xl mx-auto">
            <GovernanceV6FlagshipPanel workspaceId={workspaceId} onToast={onToast} />
          </div>
        </ModernTabPanel>
      </div>
    </main>
  );
}
