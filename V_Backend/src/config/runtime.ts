// src/config/runtime.ts

function toInt(v: string | undefined): number | null {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  
  function toNumber(v: string | undefined): number | null {
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  
  export function envInt(name: string, fallback: number, opts?: { min?: number; max?: number }) {
    const raw = toInt(process.env[name]);
    let n = raw ?? fallback;
    if (opts?.min != null) n = Math.max(opts.min, n);
    if (opts?.max != null) n = Math.min(opts.max, n);
    return n;
  }
  
  export function envNumber(name: string, fallback: number, opts?: { min?: number; max?: number }) {
    const raw = toNumber(process.env[name]);
    let n = raw ?? fallback;
    if (opts?.min != null) n = Math.max(opts.min, n);
    if (opts?.max != null) n = Math.min(opts.max, n);
    return n;
  }
  
  export function queryInt(value: any, fallback: number, opts?: { min?: number; max?: number }) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    let out = Math.trunc(n);
    if (opts?.min != null) out = Math.max(opts.min, out);
    if (opts?.max != null) out = Math.min(opts.max, out);
    return out;
  }
  