// Eigenständiges Logo für FahrerRadar: Radar-Glyph in Grün auf Schwarz.

import { Radar } from "lucide-react";

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-black ring-1 ring-white/15"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Radar className="text-[#06C167]" style={{ width: size * 0.6, height: size * 0.6 }} strokeWidth={2.2} />
    </span>
  );
}

export function Wordmark({ sub }: { sub?: string }) {
  return (
    <div className="leading-none">
      <div className="text-lg font-semibold tracking-tight text-white">
        Fahrer<span className="text-[#06C167]">Radar</span>
      </div>
      {sub && <div className="mt-1 truncate text-xs tabular-nums text-zinc-400">{sub}</div>}
    </div>
  );
}
