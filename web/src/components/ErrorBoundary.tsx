import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches render errors and — the common one in production — a lazy route
 * chunk that 404s because the user's tab was open across a deploy. Without
 * this, both cases paint a blank white page mid-audit.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[app] render error", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isChunkError = /dynamically imported module|Importing a module script failed|ChunkLoadError/i
      .test(error.message ?? "");

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="card p-5 max-w-sm w-full space-y-3 text-center">
          <h1 className="font-semibold text-lg">
            {isChunkError ? "A new version is available" : "Something went wrong"}
          </h1>
          <p className="text-sm text-slate-600">
            {isChunkError
              ? "Reload to pick up the latest version of the app."
              : "The page hit an unexpected error. Reloading usually clears it."}
          </p>
          <button className="btn-primary w-full" onClick={() => window.location.reload()}>
            Reload
          </button>
          <details className="text-left">
            <summary className="text-xs text-slate-400 cursor-pointer">Details</summary>
            <pre className="mt-1 text-[11px] text-slate-500 whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
