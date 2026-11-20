import type { Workspace } from "../api/types";
import { ModalDialog } from "../shell/ModalDialog";

export const ONBOARDING_STEPS = [
  {
    id: "step-doc",
    role: "本体工程师",
    title: "1. 上传业务制度文档并抽取候选本体提案",
    desc: "在「向导建模与资料」解析 PDF/Word 条款，生成带 PROV-O 字符坐标的 ChangeSet 提案。",
  },
  {
    id: "step-canvas",
    role: "本体工程师",
    title: "2. 在专家画布细化 OWL 类关系与 SHACL 形状",
    desc: "通过可视化连线建立对象属性、配置闭合数值约束并开启 OWL 2 EL 推理隐式边核查。",
  },
  {
    id: "step-data",
    role: "交付架构师 (FDE)",
    title: "3. 接入企业数据源并执行 ABox 持续物化",
    desc: "绑定只读凭据别名、配置字段脱敏映射并运行水位线增量同步，隔离区异常一键重放。",
  },
  {
    id: "step-dag",
    role: "交付架构师 (FDE)",
    title: "4. 编排受控动作 DAG 并通过基准回归评测",
    desc: "设置 READ / DRAFT / CONFIRM / APPROVE 四级门禁与写后 SHACL 核验，按需暴露只读 MCP。",
  },
  {
    id: "step-release",
    role: "审核员 / 业务人员",
    title: "5. 完成三层质量诊断、职责分离签署与门户应用",
    desc: "由独立审核人签署发布不可变方案包 (.zip)，业务人员在受治理门户按条款证据确认执行。",
  },
] as const;

interface TutorialDialogProps {
  open: boolean;
  completedIds: string[];
  onToggleStep: (stepId: string) => void;
  onClose: () => void;
}

export function TutorialDialog({
  open,
  completedIds,
  onToggleStep,
  onClose,
}: TutorialDialogProps) {
  return (
    <ModalDialog open={open} onClose={onClose} titleId="tut-title" maxWidthClass="max-w-lg">
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 id="tut-title" className="text-base font-semibold">
            角色快速上手指南
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-[var(--secondary)] text-xs font-mono text-[var(--muted-foreground)]">
            {completedIds.length}/{ONBOARDING_STEPS.length} 已完成
          </span>
        </div>
        <button
          type="button"
          aria-label="关闭教程"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[var(--secondary)] text-xs cursor-pointer"
        >
          ✕
        </button>
      </div>
      <div className="p-5 space-y-2.5 text-xs leading-relaxed">
        <p className="text-[var(--muted-foreground)]">
          点击任意步骤可标记完成进度，帮助团队成员快速走通语义工程全闭环：
        </p>
        {ONBOARDING_STEPS.map((step) => {
          const done = completedIds.includes(step.id);
          return (
            <button
              key={step.id}
              type="button"
              aria-pressed={done}
              onClick={() => onToggleStep(step.id)}
              className={`w-full text-left p-3 rounded-xl border transition cursor-pointer flex items-start gap-2.5 ${
                done
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-[var(--secondary)] border-transparent hover:border-[var(--border)]"
              }`}
            >
              <span
                className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                  done
                    ? "bg-emerald-600 text-white"
                    : "border border-[var(--muted-foreground)] text-transparent"
                }`}
              >
                ✓
              </span>
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <strong className={done ? "line-through text-[var(--muted-foreground)]" : ""}>
                    {step.title}
                  </strong>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--card)] text-[10px] text-[var(--muted-foreground)] shrink-0">
                    {step.role}
                  </span>
                </div>
                <div className="text-[var(--muted-foreground)]">{step.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </ModalDialog>
  );
}

interface ContractProvenanceDialogProps {
  open: boolean;
  onClose: () => void;
  workspace?: Workspace;
}

export function ContractProvenanceDialog({
  open,
  onClose,
  workspace,
}: ContractProvenanceDialogProps) {
  return (
    <ModalDialog open={open} onClose={onClose} titleId="contract-title" maxWidthClass="max-w-lg">
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <h2 id="contract-title" className="text-base font-semibold">
          底层语义契约与版本溯源信息
        </h2>
        <button
          type="button"
          aria-label="关闭契约说明"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[var(--secondary)] text-xs cursor-pointer"
        >
          ✕
        </button>
      </div>
      <div className="p-5 space-y-3 text-xs leading-relaxed">
        {workspace && (
          <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--background)] space-y-1 font-mono">
            <div>工作空间: {workspace.name} ({workspace.slug})</div>
            <div>命名空间 IRI: {workspace.namespaceIri}</div>
            <div>当前活跃修订: {workspace.activeRevisionId}</div>
            <div>已发布修订: {workspace.publishedRevisionId ?? "尚未发布"}</div>
          </div>
        )}
        <div className="p-3 rounded-lg bg-[var(--secondary)] space-y-1.5">
          <div className="font-semibold text-[var(--foreground)]">W3C 互操作与治理标准栈</div>
          <div className="font-mono text-[var(--muted-foreground)] space-y-1">
            <div>· 语义序列化：RDF 1.1 Turtle / JSON-LD / RDF-XML</div>
            <div>· 推理与校验：OWL 2 EL 一致性检查 · SHACL 闭合形状门禁</div>
            <div>· 证据与血缘：PROV-O 字符级文档锚点 · SHA-256 不可变清单</div>
            <div>· 应用与安全：受控动作 DAG 四级自治 · RBAC 角色列掩码 · 异人 SoD</div>
          </div>
        </div>
        <p className="text-[var(--muted-foreground)]">
          所有命名空间 IRI、修订快照哈希与校验协议契约均可随时在此核验，支持标准方案包跨环境零密钥还原与 Protégé 无损互操作。
        </p>
      </div>
    </ModalDialog>
  );
}
