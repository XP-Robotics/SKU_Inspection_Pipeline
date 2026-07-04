import type { ReactNode } from "react";
import { ApiError } from "../api/client";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: Error;
  onRetry?: () => void;
}) {
  const isContract =
    error instanceof ApiError && error.message.includes("did not match the API contract");
  return (
    <div className="state state--error" role="alert">
      <div className="state__title">
        {isContract ? "API contract mismatch" : "Something went wrong"}
      </div>
      <div className="state__msg">{error.message}</div>
      {error instanceof ApiError && error.detail && (
        <pre className="state__detail">{error.detail}</pre>
      )}
      {isContract && (
        <div className="state__hint">
          The backend response did not match <code>openapi/openapi.yaml</code>. Flag this
          to the backend chat rather than working around it.
        </div>
      )}
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="state state--empty">{children}</div>;
}

/** Convenience wrapper for the load → error → empty → data lifecycle. */
export function AsyncBoundary<T>({
  state,
  children,
  empty,
  loadingLabel,
}: {
  state: { data: T | undefined; loading: boolean; error: Error | undefined; reload: () => void };
  children: (data: T) => ReactNode;
  empty?: (data: T) => boolean;
  loadingLabel?: string;
}) {
  if (state.loading && state.data === undefined) return <Spinner label={loadingLabel} />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.data === undefined) return <Spinner label={loadingLabel} />;
  if (empty?.(state.data)) return <EmptyState>Nothing here yet.</EmptyState>;
  return <>{children(state.data)}</>;
}
