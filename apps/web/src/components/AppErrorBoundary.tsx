import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary] Uncaught render error:", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const message = this.state.error?.message || "页面渲染遇到未预期异常";

    return (
      <div className="min-h-screen w-full bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center p-6">
        <div
          role="alert"
          className="w-full max-w-md rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-lg overflow-hidden"
        >
          <div className="px-6 pt-6 pb-4 border-b border-[var(--border)] bg-[var(--secondary)]/40 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 flex items-center justify-center font-bold text-base shrink-0">
              !
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-[var(--foreground)]">工作站页面渲染异常</h1>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                已拦截未捕获的前端渲染错误，避免工作站白屏
              </p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 text-xs text-rose-700 font-mono break-words max-h-36 overflow-y-auto">
              {message}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium shadow-sm hover:opacity-95 cursor-pointer transition"
              >
                重新加载工作站
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="py-2.5 px-3.5 rounded-xl bg-[var(--secondary)] border border-[var(--border)] text-[var(--foreground)] text-xs font-medium hover:bg-[var(--border)]/60 cursor-pointer transition"
              >
                尝试恢复
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
