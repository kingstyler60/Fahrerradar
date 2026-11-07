// Gesetzliche Feiertage Bayern.
// Primär: feiertage-api.de (live). Fallback: Nager.Date. Letzter Fallback:
// eingebaute Tabelle (amtliche Termine 2026/2027).

import type { HolidayInfo, SourceStatus } from "./types";
import { cacheGet, cacheSet, cacheStale } from "./cache";

const TTL = 12 * 3600 * 1000; // 12 h

export type HolidayMaps = {
  // gesetzliche Feiertage (Bayern) – volle Wirkung
  holidays: Map<string, string>;
  // "nur schulfrei"-Tage (z.B. Buß- und Bettag in Bayern: kein Feiertag, aber unterrichtsfrei)
  schoolFree: Map<string, string>;
};

// Eingebaute, verifizierte Termine (feiertage-api.de / gesetze-bayern.de).
// Buß- und Bettag (BY: schulfrei, kein Feiertag) separat.
const BAKED: Record<string, HolidayInfo[]> = {
  "2026": [
    { dateKey: "2026-01-01", name: "Neujahr" },
    { dateKey: "2026-01-06", name: "Heilige Drei Könige" },
    { dateKey: "2026-04-03", name: "Karfreitag" },
    { dateKey: "2026-04-05", name: "Ostersonntag" },
    { dateKey: "2026-04-06", name: "Ostermontag" },
    { dateKey: "2026-05-01", name: "Tag der Arbeit" },
    { dateKey: "2026-05-14", name: "Christi Himmelfahrt" },
    { dateKey: "2026-05-24", name: "Pfingstsonntag" },
    { dateKey: "2026-05-25", name: "Pfingstmontag" },
    { dateKey: "2026-06-04", name: "Fronleichnam" },
    { dateKey: "2026-08-15", name: "Mariä Himmelfahrt" },
    { dateKey: "2026-10-03", name: "Tag der Deutschen Einheit" },
    { dateKey: "2026-11-01", name: "Allerheiligen" },
    { dateKey: "2026-12-25", name: "1. Weihnachtstag" },
    { dateKey: "2026-12-26", name: "2. Weihnachtstag" },
  ],
  "2027": [
    { dateKey: "2027-01-01", name: "Neujahr" },
    { dateKey: "2027-01-06", name: "Heilige Drei Könige" },
    { dateKey: "2027-03-26", name: "Karfreitag" },
    { dateKey: "2027-03-28", name: "Ostersonntag" },
    { dateKey: "2027-03-29", name: "Ostermontag" },
    { dateKey: "2027-05-01", name: "Tag der Arbeit" },
    { dateKey: "2027-05-06", name: "Christi Himmelfahrt" },
    { dateKey: "2027-05-16", name: "Pfingstsonntag" },
    { dateKey: "2027-05-17", name: "Pfingstmontag" },
    { dateKey: "2027-05-27", name: "Fronleichnam" },
    { dateKey: "2027-10-03", name: "Tag der Deutschen Einheit" },
    { dateKey: "2027-11-01", name: "Allerheiligen" },
    { dateKey: "2027-12-25", name: "1. Weihnachtstag" },
    { dateKey: "2027-12-26", name: "2. Weihnachtstag" },
  ],
};

// Nur-schulfrei-Tage Bayern (kein Feiertag): Buß- und Bettag = Mittwoch vor Totensonntag
// (Totensonntag = letzter Sonntag vor dem 1. Advent) – amtlich bestätigt via feiertage-api.de-Hinweis.
const BAKED_SCHOOL_FREE: Record<string, HolidayInfo[]> = {
  "2026": [{ dateKey: "2026-11-18", name: "Buß- und Bettag" }],
  "2027": [{ dateKey: "2027-11-17", name: "Buß- und Bettag" }],
  "2028": [{ dateKey: "2028-11-22", name: "Buß- und Bettag" }],
};

async function fetchWithTimeout(url: string, ms = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "FahrerRadar/1.0", Accept: "application/json" },
      cache: "no-store",
    });
  } finally {
    clearTimeout(t);
  }
}

async function fromFeiertageApi(year: string): Promise<HolidayInfo[]> {
  const res = await fetchWithTimeout(
    `https://feiertage-api.de/api/?jahr=${year}&nur_land=BY`
  );
  if (!res.ok) throw new Error(`feiertage-api HTTP ${res.status}`);
  const json = (await res.json()) as Record<string, { datum: string; hinweis?: string }>;
  return Object.entries(json)
    .filter(([name, v]) => v?.datum && name !== "Augsburger Friedensfest") // gilt nur Augsburg
    .map(([name, v]) => ({ dateKey: v.datum, name }));
}

async function fromNager(year: string): Promise<HolidayInfo[]> {
  const res = await fetchWithTimeout(`https://date.nager.at/api/v3/PublicHolidays/${year}/DE`);
  if (!res.ok) throw new Error(`nager HTTP ${res.status}`);
  const json = (await res.json()) as {
    date: string;
    localName: string;
    counties: string[] | null;
    global: boolean;
  }[];
  return json
    .filter((h) => h.global || (h.counties ?? []).includes("DE-BY"))
    .map((h) => ({ dateKey: h.date, name: h.localName }));
}

export async function getHolidays(
  years: string[]
): Promise<{ maps: HolidayMaps; status: SourceStatus }> {
  const key = `holidays:${years.join(",")}`;
  const cached = cacheGet<HolidayMaps>(key);
  if (cached) {
    return {
      maps: cached,
      status: { key: "holidays", label: "Feiertage (Bayern)", ok: true, detail: "Cache", fetchedAt: null },
    };
  }

  const holidays = new Map<string, string>();
  const schoolFree = new Map<string, string>();
  let ok = false;
  let detail = "";
  for (const year of years) {
    let loaded = false;
    for (const src of [fromFeiertageApi, fromNager]) {
      try {
        const list = await src(year);
        for (const h of list) holidays.set(h.dateKey, h.name);
        loaded = true;
        ok = true;
        detail = src === fromFeiertageApi ? "feiertage-api.de" : "date.nager.at";
        break;
      } catch (e) {
        detail = e instanceof Error ? e.message : "Fehler";
      }
    }
    if (!loaded || holidays.size === 0) {
      for (const h of BAKED[year] ?? []) holidays.set(h.dateKey, h.name);
      if (!ok) detail = "Fallback: eingebaute amtliche Tabelle";
    }
    // Nur-schulfrei-Tage immer ergänzen (sie sind kein Teil der Feiertags-API-Logik
    // von Nager; bei feiertage-api.de werden sie herausgefiltert)
    for (const h of BAKED_SCHOOL_FREE[year] ?? []) {
      if (!holidays.has(h.dateKey)) schoolFree.set(h.dateKey, h.name);
    }
  }

  if (holidays.size === 0) {
    for (const y of years) for (const h of BAKED[y] ?? []) holidays.set(h.dateKey, h.name);
    detail = "Fallback: eingebaute amtliche Tabelle";
  }

  // Doppelte (Quelle lieferte Buß- und Bettag als "Feiertag") korrigieren
  for (const [dk, name] of [...holidays.entries()]) {
    if (name.includes("Buß- und Bettag")) {
      holidays.delete(dk);
      schoolFree.set(dk, name);
    }
  }

  const maps: HolidayMaps = { holidays, schoolFree };
  cacheSet(key, maps, TTL);
  return {
    maps,
    status: { key: "holidays", label: "Feiertage (Bayern)", ok: true, detail: `${detail} · ${holidays.size} Feiertage`, fetchedAt: new Date().toISOString() },
  };
}

export function holidayFallbackStale(years: string[]): Map<string, string> {
  const key = `holidays:${years.join(",")}`;
  const stale = cacheStale<{ map: Map<string, string> }>(key);
  if (stale) return stale.map;
  const map = new Map<string, string>();
  for (const y of years) for (const h of BAKED[y] ?? []) map.set(h.dateKey, h.name);
  return map;
}
