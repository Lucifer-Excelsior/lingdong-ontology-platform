import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { AuthModeResponse, HttpStatusError } from "../api/ga-client";

interface LoginViewProps {
  authMode?: AuthModeResponse;
  onAuthenticated: (message?: string) => void;
  onBackToDevWorkspace?: () => void;
}

export function LoginView({
  authMode,
  onAuthenticated,
  onBackToDevWorkspace,
}: LoginViewProps) {
  const [username, setUsername] = useState("林远");
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorState, setErrorState] = useState<{ status?: number; message: string } | null>(null);

  const isProd = authMode?.appEnv === "production";
  const showDemoHint = import.meta.env.DEV && !isProd && Boolean(authMode?.demoSwitcherEnabled);
  const oidcReady = Boolean(authMode?.oidcConfigured && authMode?.oidcLoginUrl);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!username.trim() || !passcode) {
      setErrorState({ message: "请输入企业账号与安全口令" });
      return;
    }
    setSubmitting(true);
    setErrorState(null);
    try {
      const res = await api.enterpriseLogin({
        username: username.trim(),
        passcode,
      });
      onAuthenticated(res.message);
    } catch (err) {
      const httpErr = err as HttpStatusError;
      setErrorState({
        status: httpErr.status,
        message: httpErr.message || "登录失败，请检查账号或口令",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOidcLogin = () => {
    if (authMode?.oidcLoginUrl) {
      window.location.assign(authMode.oidcLoginUrl);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5">
        <div className="rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xl overflow-hidden">
          <div className="px-7 pt-7 pb-5 border-b border-[var(--border)] bg-[var(--secondary)]/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                灵
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-semibold tracking-tight text-[var(--foreground)]">
                  灵·洞本体工作站 · V4.0 Enterprise GA
                </h1>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  企业级语义建模、知识图谱治理与受控智能体平台
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
              <span
                className={`px-2 py-0.5 rounded-full font-medium ${
                  isProd
                    ? "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20"
                    : "bg-blue-500/10 text-blue-700 border border-blue-500/20"
                }`}
              >
                {isProd ? "生产强鉴权模式 (HttpOnly Session)" : "开发评估模式 (可验证生产登录)"}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)] font-mono">
                {authMode?.auditHashAlgo === "SM3" ? "国密 SM3 审计链" : "SHA-256 审计链"}
              </span>
            </div>
          </div>

          <div className="p-7 space-y-5">
            <div className="space-y-2">
              <button
                type="button"
                disabled={!oidcReady}
                onClick={handleOidcLogin}
                className={`w-full py-2.5 px-4 rounded-xl border text-xs font-medium flex items-center justify-between transition ${
                  oidcReady
                    ? "border-[var(--primary)]/40 bg-[var(--primary)]/5 text-[var(--foreground)] hover:bg-[var(--primary)]/10 cursor-pointer"
                    : "border-[var(--border)] bg-[var(--secondary)]/60 text-[var(--muted-foreground)] cursor-not-allowed"
                }`}
              >
                <span>企业单点登录 (OIDC / SSO)</span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                    oidcReady
                      ? "bg-emerald-500/15 text-emerald-700"
                      : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)]"
                  }`}
                >
                  {oidcReady ? "已接入 IdP →" : authMode?.oidcConfigured ? "已配置 JWKS" : "未配置 IdP"}
                </span>
              </button>
              {!oidcReady && (
                <p className="text-[11px] text-[var(--muted-foreground)] px-1">
                  如需启用企微/钉钉/Keycloak 单点登录，请在部署环境配置{" "}
                  <code className="font-mono">OIDC_ISSUER_URL</code> 与{" "}
                  <code className="font-mono">OIDC_LOGIN_URL</code>。
                </p>
              )}
            </div>

            <div className="relative flex items-center">
              <div className="flex-1 border-t border-[var(--border)]" />
              <span className="px-3 text-[11px] text-[var(--muted-foreground)]">或使用本地企业账号登录</span>
              <div className="flex-1 border-t border-[var(--border)]" />
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="ga-login-username" className="block text-xs font-medium text-[var(--foreground)]">
                  企业账号 / 姓名
                </label>
                <input
                  id="ga-login-username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入姓名或账号 ID，例如：林远"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="ga-login-passcode" className="block text-xs font-medium text-[var(--foreground)]">
                  安全口令
                </label>
                <div className="relative">
                  <input
                    id="ga-login-passcode"
                    type={showPasscode ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="请输入企业安全口令"
                    className="w-full px-3.5 py-2.5 pr-14 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                  />
                  <button
                    type="button"
                    aria-label={showPasscode ? "隐藏口令" : "显示口令"}
                    onClick={() => setShowPasscode((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                  >
                    {showPasscode ? "隐藏" : "显示"}
                  </button>
                </div>
              </div>

              {errorState && (
                <div
                  role="alert"
                  className={`p-3 rounded-xl border text-xs leading-relaxed ${
                    errorState.status === 429
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-800"
                      : "bg-red-500/10 border-red-500/30 text-red-700"
                  }`}
                >
                  <div className="font-semibold">
                    {errorState.status === 429
                      ? "触发防爆破锁定保护 (HTTP 429)"
                      : errorState.status === 401
                      ? "身份认证未通过 (HTTP 401)"
                      : "登录请求异常"}
                  </div>
                  <div className="mt-0.5">{errorState.message}</div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium shadow-sm hover:opacity-95 disabled:opacity-50 cursor-pointer transition"
              >
                {submitting ? "正在签发 HttpOnly 会话..." : "登录企业工作站"}
              </button>
            </form>

            {import.meta.env.DEV && showDemoHint && (
              <div className="p-3 rounded-xl bg-[var(--secondary)]/70 border border-[var(--border)] flex items-center justify-between gap-2 text-[11px]">
                <div className="text-[var(--muted-foreground)]">
                  评估默认管理员：<code className="font-mono text-[var(--foreground)]">林远</code> /{" "}
                  <code className="font-mono text-[var(--foreground)]">Lingdong@2026</code>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUsername("林远");
                    setPasscode("Lingdong@2026");
                    setErrorState(null);
                  }}
                  className="px-2 py-1 rounded-md bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--secondary)] shrink-0 cursor-pointer"
                >
                  一键填入
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-1 text-[11px] text-[var(--muted-foreground)]">
          <span>HMAC-SHA256 签名会话 · 防暴力破解锁定 · 等保三员分立</span>
          {onBackToDevWorkspace && (
            <button
              type="button"
              onClick={onBackToDevWorkspace}
              className="text-[var(--primary)] hover:underline cursor-pointer"
            >
              返回开发工作台
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
