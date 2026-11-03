// Verkehr & Blitzer: Autobahn-API des Bundes (A3/A93) + Regensburger Radio-RSS-Feeds
// (Gong FM, Charivari, Radio Ramasuri, Regensburg Digital) mit Keyword-Filter
// + die eigenen Google-Alerts des Fahrers (Blitzer, Radar, Polizei, Sperrungen).

import { cacheGet, cacheSet, cacheStale } from "./cache";
import type { SourceStatus, TrafficItem } from "./types";
import { getWaze } from "./waze";
import { getAlerts } from "./alerts";

const RSS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchTimeout(url: string, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "User-Agent": RSS_UA },
    });
  } finally {
    clearTimeout(t);
  }
}

// Regensburg-Zentrum
const HOME = { lat: 49.0151, lon: 12.1016 };

function distanceKm(lat: number, lon: number): number {
  const R = 6371;
  const dLat = ((lat - HOME.lat) * Math.PI) / 180;
  const dLon = ((lon - HOME.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((HOME.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------- Autobahn-API (verkehr.autobahn.de, offiziell & ohne Schlüssel) ----------

type AbItem = {
  title?: string;
  subtitle?: string;
  description?: string[];
  display_type?: string;
  isBlocked?: string;
  startTimestamp?: string;
  coordinate?: { lat?: number; long?: number };
  extent?: string;
  point?: string;
};

function abPoint(it: AbItem): { lat: number; lon: number } | null {
  if (it.coordinate?.lat && it.coordinate?.long) return { lat: it.coordinate.lat, lon: it.coordinate.long };
  const p = (it.point ?? it.extent ?? "").split(",");
  if (p.length >= 2) {
    const lat = parseFloat(p[0]);
    const lon = parseFloat(p[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }
  return null;
}

async function fetchAutobahn(): Promise<TrafficItem[]> {
  const roads = ["A3", "A93"];
  const services = [
    { path: "roadworks", kind: "baustelle" as const },
    { path: "warnings", kind: "stoerung" as const },
  ];
  const lists = await Promise.all(
    roads.flatMap((road) =>
      services.map(async ({ path, kind }) => {
        const res = await fetchTimeout(`https://verkehr.autobahn.de/o/autobahn/${road}/services/${path}`);
        if (!res.ok) throw new Error(`Autobahn ${road} ${path}: HTTP ${res.status}`);
        const json = (await res.json()) as Record<string, AbItem[]>;
        return (json[path] ?? []).map((it) => ({ road, kind, it }));
      })
    )
  );

  const out: TrafficItem[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const { road, kind, it } of list) {
      const title = (it.title ?? "").replace(/\s+/g, " ").trim();
      if (!title) continue;
      const pt = abPoint(it);
      // Nur Meldungen im Umkreis von Regensburg (~55 km)
      if (pt && distanceKm(pt.lat, pt.lon) > 55) continue;
      if (!pt && !title.toLowerCase().includes("regensburg")) continue;

      const id = `${road}:${it.title ?? title}:${it.startTimestamp ?? ""}`;
      if (seen.has(id)) continue;
      seen.add(id);

      const desc = (it.description ?? []).filter(Boolean).slice(0, 3).join(" · ");
      let since = "aktuell";
      if (it.startTimestamp) {
        const ageH = (Date.now() - Date.parse(it.startTimestamp)) / 3600000;
        if (Number.isFinite(ageH) && ageH < 72) {
          since = formatRelative(it.startTimestamp);
        } else if (Number.isFinite(ageH)) {
          const d = new Date(it.startTimestamp);
          since = `seit ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
        }
      }
      const blocked = it.isBlocked === "true" ? " · Vollsperrung" : "";
      out.push({
        id: `ab:${id}`,
        kind: blocked ? "sperrung" : kind,
        title: title.replace(/^([AB]\d+\s*\|)\s*/, "$1 "),
        detail: `${it.subtitle?.trim() ?? ""}${it.subtitle ? " · " : ""}${desc}${blocked}`.trim(),
        timeLabel: since || "aktuell",
        source: `Autobahn ${road} (autobahn.de)`,
        url: null,
        publishedAt: it.startTimestamp ?? null,
        trafficRelevant: true,
      });
    }
  }
  return out.slice(0, 10);
}

// ---------- Radio-RSS mit Verkehr-Keywords ----------

const FEEDS = [
  { url: "https://www.gongfm.de/feed/", label: "Gong FM", local: true },
  { url: "https://www.charivari.com/feed/", label: "Charivari Regensburg", local: true },
  { url: "https://www.ramasuri.de/feed/", label: "Radio Ramasuri", local: false },
  { url: "https://www.regensburg-digital.de/feed/", label: "Regensburg Digital", local: true },
];

const REGION_WORDS = /regensburg|oberpfalz|niederbayern|landshut|straubing|kelheim|neutraubling|lappersdorf|deggendorf|schwandorf|cham/i;

const BLITZER_RE = /blitzer|radarfalle|tempo[k-]?kontrolle|geschwindigkeit(s)?kontrolle|lasermess/i;
const TRAFFIC_RE =
  /\bstau|unfall|wildwechsel|wildunfall|kollision|bergungsarbeit|gesperrt|vollsperrung|halbsperre|sperrung|umleitung|baustelle|stockender verkehr|verkehr behinder|brücke gesperrt|fahrbahn|straße( n)? gesperrt|gleis|bahnverkehr|\bfähre/i;

function xmlTag(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1]
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&szlig;/g, "ß")
    .replace(/&#8230;/g, "…")
    .replace(/\s+/g, " ")
    .trim();
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 60) return `vor ${Math.max(1, min)} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return `vor ${d} Tag${d === 1 ? "" : "e"}`;
}

async function fetchRadio(): Promise<TrafficItem[]> {
  const results = await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const res = await fetchTimeout(feed.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
        const out: TrafficItem[] = [];
        for (const item of items.slice(0, 30)) {
          const title = xmlTag(item, "title");
          const desc = xmlTag(item, "description");
          const link = xmlTag(item, "link");
          const pub = xmlTag(item, "pubDate");
          const cats = (item.match(/<category>([\s\S]*?)<\/category>/g) ?? [])
            .map((c) => xmlTag(c, "category"))
            .join(" · ");
          const pubIso = pub ? new Date(pub).toISOString() : null;
          // Nur frische Meldungen (72 h)
          if (pubIso && Date.now() - Date.parse(pubIso) > 72 * 3600 * 1000) continue;

          const text = `${title} ${desc} ${cats}`;
          const isBlitzer = BLITZER_RE.test(text);
          const isTraffic = TRAFFIC_RE.test(text);

          // Regionaler Filter: lokale Feeds komplett, Fremd-Feeds nur mit Regionbezug
          const localHit = feed.local || REGION_WORDS.test(text) || /lokalreporter/i.test(cats);
          if (!localHit) continue;
          if (!isBlitzer && !isTraffic) continue;

          out.push({
            id: `rss:${link || title}`,
            kind: isBlitzer ? "blitzer" : isTraffic ? "verkehr" : "lokal",
            title,
            detail: desc.slice(0, 220),
            timeLabel: pubIso ? formatRelative(pubIso) : "",
            source: feed.label,
            url: link || null,
            publishedAt: pubIso,
            trafficRelevant: true,
          });
        }
        return out;
      } catch {
        return [] as TrafficItem[];
      }
    })
  );
  return results.flat();
}

// ---------- Öffentliche Funktion ----------

export async function getTraffic(): Promise<{ items: TrafficItem[]; status: SourceStatus }> {
  const key = "traffic:v3";
  const cached = cacheGet<{ items: TrafficItem[]; detail: string }>(key);
  if (cached) {
    return {
      items: cached.items,
      status: { key: "traffic", label: "Verkehr & Blitzer (Autobahn, Radio, Alerts)", ok: true, detail: cached.detail, fetchedAt: null },
    };
  }
  try {
    const [ab, radio, waze, alerts] = await Promise.all([fetchAutobahn(), fetchRadio(), getWaze(), getAlerts()]);
    // Sperrung → Blitzer → Polizei-Kontrolle → Störung, danach alles nach Frische
    const rank = (k: TrafficItem["kind"]) =>
      k === "sperrung" ? 0 : k === "blitzer" ? 1 : k === "kontrolle" ? 1.5 : k === "stoerung" ? 2 : 3;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();
    const items = [...waze.items, ...ab, ...radio, ...alerts.traffic]
      .sort((a, b) => rank(a.kind) - rank(b.kind) || (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0))
      // Gleiche Geschichte in mehreren Radios/Quellen → nur die höchstrangige/frischere behalten
      .filter((it, idx, arr) => arr.findIndex((o) => norm(o.title) === norm(it.title)) === idx)
      .slice(0, 16);
    const wazeNote =
      waze.status === null
        ? "Waze: aus (kein API-Key)"
        : waze.items.length > 0
          ? `Waze: ${waze.items.length} Meldungen${waze.quotaLeft != null ? ` (noch ~${waze.quotaLeft} Abfragen diesen Monat)` : ""}`
          : `Waze: ${waze.status.detail}`;
    const detail = `Autobahn A3/A93: ${ab.length} Meldungen · Radio-Feeds: ${radio.length} Treffer · Google Alerts: ${alerts.traffic.length} Treffer · ${wazeNote}`;
    cacheSet(key, { items, detail }, 10 * 60 * 1000);
    return {
      items,
      status: { key: "traffic", label: "Verkehr & Blitzer (Autobahn, Radio, Alerts)", ok: true, detail, fetchedAt: null },
    };
  } catch (e) {
    const stale = cacheStale<{ items: TrafficItem[]; detail: string }>(key);
    if (stale) {
      return {
        items: stale.items,
        status: { key: "traffic", label: "Verkehr & Blitzer", ok: true, detail: "gecacht (Quelle gerade langsam)", fetchedAt: null },
      };
    }
    return {
      items: [],
      status: {
        key: "traffic",
        label: "Verkehr & Blitzer",
        ok: false,
        detail: `nicht erreichbar: ${e instanceof Error ? e.message : "Fehler"}`,
        fetchedAt: null,
      },
    };
  }
}
