// DWD-Wetterwarnungen (amtlich, ohne Schlüssel) für Stadt + Landkreis Regensburg.
// Quelle: https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json (JSONP, Kreis-Ebene: "1" + AGS)
// Fällt die Quelle aus, steht das rot im Quellen-Panel – die Seite läuft trotzdem weiter.

import { cacheGet, cacheSet, cacheStale } from "./cache";
import type { SourceStatus, TrafficItem } from "./types";

const URL_DWD = "https://www.dwd.de/DWD/warnungen/warnapp/json/warnings.json";
const CELLS = ["109362000", "109375000"]; // Regensburg Stadt, Landkreis Regensburg
const TTL = 10 * 60 * 1000;

type DwdWarning = { start?: number; end?: number; event?: string; headline?: string; level?: number };

const st = (ok: boolean, detail: string): SourceStatus => ({
  key: "dwd",
  label: "Wetterwarnungen (DWD)",
  ok,
  detail,
  fetchedAt: null,
});

function fmt(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function getDwdWarnings(): Promise<{ items: TrafficItem[]; status: SourceStatus }> {
  const cached = cacheGet<TrafficItem[]>("dwd");
  if (cached) return { items: cached, status: st(true, cached.length ? `${cached.length} Warnung(en) aktiv` : "keine Warnungen") };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(URL_DWD, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await res.text();
    const json = JSON.parse(txt.slice(txt.indexOf("(") + 1, txt.lastIndexOf(")"))) as {
      warnings?: Record<string, DwdWarning[]>;
    };
    const now = Date.now();
    const seen = new Set<string>();
    const items: TrafficItem[] = [];
    for (const cell of CELLS) {
      for (const w of json.warnings?.[cell] ?? []) {
        if (!w.event || (w.end && w.end < now)) continue;
        const id = `dwd:${w.event}:${w.start}`;
        if (seen.has(id)) continue;
        seen.add(id);
        items.push({
          id,
          kind: "stoerung",
          title: `DWD: ${w.event}`,
          detail: w.headline ?? "",
          timeLabel: `${fmt(w.start)} – ${fmt(w.end)}`,
          source: "Deutscher Wetterdienst",
          url: "https://www.dwd.de/DE/wetter/warnungen_gemeinden/warnWetter_node.html",
          publishedAt: w.start ? new Date(w.start).toISOString() : null,
          trafficRelevant: true,
        });
      }
    }
    cacheSet("dwd", items, TTL);
    return { items, status: st(true, items.length ? `${items.length} Warnung(en) aktiv` : "keine Warnungen") };
  } catch (e) {
    const stale = cacheStale<TrafficItem[]>("dwd");
    return { items: stale ?? [], status: st(false, `nicht erreichbar (${e instanceof Error ? e.message : "Fehler"})`) };
  }
}
