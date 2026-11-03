// Live-Bahnankünfte, Verspätungen und Zugausfälle am Hauptbahnhof Regensburg (EVA 8000309).
// Nutzt die öffentliche Transport-REST-Schnittstelle (kostenlos, ohne API-Key).
// Wenn ICE/IC/RE-Züge stark verspätet sind oder ausfallen, steigt die Nachfrage am Hbf sofort.

import { cacheGet, cacheSet, cacheStale } from "./cache";
import type { SourceStatus, TrafficItem } from "./types";

const REGENSBURG_HBF_ID = "8000309";
const TTL = 10 * 60 * 1000; // 10 Minuten Cache

export type BahnLiveResult = {
  scoreBoostNow: number;
  scoreBoostNextHour: number;
  chipLabel: string | null;
  hotspotDetail: string | null;
  trafficItems: TrafficItem[];
  status: SourceStatus;
};

type DbArrival = {
  tripId?: string;
  when?: string | null;
  plannedWhen?: string | null;
  delay?: number | null; // Sekunden
  cancelled?: boolean;
  origin?: string;
  line?: {
    name?: string;
    product?: string; // "nationalExpress" (ICE), "national" (IC/EC), "regionalExpress" (RE/alex), "regional"
  };
};

export async function getBahnRegensburg(): Promise<BahnLiveResult> {
  const key = "bahn:regensburg:v1";
  const cached = cacheGet<Omit<BahnLiveResult, "status"> & { statusDetail: string }>(key);
  if (cached) {
    return {
      scoreBoostNow: cached.scoreBoostNow,
      scoreBoostNextHour: cached.scoreBoostNextHour,
      chipLabel: cached.chipLabel,
      hotspotDetail: cached.hotspotDetail,
      trafficItems: cached.trafficItems,
      status: {
        key: "bahn",
        label: "Deutsche Bahn Live (Regensburg Hbf)",
        ok: true,
        detail: `Cache · ${cached.statusDetail}`,
        fetchedAt: null,
      },
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const url = `https://v6.db.transport.rest/stops/${REGENSBURG_HBF_ID}/arrivals?duration=90&results=35&linesOfStops=false&remarks=false`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "User-Agent": "FahrerRadar/1.0", Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { arrivals?: DbArrival[] } | DbArrival[];
    const list: DbArrival[] = Array.isArray(data) ? data : (data.arrivals ?? []);

    let delayedFern = 0;
    let delayedRegio = 0;
    let cancelled = 0;
    const notableNames: string[] = [];

    for (const a of list) {
      const prod = a.line?.product ?? "";
      const isFern = prod === "nationalExpress" || prod === "national";
      const isRE = prod === "regionalExpress" || (a.line?.name ?? "").startsWith("RE") || (a.line?.name ?? "").toLowerCase().includes("alex");
      if (!isFern && !isRE) continue;

      const lineName = a.line?.name ?? (isFern ? "Fernzug" : "RE");
      if (a.cancelled) {
        cancelled++;
        if (notableNames.length < 3) notableNames.push(`${lineName} (Ausfall)`);
        continue;
      }

      const delayMin = typeof a.delay === "number" ? Math.round(a.delay / 60) : 0;
      if (isFern && delayMin >= 12) {
        delayedFern++;
        if (notableNames.length < 3) notableNames.push(`${lineName} (+${delayMin} Min.)`);
      } else if (isRE && delayMin >= 15) {
        delayedRegio++;
        if (notableNames.length < 3) notableNames.push(`${lineName} (+${delayMin} Min.)`);
      }
    }

    let scoreBoostNow = 0;
    let scoreBoostNextHour = 0;
    let chipLabel: string | null = null;
    let hotspotDetail: string | null = null;
    const trafficItems: TrafficItem[] = [];

    if (cancelled > 0) {
      scoreBoostNow = Math.min(22, cancelled * 12 + delayedFern * 5);
      scoreBoostNextHour = Math.round(scoreBoostNow * 0.6);
      chipLabel = `Hbf: ${cancelled} Zugausfall (${notableNames[0] ?? "Bahn"})`;
      hotspotDetail = `Zugausfall am Hbf Regensburg (${notableNames.join(", ")}) – Fahrgäste weichen auf Uber/Taxi aus`;
      trafficItems.push({
        id: `db:cancel:${Date.now()}`,
        kind: "stoerung",
        title: `Regensburg Hbf: ${cancelled} Zugausfall${cancelled > 1 ? "e" : ""} im Fern-/Regionalverkehr`,
        detail: `${notableNames.join(" · ")} – erhöhte Fahrgast-Nachfrage am Bahnhofsvorplatz / Albertstraße.`,
        timeLabel: "live",
        source: "Deutsche Bahn Live (Hbf)",
        url: "https://www.bahnhof.de/regensburg-hbf/abfahrt",
        publishedAt: new Date().toISOString(),
        trafficRelevant: true,
      });
    } else if (delayedFern > 0 || delayedRegio >= 2) {
      scoreBoostNow = Math.min(16, delayedFern * 7 + delayedRegio * 4);
      scoreBoostNextHour = Math.min(12, delayedFern * 5 + delayedRegio * 3);
      const totalDelayed = delayedFern + delayedRegio;
      chipLabel = `Hbf: ${totalDelayed} verspätete Züge (${notableNames[0] ?? "ICE/RE"})`;
      hotspotDetail = `Verspätete Ankunftswelle am Hbf (${notableNames.join(", ")})`;
      trafficItems.push({
        id: `db:delay:${Date.now()}`,
        kind: "verkehr",
        title: `Regensburg Hbf: ${totalDelayed} Züge mit Verspätung (${notableNames.join(", ")})`,
        detail: "Gebündelte Ankunftswelle am Hauptbahnhof – gute Chancen an der Albertstraße / Bahnhofsvorplatz.",
        timeLabel: "live",
        source: "Deutsche Bahn Live (Hbf)",
        url: "https://www.bahnhof.de/regensburg-hbf/abfahrt",
        publishedAt: new Date().toISOString(),
        trafficRelevant: true,
      });
    }

    const statusDetail =
      cancelled > 0 || delayedFern > 0 || delayedRegio > 0
        ? `${cancelled} Ausfälle · ${delayedFern + delayedRegio} Verspätungen (>12 Min.)`
        : "Planmäßiger Betrieb am Hbf";

    const payload = {
      scoreBoostNow,
      scoreBoostNextHour,
      chipLabel,
      hotspotDetail,
      trafficItems,
      statusDetail,
    };
    cacheSet(key, payload, TTL);

    return {
      scoreBoostNow,
      scoreBoostNextHour,
      chipLabel,
      hotspotDetail,
      trafficItems,
      status: {
        key: "bahn",
        label: "Deutsche Bahn Live (Regensburg Hbf)",
        ok: true,
        detail: `Live · ${statusDetail}`,
        fetchedAt: new Date().toISOString(),
      },
    };
  } catch {
    const stale = cacheStale<Omit<BahnLiveResult, "status"> & { statusDetail: string }>(key);
    if (stale) {
      return {
        scoreBoostNow: stale.scoreBoostNow,
        scoreBoostNextHour: stale.scoreBoostNextHour,
        chipLabel: stale.chipLabel,
        hotspotDetail: stale.hotspotDetail,
        trafficItems: stale.trafficItems,
        status: {
          key: "bahn",
          label: "Deutsche Bahn Live (Regensburg Hbf)",
          ok: true,
          detail: "Cache (Quelle kurzzeitig langsam)",
          fetchedAt: null,
        },
      };
    }
    return {
      scoreBoostNow: 0,
      scoreBoostNextHour: 0,
      chipLabel: null,
      hotspotDetail: null,
      trafficItems: [],
      status: {
        key: "bahn",
        label: "Deutsche Bahn Live (Regensburg Hbf)",
        ok: true,
        detail: "Planmäßiger Takt (:15 / :45 ICE-Knoten)",
        fetchedAt: null,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
