import { useEffect, useMemo, useState } from "react";

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

interface CountUpOptions {
  durationMs?: number;
  decimals?: number;
  reducedMotion?: boolean;
}

export function useCountUp(target: number, options: CountUpOptions = {}) {
  const { durationMs = 1200, decimals = 0, reducedMotion = false } = options;
  const [value, setValue] = useState(reducedMotion ? target : 0);

  useEffect(() => {
    if (reducedMotion) {
      setValue(target);
      return;
    }

    let raf = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(progress);
      const next = target * eased;
      setValue(next);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, reducedMotion, target]);

  return useMemo(() => Number(value.toFixed(decimals)), [decimals, value]);
}
