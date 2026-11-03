// Google Alerts Feeds des Nutzers (Atom-Format):
//  - Verkehrs-Feeds (Blitzer, Radarkontrolle, Polizei-Kontrolle, Sperrung)
//    -> werden als TrafficItem in die Verkehr-Sektion gemischt
//  - Szene-Feeds (Nachtleben, Konzert, Messe, Veranstaltung, Fußball, News, Wetter)
//    -> werden als AlertItem in "Veranstaltungen, Partys & Szene" gezeigt
// Damit ist die Party-/Nachtleben-Sparte immer frisch gefüllt, auch wenn der
// Stadt-Kalender mal wieder nichts hergibt. 15 Min. Cache, dann Stale-Fallback.

import { cacheGet, cacheSet, cacheStale } from "./cache";
import type { AlertGroup, AlertItem, SourceStatus, TrafficItem } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const USER = "01320358222952924391";
const BASE = "https://www.google.de/alerts/feeds";

type AlertFeed = {
  name: string; // Klartext für Quelle/Chip
  id: string;
  scene?: AlertGroup; // gesetzt = Szene-Meldung
  trafficKind?: TrafficItem["kind"]; // gesetzt = Verkehrs-Meldung
};

export const ALERT_FEEDS: AlertFeed[] = [
  { name: "Blitzer Regensburg", id: "5129769092976401694", trafficKind: "blitzer" },
  { name: "Radarkontrolle Regensburg", id: "15433287666983383302", trafficKind: "blitzer" },
  { name: "Polizei Regensburg Kontrolle", id: "4762219431191439677", trafficKind: "kontrolle" },
  { name: "Regensburg Sperrung", id: "2082125224994140636", trafficKind: "sperrung" },
  { name: "Regensburg Nachtleben", id: "15378225599318232494", scene: "nachtleben" },
  { name: "Regensburg Konzert", id: "1947225724725186491", scene: "konzert" },
  { name: "Messe Regensburg", id: "6490459107825517752", scene: "messe" },
  { name: "Regensburg Veranstaltung", id: "14503047770147793451", scene: "veranstaltung" },
  { name: "Regensburg Fußball", id: "15371205677677175426", scene: "fussball" },
  { name: "Regensburg news", id: "4583831665289556387", scene: "news" },
  { name: "Regensburg Wetter", id: "10503069785350684869", scene: "wetter" },
];

// ---------- XML-Helfer ----------

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return " ";
      }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try {
        return String.fromCodePoint(parseInt(d, 10));
      } catch {
        return " ";
      }
    });
}

/** Atom-Text (HTML-kodiert) -> lesbarer Klartext; zwei Durchgänge wegen Doppel-Kodierung (&amp;nbsp; etc.) */
function cleanText(raw: string): string {
  let s = raw;
  for (let i = 0; i < 2; i++) {
    s = s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&nbsp;|&#0?160;/gi, " ")
      .replace(/&amp;/g, "&");
  }
  return decodeEntities(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Google-Redirect (…/url?rct=j&url=REAL) -> echte Ziel-URL */
function realLink(href: string): string {
  try {
    // href kommt XML-kodiert (&amp;) aus dem Feed – erst auflösen
    const u = new URL(href.replace(/&amp;/g, "&"));
    const target = u.searchParams.get("url");
    if (target && /^https?:\/\//i.test(target)) return target;
    if (/^https?:\/\//i.test(href) && !/google\.(de|com)\/url/.test(href)) return href;
    return "";
  } catch {
    return "";
  }
}

function atomTag(entry: string, tag: string): string {
  const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : "";
}

function atomLink(entry: string): string {
  const m = entry.match(/<link\b[^>]*\bhref="([^"]+)"[^>]*>/i);
  return m ? m[1] : "";
}

function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return `vor ${d} Tag${d === 1 ? "" : "e"}`;
}

// ---------- Ein Feed ----------

type ParsedEntry = { title: string; snippet: string; url: string | null; publishedAt: string | null; id: string };

async function fetchAlertFeed(feed: AlertFeed): Promise<ParsedEntry[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${BASE}/${USER}/${feed.id}`, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    // Atom: <feed ...><entry>…</entry><entry>…</entry></feed>
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
    const out: ParsedEntry[] = [];
    for (const e of entries.slice(0, 10)) {
      const title = cleanText(atomTag(e, "title"));
      if (!title) continue;
      const content = cleanText(atomTag(e, "content"));
      const published = atomTag(e, "published") || atomTag(e, "updated") || null;
      const publishedAt = published && Number.isFinite(Date.parse(published)) ? new Date(published).toISOString() : null;
      out.push({
        id: (atomTag(e, "id") || `${feed.id}:${title}`).trim(),
        title,
        snippet: content.slice(0, 240),
        url: realLink(atomLink(e)) || null,
        publishedAt,
      });
    }
    return out;
  } finally {
    clearTimeout(t);
  }
}

// ---------- Öffentliche Funktion ----------

export type AlertsResult = {
  traffic: TrafficItem[];
  scene: AlertItem[];
  status: SourceStatus;
};

const MAX_AGE_TRAFFIC_MS = 5 * 24 * 3600 * 1000; // Verkehrs-Meldungen max. 5 Tage alt
const MAX_AGE_SCENE_MS = 8 * 24 * 3600 * 1000; // Szene/Party-Meldungen max. 8 Tage alt

// Parallel-Aufrufe teilen sich denselben Ladevorgang (Verkehr & Aggregator fragen gleichzeitig)
let inflight: Promise<AlertsResult> | null = null;

export async function getAlerts(): Promise<AlertsResult> {
  const key = "alerts:google:v1";
  const cached = cacheGet<{ traffic: TrafficItem[]; scene: AlertItem[]; detail: string }>(key);
  if (cached) {
    return {
      traffic: cached.traffic,
      scene: cached.scene,
      status: { key: "alerts", label: "Google Alerts (eigene Feeds)", ok: true, detail: `Cache · ${cached.detail}`, fetchedAt: null },
    };
  }
  if (inflight) return inflight;
  inflight = loadAlerts(key).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function loadAlerts(key: string): Promise<AlertsResult> {
  const settled = await Promise.allSettled(
    ALERT_FEEDS.map(async (feed) => ({ feed, entries: await fetchAlertFeed(feed) }))
  );

  const traffic: TrafficItem[] = [];
  const scene: AlertItem[] = [];
  let okFeeds = 0;
  let emptyFeeds = 0;

  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    okFeeds++;
    const { feed, entries } = r.value;
    if (entries.length === 0) emptyFeeds++;

    if (feed.trafficKind) {
      for (const e of entries) {
        const ts = e.publishedAt ? Date.parse(e.publishedAt) : NaN;
        if (Number.isFinite(ts) && Date.now() - ts > MAX_AGE_TRAFFIC_MS) continue;
        traffic.push({
          id: `ga:${e.id}`,
          kind: feed.trafficKind,
          title: e.title,
          detail: e.snippet,
          timeLabel: formatRelative(e.publishedAt),
          source: `Google Alert · ${feed.name}`,
          url: e.url,
          publishedAt: e.publishedAt,
          trafficRelevant: true,
        });
      }
    } else if (feed.scene) {
      for (const e of entries.slice(0, 6)) {
        const ts = e.publishedAt ? Date.parse(e.publishedAt) : NaN;
        if (Number.isFinite(ts) && Date.now() - ts > MAX_AGE_SCENE_MS) continue;
        scene.push({
          id: `ga:${e.id}`,
          feed: feed.name,
          group: feed.scene,
          title: e.title,
          snippet: e.snippet,
          url: e.url,
          publishedAt: e.publishedAt,
        });
      }
    }
  }

  // Duplikate (gleicher Titel, oft greifen mehrere Alerts) entfernen
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();
  const seenT = new Set<string>();
  const trafficDedup = traffic
    .sort((a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0))
    .filter((t) => {
      const k = norm(t.title);
      if (seenT.has(k)) return false;
      seenT.add(k);
      return true;
    });
  const seenS = new Set<string>();
  const sceneDedupRaw = scene
    .sort((a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0))
    .filter((s) => {
      const k = norm(s.title);
      if (seenS.has(k)) return false;
      seenS.add(k);
      return true;
    });

  // Party & Nachtleben zuerst, News/Wetter nur als Füllung: pro Szene-Gruppe die
  // 3 neuesten Meldungen vorziehen, danach der Rest nach Frische bis 18 gesamt.
  const GROUP_ORDER: AlertGroup[] = ["nachtleben", "konzert", "messe", "veranstaltung", "fussball", "news", "wetter"];
  const prio: AlertItem[] = [];
  for (const g of GROUP_ORDER) {
    prio.push(...sceneDedupRaw.filter((s) => s.group === g).slice(0, 3));
  }
  const prioIds = new Set(prio.map((s) => s.id));
  const sceneDedup = [...prio, ...sceneDedupRaw.filter((s) => !prioIds.has(s.id))].slice(0, 18);

  const failed = settled.length - okFeeds;
  const detail = `${trafficDedup.length} Verkehrs- + ${sceneDedup.length} Szene-Meldungen · ${okFeeds}/11 Feeds geladen`;
  const result = { traffic: trafficDedup.slice(0, 8), scene: sceneDedup, detail };
  cacheSet(key, result, 15 * 60 * 1000);

  return {
    traffic: result.traffic,
    scene: result.scene,
    status: {
      key: "alerts",
      label: "Google Alerts (eigene Feeds)",
      ok: okFeeds > 0,
      detail: failed > 0 ? `${detail} · ${failed} Feeds gestört` : detail,
      fetchedAt: new Date().toISOString(),
    },
  };
}
export { formatRelative as alertRelative, hostOf as alertHost };
