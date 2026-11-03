// Veranstaltungen in Regensburg:
//  1) RSS-Feed des offiziellen Veranstaltungskalenders der Stadt (regensburg.de/rss/veranstaltungen)
//  2) HTML-Liste (erste Kalenderseite) als Ergänzung
// Beide werden serverseitig geparst, kategorisiert und 90 Min. gecacht.

import type { CityEvent, EventCategory, SourceStatus } from "./types";
import { cacheGet, cacheSet, cacheStale } from "./cache";

const TTL = 90 * 60 * 1000; // 90 Minuten
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

async function fetchTimeout(url: string, ms = 20000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA }, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

// ---------- Kategorisierung ----------

const re = (s: string, flags = "") => new RegExp(s, flags);

const RULES: { cat: EventCategory; rel: number; re: RegExp[] }[] = [
  {
    cat: "fest",
    rel: 3,
    re: [
      re("dult"), re("volksfest"), re("stadtfest"), re("bürgerfest"), re("buergerfest"),
      re("festival"), re("weihnachtsmarkt"), re("christkindlmarkt"), re("adventsmarkt"),
      re("kirchweih"), re("jahrmarkt"), re("festzug"), re("schlossfest"), re("straßenfest"),
      re("hoffest"), re("weinfest"), re("oktoberfest"), re("markt(en)?fest"),
      re("\\bmarkt\\b"), re("kunsthandwerker"),
    ],
  },
  {
    cat: "party",
    rel: 3,
    re: [
      re("\\bparty\\b"), re("\\bclub\\b"), re("disco"), re("afterwork"), re("ü30"),
      re("dancefloor"), re("\\bdj\\b"), re("rave"), re("single-party"), re("\\bdance\\b"),
    ],
  },
  {
    cat: "sport",
    rel: 3,
    re: [
      re("fußball"), re("fussball"), re("heimspiel"), re("eishockey"), re("handball"),
      re("basketball"), re("volleyball"), re("marathon"), re("\\blauf\\b"), re("läufe"),
      re("radrennen"), re("turnier"), re("regatta"), re("\\bjahn\\b"), re("schwimmen"),
      re("karate"), re("judo"), re("\\btennis\\b"),
    ],
  },
  {
    cat: "music",
    rel: 3,
    re: [
      re("konzert"), re("session"), re("jazz"), re("\\blive\\b"), re("musik"), re("\\bband\\b"),
      re("blues"), re("\\brock\\b"), re("\\bpop\\b"), re("open mic"), re("\\bjam\\b"),
      re("philharmonie"), re("orgel"), re("gesang"), re("klavier"), re("lied"), re("sound"),
      re("akustik"), re("chor(?!nobyl)"), re("singer"), re("song"), re("unplugged"),
      re("orchester"), re("sinfonie"),
    ],
  },
  {
    cat: "kultur",
    rel: 1.5,
    re: [
      re("ausstellung"), re("vernissage"), re("galerie"), re("museum"), re("theater"),
      re("bühne"), re("vortrag"), re("lesung"), re("führung"), re("kino"), re("film"),
      re("literatur"), re("diskussion"), re("seminar"), re("workshop"), re("bibliothek"),
      re("bücherei"), re("gedenken"), re("videoshow"), re("lichtshow"),
    ],
  },
];

export function categorize(title: string): { category: EventCategory; relevance: number } {
  const t = title.toLowerCase();
  for (const r of RULES) {
    if (r.re.some((x) => x.test(t))) return { category: r.cat, relevance: r.rel };
  }
  return { category: "sonst", relevance: 1 };
}

// ---------- Zeit-Parsing ----------

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mär: "03", mrz: "03", apr: "04", mai: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", okt: "10", nov: "11", dez: "12",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parst "Zeit:"-Teil in ein Mapping Wochentag -> [start,end] und optional Global-Zeiten */
function parseZeit(zeit: string): {
  weekdayHours: Record<number, [number, number]>;
  globalHours: [number, number] | null;
  text: string;
} {
  const weekdayHours: Record<number, [number, number]> = {};
  const WD: Record<string, number> = { mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 7 };
  let globalHours: [number, number] | null = null;

  const clean = zeit.replace(/\s+/g, " ").trim();
  // "Mo 09:00 - 18:00 Uhr, Di 09:00 - 18:00 Uhr, ..." bzw. "Mo ganztägig, ..."
  const chunks = clean.split(/,\s*(?=[A-Za-z]{2}\s|$)/);
  for (const ch of chunks) {
    const m = ch.trim().match(/^(mo|di|mi|do|fr|sa|so)\s+(ganztägig|(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2}))/i);
    if (m) {
      const wd = WD[m[1].toLowerCase()];
      if (m[2].toLowerCase().startsWith("ganztägig")) {
        weekdayHours[wd] = [9, 22];
      } else {
        weekdayHours[wd] = [parseInt(m[3], 10), parseInt(m[5], 10)];
      }
      continue;
    }
    const g = ch.trim().match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (g) globalHours = [parseInt(g[1], 10), parseInt(g[3], 10)];
    if (/ganztägig/i.test(ch) && !globalHours) globalHours = [9, 22];
  }
  const short =
    Object.keys(weekdayHours).length > 0
      ? "Wochentags-Zeiten (siehe Details)"
      : globalHours
        ? `${pad2(globalHours[0])}:00 - ${pad2(globalHours[1])}:00 Uhr`
        : clean.slice(0, 40);
  return { weekdayHours, globalHours, text: short };
}

type ParsedDate = {
  dateKey: string;
  endKey: string;
  startHour: number | null;
  endHour: number | null;
};

function parseDatum(datum: string, zeitInfo: { weekdayHours: Record<number, [number, number]>; globalHours: [number, number] | null }): ParsedDate | null {
  const d = datum.replace(/\s+/g, " ").trim();
  const yearNow = new Date().getFullYear();

  // 1) Einzelnes Datum mit Uhrzeit: "02.11.2026 19:00 - 20:30 Uhr"
  let m = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (m) {
    const dateKey = `${m[3]}-${pad2(parseInt(m[2], 10))}-${pad2(parseInt(m[1], 10))}`;
    return { dateKey, endKey: dateKey, startHour: parseInt(m[4], 10), endHour: parseInt(m[6], 10) };
  }

  // 2) Bereich: "28.03. - 01.11.2026" | "18.09.2026 - 10.01.2027" | "03. - 23.11.2026"
  m = d.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{4})?\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) {
    const startYear = m[3] ?? m[6];
    const dateKey = `${startYear}-${pad2(parseInt(m[2], 10))}-${pad2(parseInt(m[1], 10))}`;
    const endKey = `${m[6]}-${pad2(parseInt(m[5], 10))}-${pad2(parseInt(m[4], 10))}`;
    return { dateKey, endKey, startHour: null, endHour: null };
  }

  // 3) Einzelnes Datum ohne Uhrzeit: "03.11.2026"
  m = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) {
    const dateKey = `${m[3]}-${pad2(parseInt(m[2], 10))}-${pad2(parseInt(m[1], 10))}`;
    // Uhrzeiten aus dem Zeit-Teil (globale Zeiten) übernehmen
    if (zeitInfo.globalHours) {
      return { dateKey, endKey: dateKey, startHour: zeitInfo.globalHours[0], endHour: zeitInfo.globalHours[1] };
    }
    return { dateKey, endKey: dateKey, startHour: null, endHour: null };
  }

  return null;
}

// ---------- RSS ----------

function xmlTag(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return m[1]
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<br\s*\/?>/g, " §BR§ ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&szlig;/g, "ß")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchRss(): Promise<CityEvent[]> {
  const res = await fetchTimeout("https://www.regensburg.de/rss/veranstaltungen");
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const out: CityEvent[] = [];

  for (const item of items) {
    const title = xmlTag(item, "title");
    const desc = xmlTag(item, "description");
    const link = xmlTag(item, "link");
    if (!title) continue;

    const parts = desc.split("§BR§");
    const head = parts[0] ?? "";
    const ort = (desc.split(/Ort:\s*/)[1] ?? "").trim() || "Regensburg";

    const dm = head.match(/Datum:\s*(.*?)(?:\s*Zeit:\s*(.*))?$/i);
    const datumStr = dm?.[1] ?? "";
    const zeitStr = dm?.[2] ?? (head.split(/Zeit:\s*/i)[1] ?? "");

    const zeitInfo = parseZeit(zeitStr);
    const pd = parseDatum(datumStr, zeitInfo);
    if (!pd) continue;

    const { category, relevance } = categorize(title);
    out.push({
      id: `rss:${link || title}`,
      title,
      category,
      relevance,
      dateKey: pd.dateKey,
      endKey: pd.endKey,
      timeText: pd.startHour !== null ? `${pad2(pd.startHour)}:00 - ${pad2(pd.endHour ?? pd.startHour + 2)}:00 Uhr` : zeitInfo.text,
      startHour: pd.startHour,
      endHour: pd.endHour,
      weekdayHours: Object.keys(zeitInfo.weekdayHours).length ? zeitInfo.weekdayHours : undefined,
      venue: ort,
      source: "regensburg.de",
      url: link || null,
    });
  }
  return out;
}

// ---------- HTML-Liste (Seite 1) ----------

async function fetchHtml(): Promise<CityEvent[]> {
  const res = await fetchTimeout("https://www.regensburg.de/veranstaltungen");
  if (!res.ok) throw new Error(`HTML HTTP ${res.status}`);
  const html = await res.text();
  const seg = html.split("veranstaltungsliste")[1] ?? "";
  const blocks = seg.split('<div class="flex flex-col md:flex-row md:shadow-primary">').slice(1);
  const out: CityEvent[] = [];

  for (const b of blocks) {
    const tm = b.match(/href="\/veranstaltungen\/detail\/(\d+)"[^>]*>([^<]+)</);
    if (!tm) continue;
    const id = tm[1];
    const title = tm[2].trim();
    const pm = b.match(/<p class="text-sm">([\s\S]*?)<\/p>/);
    const timeLine = pm ? pm[1].replace(/\s+/g, " ").trim() : "";
    // Datum-Badge: Tag + Monat
    const dm = b.match(/text-\[\d+px\][^>]*>(\d{1,2})<\/div>\s*<div[^>]*>(\w{3})<\/div>/i);
    let dateKey: string | null = null;
    if (dm) {
      const mon = MONTHS[dm[2].toLowerCase().slice(0, 3)];
      if (mon) {
        const now = new Date();
        const { dateKey: today } = (() => {
          const f = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });
          const p = f.formatToParts(now);
          return { dateKey: `${p.find((x) => x.type === "year")?.value}-${p.find((x) => x.type === "month")?.value}-${p.find((x) => x.type === "day")?.value}` };
        })();
        let year = parseInt(today.slice(0, 4), 10);
        if (mon === "01" && today.slice(5, 7) === "12") year += 1; // Jahreswechsel
        dateKey = `${year}-${mon}-${pad2(parseInt(dm[1], 10))}`;
      }
    }
    if (!dateKey) continue;

    const hm = timeLine.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    const startHour = hm ? parseInt(hm[1], 10) : null;
    const endHour = hm ? parseInt(hm[3], 10) : null;
    const venue = timeLine.includes("|") ? timeLine.split("|").slice(1).join(" | ").trim() : "Regensburg";
    const { category, relevance } = categorize(title);

    out.push({
      id: `html:${id}`,
      title,
      category,
      relevance,
      dateKey,
      endKey: dateKey,
      timeText: startHour !== null ? `${pad2(startHour)}:${hm?.[2] ?? "00"} - ${pad2(endHour ?? startHour + 2)}:${hm?.[4] ?? "00"} Uhr` : "—",
      startHour,
      endHour,
      venue: venue || "Regensburg",
      source: "regensburg.de",
      url: `https://www.regensburg.de/veranstaltungen/detail/${id}`,
    });
  }
  return out;
}

// ---------- Öffentliche API ----------

export async function getEvents(): Promise<{ events: CityEvent[]; status: SourceStatus }> {
  const cached = cacheGet<CityEvent[]>("events:regensburg");
  if (cached) {
    return {
      events: cached,
      status: { key: "events", label: "Veranstaltungen (regensburg.de)", ok: true, detail: `Cache · ${cached.length} Einträge`, fetchedAt: null },
    };
  }

  const results = await Promise.allSettled([fetchRss(), fetchHtml()]);
  const events: CityEvent[] = [];
  let okCount = 0;
  let errCount = 0;

  for (const r of results) {
    if (r.status === "fulfilled") {
      okCount++;
      events.push(...r.value);
    } else {
      errCount++;
    }
  }

  if (okCount > 0) {
    // Duplikate (gleicher Titel, gleiches Datum) entfernen
    const seen = new Set<string>();
    const dedup = events.filter((e) => {
      const k = `${e.title.toLowerCase().replace(/\W+/g, " ").trim()}|${e.dateKey}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    dedup.sort((a, b) => (a.dateKey + (a.startHour ?? 0)).toString().localeCompare((b.dateKey + (b.startHour ?? 0)).toString()));
    cacheSet("events:regensburg", dedup, TTL);
    return {
      events: dedup,
      status: { key: "events", label: "Veranstaltungen (regensburg.de)", ok: true, detail: `Live · RSS${errCount ? " + HTML(✗)" : "+HTML"} · ${dedup.length} Einträge`, fetchedAt: new Date().toISOString() },
    };
  }

  const stale = cacheStale<CityEvent[]>("events:regensburg");
  if (stale) {
    return {
      events: stale,
      status: { key: "events", label: "Veranstaltungen (regensburg.de)", ok: true, detail: "Älterer Cache (Quelle gestört)", fetchedAt: null },
    };
  }
  return {
    events: [],
    status: { key: "events", label: "Veranstaltungen (regensburg.de)", ok: false, detail: "Kalender nicht erreichbar", fetchedAt: null },
  };
}
