import { useCallback, useEffect, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
}

/**
 * Minimal fetch-on-mount hook. Deliberately dependency-free (no react-query) to
 * keep the surface small; swap in a cache later if needed. `deps` re-runs the
 * loader, matching useEffect semantics.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList,
): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [nonce, setNonce] = useState(0);

  // loader identity is controlled by the caller-supplied deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(undefined);
    run()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [run, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}
