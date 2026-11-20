import { useMemo, useState, type KeyboardEvent } from "react";
import type {
  EngineeringViewId,
  OntologyClass,
  OntologyMode,
  PersonaMode,
  PortalAppId,
} from "../api/types";
import { ModalDialog } from "../shell/ModalDialog";
import { getWorkspaceCopy } from "../utils/workspaceCopy";

interface CommandPaletteDialogProps {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
  ontologyClasses: OntologyClass[];
  onNavigateEngineering: (view: EngineeringViewId, mode?: OntologyMode, entityLocalName?: string) => void;
  onNavigatePortal: (app: PortalAppId) => void;
  onSwitchPersona: (persona: PersonaMode) => void;
}

interface CommandActionItem {
  id: string;
  prefix: string;
  title: string;
  badge: string;
  keywords: string;
  run: () => void;
}

export function CommandPaletteDialog({
  open,
  workspaceId,
  onClose,
  ontologyClasses,
  onNavigateEngineering,
  onNavigatePortal,
  onSwitchPersona,
}: CommandPaletteDialogProps) {
  const [query, setQuery] = useState("");
  const copy = getWorkspaceCopy(workspaceId);

  const items = useMemo<CommandActionItem[]>(() => {
    const base: CommandActionItem[] = [
      {
        id: "nav-overview",
        prefix: "前往：",
        title: "总览、CQ 目标与团队待办中心",
        badge: "模块 1",
        keywords: "overview cq 任务 待办 总览",
        run: () => onNavigateEngineering("overview"),
      },
      {
        id: "nav-modeling",
        prefix: "前往：",
        title: "AI 辅助资料建模与资产库",
        badge: "模块 2",
        keywords: "modeling wizard pdf 文档 抽取 资产",
        run: () => onNavigateEngineering("modeling"),
      },
      {
        id: "nav-turtle",
        prefix: "查看：",
        title: `${copy.domainLabel} RDF Turtle 源码`,
        badge: "模块 3",
        keywords: "ontology turtle rdf owl shacl 源码 画布",
        run: () => onNavigateEngineering("ontology", "turtle"),
      },
      {
        id: "nav-diff",
        prefix: "查看：",
        title: "本体版本语义 Diff 对比",
        badge: "模块 3",
        keywords: "diff revision 变更 对比",
        run: () => onNavigateEngineering("ontology", "diff"),
      },
      {
        id: "nav-data",
        prefix: "前往：",
        title: "数据接入、字段映射与 ABox 物化 (含 SPARQL)",
        badge: "模块 4",
        keywords: "data sparql postgres mapping abox 物化 隔离",
        run: () => onNavigateEngineering("data"),
      },
      {
        id: "nav-apps",
        prefix: "前往：",
        title: "语义应用、受控动作 DAG 与 MCP 暴露",
        badge: "模块 5",
        keywords: "apps dag mcp copilot 评测 沙盒",
        run: () => onNavigateEngineering("apps"),
      },
      {
        id: "nav-release",
        prefix: "前往：",
        title: "W3C 三层质量诊断与独立签署发布",
        badge: "模块 6",
        keywords: "release sod zip 质量 发布 签署",
        run: () => onNavigateEngineering("release"),
      },
      {
        id: "nav-gov",
        prefix: "前往：",
        title: "模型路由、成员 RBAC 与不可变审计",
        badge: "模块 7",
        keywords: "governance model rbac audit 审计 权限 容量",
        run: () => onNavigateEngineering("governance"),
      },
      {
        id: "portal-contract",
        prefix: "体验：",
        title: "受治理合同到期处置智能门户",
        badge: "业务门户",
        keywords: "portal contract 门户 合同 续签",
        run: () => {
          onSwitchPersona("portal");
          onNavigatePortal("contract");
        },
      },
      {
        id: "portal-itu",
        prefix: "体验：",
        title: "ITU 国际标准提案合规审查门户",
        badge: "业务门户",
        keywords: "portal itu 标准 提案 shall should",
        run: () => {
          onSwitchPersona("portal");
          onNavigatePortal("itu");
        },
      },
    ];

    const classItems: CommandActionItem[] = ontologyClasses.map((cls) => ({
      id: `cls-${cls.localName}`,
      prefix: "定位实体类：",
      title: `${cls.labelZh} (ont:${cls.localName})`,
      badge: "TBox 类",
      keywords: `${cls.labelZh} ${cls.localName} ${cls.labelEn}`,
      run: () => onNavigateEngineering("ontology", "graph", cls.localName),
    }));

    return [...base, ...classItems];
  }, [copy.domainLabel, ontologyClasses, onNavigateEngineering, onNavigatePortal, onSwitchPersona]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 8);
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.badge.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q)
    );
  }, [items, query]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      const first = filtered[0];
      if (first) {
        first.run();
        onClose();
      }
    }
  };

  return (
    <ModalDialog open={open} onClose={onClose} titleId="cmd-title" maxWidthClass="max-w-lg">
      <search className="p-3.5 border-b border-[var(--border)] flex items-center gap-2.5">
        <h2 id="cmd-title" className="sr-only">
          全局命令与快速跳转
        </h2>
        <label htmlFor="cmd-palette-input" className="sr-only">
          搜索模块、本体类或工具
        </label>
        <input
          id="cmd-palette-input"
          name="commandQuery"
          type="search"
          autoFocus
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入模块名、本体类、受控动作或 SPARQL 工具..."
          className="flex-1 bg-transparent text-sm focus:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          className="px-1.5 py-0.5 rounded bg-[var(--secondary)] text-xs text-[var(--muted-foreground)] cursor-pointer"
        >
          Esc
        </button>
      </search>

      <div className="p-2 text-xs space-y-1 max-h-[360px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-[var(--muted-foreground)]">未找到匹配的模块或语义资产</div>
        ) : (
          filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                item.run();
                onClose();
              }}
              className="w-full flex justify-between items-center px-3 py-2 rounded-lg hover:bg-[var(--secondary)] text-left cursor-pointer"
            >
              <span>
                {item.prefix}
                <strong>{item.title}</strong>
              </span>
              <span className="text-[var(--muted-foreground)] shrink-0 ml-2">{item.badge}</span>
            </button>
          ))
        )}
      </div>
    </ModalDialog>
  );
}
