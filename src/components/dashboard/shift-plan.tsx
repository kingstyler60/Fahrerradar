"use client";

// Schicht-Kompass: ganz oben – wann anfangen, wann ruhig, wann Feierabend, wie startet morgen.
import type { DemandResponse, HourScore } from "@/lib/sources/types";

type Block = { start: number; end: number; peak: number; avg: number; why: string[] };

const hh = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;

function nextKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

function findBlocks(hours: HourScore[], dateKey: string): Block[] {
  const nk = nextKey(dateKey);
  const hs = [
    ...hours.filter((h) => h.dateKey === dateKey && h.hour >= 5).map((h) => ({ ...h, t: h.hour })),
    ...hours.filter((h) => h.dateKey === nk && h.hour <= 3).map((h) => ({ ...h, t: h.hour + 24 })),
  ].sort((a, b) => a.t - b.t);
  if (!hs.length) return [];
  const thr = Math.max(40, Math.round(Math.max(...hs.map((h) => h.score)) * 0.7));
  const runs: (typeof hs)[] = [];
  let cur: typeof hs = [];
  let gap = 0;
  for (const h of hs) {
    if (h.score >= thr) {
      cur.push(h);
      gap = 0;
    } else if (cur.length && gap < 1) {
      gap++;
      cur.push(h);
    } else {
      if (cur.length) runs.push(cur);
      cur = [];
      gap = 0;
    }
  }
  if (cur.length) runs.push(cur);
  return runs
    .map((r) => {
      while (r.length && r[r.length - 1].score < thr) r = r.slice(0, -1);
      const labels = new Map<string, number>();
      for (const h of r) for (const c of h.reasons) labels.set(c.label, Math.max(labels.get(c.label) ?? 0, Math.abs(c.weight)));
      return {
        start: r[0].t,
        end: r[r.length - 1].t + 1,
        peak: Math.max(...r.map((h) => h.score)),
        avg: Math.round(r.reduce((s, h) => s + h.score, 0) / r.length),
        why: [...labels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([l]) => l),
      };
    })
    .filter((b) => b.end - b.start >= 2 || b.peak >= 60);
}

function Rows({ blocks, cur }: { blocks: Block[]; cur: number | null }) {
  return (
    <ol className="space-y-2">
      {blocks.map((b, i) => {
        const past = cur !== null && b.end <= cur;
        const live = cur !== null && b.start <= cur && cur < b.end;
        const prev = blocks[i - 1];
        return (
          <li key={b.start} className={past ? "opacity-40" : ""}>
            {prev && b.start > prev.end && (
              <p className="mb-2 text-sm text-zinc-400">
                ⏸ Ruhig {hh(prev.end)}–{hh(b.start)} · Pause: essen, tanken, laden
              </p>
            )}
            <div className={`rounded-xl border px-3 py-2 ${live ? "border-[#06C167] bg-[#06C167]/10" : "border-white/10 bg-white/5"}`}>
              <p className="font-semibold text-white">
                ▶ Fahren {hh(b.start)}–{hh(b.end)}
                <span className="ml-2 text-sm font-normal text-zinc-300">Ø {b.avg} · Spitze {b.peak}</span>
                {live && <span className="ml-2 text-sm text-[#06C167]">läuft gerade!</span>}
              </p>
              {b.why.length > 0 && <p className="text-xs text-zinc-400">{b.why.join(" · ")}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ShiftPlan({ data }: { data: DemandResponse }) {
  const today = data.berlinNow.dateKey;
  const cur = data.berlinNow.hour;
  const tb = findBlocks(data.hours, today);
  const mb = findBlocks(data.hours, nextKey(today));
  const live = tb.find((b) => b.start <= cur && cur < b.end);
  const next = tb.find((b) => b.start > cur);
  const last = tb[tb.length - 1];
  const head = live
    ? `Jetzt fahren – bis ${hh(live.end)}`
    : next
      ? `Start um ${hh(next.start)} (Spitze ${next.peak})`
      : "Feierabend – heute kommt nichts Gutes mehr";
  const tomorrow = data.days.find((d) => d.dateKey === nextKey(today));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Heute</p>
        <h3 className="mb-3 text-xl font-black text-white">{head}</h3>
        {tb.length ? <Rows blocks={tb} cur={cur} /> : <p className="text-zinc-400">Ganzer Tag ruhig.</p>}
        {last && (
          <p className="mt-3 text-sm font-semibold text-amber-300">
            ■ Feierabend ab {hh(last.end)}
            {last.end > 24 ? " (Nacht)" : ""} – danach lohnt es kaum.
          </p>
        )}
      </div>
      <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Morgen {tomorrow ? `· ${tomorrow.verdict}` : ""}</p>
        <h3 className="mb-3 text-xl font-black text-white">
          {mb.length ? `Morgen starten um ${hh(mb[0].start)}` : "Morgen eher ruhig"}
        </h3>
        {mb.length > 0 && <Rows blocks={mb} cur={null} />}
      </div>
    </div>
  );
}
