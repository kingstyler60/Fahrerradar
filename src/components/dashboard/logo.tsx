// Eigenständiges Logo für FahrerRadar: Radar-Glyph in Uber-Grün auf Schwarz.
// Bewusst eigenes Design (kein Uber-Markenlogo), aber im Uber-Look.

import { Radar } from "lucide-react";

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl bg-black ring-1 ring-zinc-700/80"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Radar className="text-[#06C167]" style={{ width: size * 0.62, height: size * 0.62 }} strokeWidth={2.4} />
    </span>
  );
}

export function Wordmark({ sub }: { sub?: string }) {
  return (
    <div className="leading-none">
      <div className="text-lg font-black tracking-tight text-white">
        Fahrer<span className="text-[#06C167]">Radar</span>
      </div>
      {sub && <div className="mt-1 text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}
