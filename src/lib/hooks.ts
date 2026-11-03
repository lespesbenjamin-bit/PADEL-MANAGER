"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { newOpKey } from "./api";

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const d = await fn();
      if (id === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}

/**
 * Clé d'idempotence : la même clé est réutilisée tant que l'opération n'a pas réussi
 * (double clic, réseau coupé, nouvel essai) puis renouvelée.
 */
export function useOpKey() {
  const ref = useRef<string>("");
  if (!ref.current) ref.current = newOpKey();
  return {
    get: () => ref.current,
    renew: () => { ref.current = newOpKey(); },
  };
}
