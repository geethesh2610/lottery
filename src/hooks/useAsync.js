import { useCallback, useEffect, useRef, useState } from 'react';

/** Runs an async function on mount / when deps change. Ignores stale results. */
export function useAsync(fn, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const callId = useRef(0);

  const run = useCallback(async () => {
    const id = ++callId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (id === callId.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (id === callId.current) setState({ data: null, error, loading: false });
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (enabled) run();
    else setState({ data: null, error: null, loading: false });
  }, [run, enabled]);

  return { ...state, reload: run };
}
