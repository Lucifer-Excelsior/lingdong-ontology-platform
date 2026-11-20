import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { DataSource, EngineeringViewId } from "../api/types";
import { useConfirmDialog } from "../components/ConfirmDialog";
import { SlideOverDrawer } from "../components/SlideOverDrawer";
import { ROLE_TIPS } from "../utils/rbac";

interface DataSourcesTabProps {
  workspaceId: string;
  dataSources: DataSource[];
  canModel?: boolean;
  canOperate?: boolean;
  onSwitchView?: (view: EngineeringViewId) => void;
  onToast: (msg: string) => void;
}

const CONNECTOR_KINDS: ReadonlyArray<[DataSource["kind"], string]> = [
  ["POSTGRESQL", "PostgreSQL"], ["DAMENG_DM8", "达梦 DM8 (信创)"], ["KINGBASE_ES", "人大金仓 KingbaseES"],
  ["MYSQL", "MySQL"], ["ORACLE", "Oracle"], ["CLICKHOUSE", "ClickHouse"],
  ["KAFKA_CDC", "Kafka CDC"], ["HTTP_OPENAPI", "REST OpenAPI"], ["RDF_SPARQL", "RDF SPARQL"],
];

export function DataSourcesTab({
  workspaceId,
  dataSources,
  canModel = true,
  canOperate = true,
  onSwitchView,
  onToast,
}: DataSourcesTabProps) {
  const queryClient = useQueryClient();
  const { ask, confirmDialogNode } = useConfirmDialog();
  const [selectedId, setSelectedId] = useState("");
  const [selectedSnapId, setSelectedSnapId] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dsName, setDsName] = useState("");
  const [dsKind, setDsKind] = useState<DataSource["kind"]>("POSTGRESQL");
  const [dsMode, setDsMode] = useState<"READ_ONLY" | "READ_WRITE" | "RDF_GSP">("READ_ONLY");
  const [dsUrl, setDsUrl] = useState("");
  const [dsAlias, setDsAlias] = useState("FINANCE_ERP_RO");

  useEffect(() => {
    if (dataSources.length > 0 && !dataSources.some((ds) => ds.id === selectedId)) setSelectedId(dataSources[0].id);
  }, [dataSources, selectedId]);

  const activeDs = dataSources.find((ds) => ds.id === selectedId) ?? dataSources[0];

  useEffect(() => {
    const snaps = activeDs?.snapshots ?? [];
    if (snaps.length > 0 && !snaps.some((s) => s.id === selectedSnapId)) {
      setSelectedSnapId(snaps.find((s) => s.isActiveBinding)?.id ?? snaps[0].id);
    } else if (snaps.length === 0) {
      setSelectedSnapId("");
    }
  }, [activeDs, selectedSnapId]);

  const activeSnap = activeDs?.snapshots.find((s) => s.id === selectedSnapId) ?? activeDs?.snapshots[0];

  const testMutation = useMutation({
    mutationFn: () => api.testDataSource(workspaceId, activeDs?.id ?? ""),
    onSuccess: (res) => { void queryClient.invalidateQueries({ queryKey: ["data", workspaceId] }); onToast(res.message || `连接测试通过：握手耗时 ${res.latencyMs}ms`); },
    onError: (err: Error) => onToast(err.message),
  });

  const snapshotMutation = useMutation({
    mutationFn: () => api.captureSnapshot(workspaceId, activeDs?.id ?? ""),
    onSuccess: (res) => { void queryClient.invalidateQueries({ queryKey: ["data", workspaceId] }); onToast(res.message); },
    onError: (err: Error) => onToast(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (dsId: string) => api.deleteDataSource(workspaceId, dsId),
    onSuccess: (res, dsId) => {
      if (selectedId === dsId) setSelectedId("");
      void queryClient.invalidateQueries({ queryKey: ["data", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["modeling", workspaceId] });
      onToast(res.message);
    },
    onError: (err: Error) => onToast(err.message),
  });

  const registerMutation = useMutation({
    mutationFn: () => api.registerDataSource(workspaceId, { name: dsName.trim(), kind: dsKind, accessMode: dsMode, connectionUrl: dsUrl.trim(), credentialAlias: dsAlias.trim() }),
    onSuccess: (res) => { void queryClient.invalidateQueries({ queryKey: ["data", workspaceId] }); setDsName(""); setDsUrl(""); setDrawerOpen(false); onToast(res.message); },
    onError: (err: Error) => onToast(err.message),
  });

  const handleRegister = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (dsName.trim() && dsUrl.trim() && dsAlias.trim()) registerMutation.mutate();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">已接入企业数据源（{dataSources.length}）</h2>
          <p className="text-[var(--muted-foreground)] mt-0.5">统一管理只读抽取、受控回写与联邦 SPARQL 端点，自动执行私网 SSRF 与凭据别名隔离。</p>
        </div>
        <button type="button" disabled={!canModel} title={!canModel ? ROLE_TIPS.model : undefined} onClick={() => setDrawerOpen(true)} className="shrink-0 px-3.5 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
          + 接入新数据源
        </button>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-5 space-y-2.5">
          {dataSources.map((ds) => {
            const isSelected = ds.id === activeDs?.id;
            return (
              <div key={ds.id} className={`p-3.5 rounded-xl bg-[var(--card)] space-y-2 transition ${isSelected ? "border-2 border-[var(--primary)]" : "border border-[var(--border)] hover:border-slate-300"}`}>
                <button type="button" onClick={() => setSelectedId(ds.id)} className="w-full text-left space-y-1 cursor-pointer">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{ds.name}</span>
                    <span className={`px-2 py-0.5 rounded font-medium ${ds.accessMode === "RDF_GSP" ? "bg-blue-500/10 text-blue-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                      {ds.accessMode === "RDF_GSP" ? "RDF 1.1 GSP" : `${ds.status} · 在线`}
                    </span>
                  </div>
                  <div className="text-[var(--muted-foreground)]">{ds.summaryText}</div>
                </button>
                <div className="pt-1.5 border-t border-[var(--border)] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={deleteMutation.isPending || !canModel}
                    title={!canModel ? ROLE_TIPS.model : undefined}
                    onClick={async () => {
                      const { confirmed } = await ask({ title: "删除企业数据源", description: `确认删除数据源「${ds.name}」吗？相关连接配置与未绑定快照将被移除。`, confirmLabel: "确认删除", tone: "danger" });
                      if (confirmed) deleteMutation.mutate(ds.id);
                    }}
                    className="px-2 py-1 rounded-md border border-rose-500/30 text-[11px] font-medium text-rose-600 hover:bg-rose-500/10 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                  >
                    删除
                  </button>
                  {onSwitchView && (
                    <button type="button" onClick={() => onSwitchView("modeling")} className="px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--background)] text-[11px] font-medium text-[var(--primary)] hover:bg-[var(--secondary)] cursor-pointer">
                      送入多源融合建模 →
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {activeDs && (
          <div className="col-span-7 rounded-xl bg-[var(--card)] border border-[var(--border)] p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{activeDs.name} · 连接与结构治理</h2>
                <p className="text-[var(--muted-foreground)] mt-0.5">数据库只保存凭据别名，真实密码从环境变量读取，并受 SSRF 私网地址白名单保护。</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button type="button" disabled={testMutation.isPending || !canOperate} title={!canOperate ? ROLE_TIPS.operate : undefined} onClick={() => testMutation.mutate()} className="px-3 py-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--secondary)] font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                  {testMutation.isPending ? "测试中..." : "测试连接"}
                </button>
                <button type="button" disabled={snapshotMutation.isPending || !canModel} title={!canModel ? ROLE_TIPS.model : undefined} onClick={() => snapshotMutation.mutate()} className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-medium whitespace-nowrap hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                  {snapshotMutation.isPending ? "采集中..." : "刷新结构快照"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg bg-[var(--secondary)]">
              <div>
                <span className="text-[var(--muted-foreground)]">连接端点地址：</span>
                <code className="font-mono block mt-0.5 truncate">{activeDs.connectionDisplayUrl}</code>
              </div>
              <div>
                <span className="text-[var(--muted-foreground)]">凭据环境变量别名：</span>
                <code className="font-mono block mt-0.5">SECRET_ALIAS: {activeDs.credentialAlias}</code>
              </div>
              <div className="col-span-2">
                <label htmlFor="ds-snapshot-select" className="block text-[var(--muted-foreground)]">已固化结构快照（带时间戳与表规模区分）：</label>
                <select id="ds-snapshot-select" name="snapshotId" value={activeSnap?.id ?? ""} onChange={(e) => setSelectedSnapId(e.target.value)} className="mt-1 w-full px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--card)] font-mono">
                  {activeDs.snapshots.map((snap) => <option key={snap.id} value={snap.id}>{snap.versionTag}</option>)}
                </select>
              </div>
            </div>

            {activeSnap && (
              <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
                <div className="flex items-center justify-between text-[var(--muted-foreground)]">
                  <span>快照表结构预览（{activeSnap.tableCount} 表 · {activeSnap.columnCount} 列 · 采集于 {activeSnap.capturedAt}）</span>
                  <code className="font-mono text-[11px]">{activeSnap.fingerprint}</code>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {activeSnap.tables.map((tbl) => (
                    <div key={`${tbl.schemaName}.${tbl.tableName}`} className="p-2 rounded bg-[var(--background)] border border-[var(--border)] space-y-1">
                      <div className="flex items-center justify-between">
                        <code className="font-mono font-semibold text-[var(--foreground)]">{tbl.schemaName}.{tbl.tableName}</code>
                        <span className="text-[var(--muted-foreground)]">约 {tbl.rowCountEstimate.toLocaleString()} 行</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {tbl.columns.map((col) => (
                          <span key={col.name} className="px-1.5 py-0.5 rounded bg-[var(--secondary)] font-mono text-[11px]">
                            {col.isPrimaryKey ? "🔑 " : ""}{col.name}:{col.sqlType}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <SlideOverDrawer
        open={drawerOpen}
        title="接入新外部企业数据源"
        subtitle="内置私网 SSRF 与危险 JDBC 参数拦截；数据库仅保存环境变量凭据别名，不落盘明文密码。"
        widthClass="max-w-lg"
        onClose={() => setDrawerOpen(false)}
        footer={
          <>
            <button type="button" onClick={() => setDrawerOpen(false)} className="px-3.5 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium hover:bg-[var(--secondary)] cursor-pointer">取消</button>
            <button type="submit" form="register-ds-form" disabled={registerMutation.isPending || !canModel} title={!canModel ? ROLE_TIPS.model : undefined} className="px-4 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
              {registerMutation.isPending ? "登记中..." : "登记并测试接入"}
            </button>
          </>
        }
      >
        <form id="register-ds-form" onSubmit={handleRegister} method="POST" className="space-y-4 text-xs">
          <label className="block space-y-1.5"><span className="font-medium">数据源名称</span><input id="new-ds-name" type="text" required value={dsName} onChange={(e) => setDsName(e.target.value)} placeholder="财务核算只读库" className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5"><span className="font-medium">协议类型</span><select id="new-ds-kind" value={dsKind} onChange={(e) => setDsKind(e.target.value as DataSource["kind"])} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]">{CONNECTOR_KINDS.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}</select></label>
            <label className="block space-y-1.5"><span className="font-medium">读写治理模式</span><select id="new-ds-mode" value={dsMode} onChange={(e) => setDsMode(e.target.value as typeof dsMode)} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]"><option value="READ_ONLY">READ_ONLY 只读</option><option value="READ_WRITE">READ_WRITE 受控写</option><option value="RDF_GSP">RDF_GSP 联邦</option></select></label>
          </div>
          <label className="block space-y-1.5"><span className="font-medium">连接地址 (公网域名 / JDBC)</span><input id="new-ds-url" type="text" required value={dsUrl} onChange={(e) => setDsUrl(e.target.value)} autoCorrect="off" autoCapitalize="none" spellCheck={false} placeholder="https://erp.caict.example/v1" className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono" /></label>
          <label className="block space-y-1.5"><span className="font-medium">凭据环境变量别名</span><input id="new-ds-alias" type="text" required value={dsAlias} onChange={(e) => setDsAlias(e.target.value)} autoCorrect="off" autoCapitalize="none" spellCheck={false} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono" /></label>
        </form>
      </SlideOverDrawer>
      {confirmDialogNode}
    </div>
  );
}
