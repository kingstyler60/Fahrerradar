// Waze-Community-Meldungen (OpenWeb Ninja Waze API) – Blitzer/Polizei, Unfälle,
// Staus, Sperrungen und Gefahren. NUR aktiv, wenn die Umgebungsvariable
// WAZE_API_KEY gesetzt ist (kostenloser Key: https://app.openwebninja.com/api/waze).
// Ohne Key läuft die Website unverändert mit Autobahn-API + Radio-Feeds weiter.
//
// Kontingent-Logik für das kostenlose Free-Tier (50 Anfragen/Monat):
// - Daten werden max. alle 3 Stunden frisch geholt (davor gilt der Cache)
// - Feste Monats-Budget-Verbrauchsanzeige (Restkontingent) im Quellen-Panel
// - Nach Kontingent-Fehlern (429/402/403) pausiert die Quelle 24 h automatisch
// - Radio-Feeds & Autobahn-API bleiben von einer Waze-Pause unberührt

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheGet, cacheSet, cacheStale } from "./cache";
import type { SourceStatus, TrafficItem } from "./types";

const KEY = process.env.WAZE_API_KEY ?? "";
// Regensburg + Umland (Neutraubling, Lappersdorf, Regenstauf, Barbing …)
const CENTER = "49.0151,12.1016";
const RADIUS_KM = 20;

const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 h – schont das Monats-Kontingent
const ALERT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // Meldungen älter als 24 h: weg
const JAM_MAX_AGE_MS = 60 * 60 * 1000; // Staus sind nach 1 h wertlos
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // Pause nach Kontingent-Fehler
const MONTHLY_BUDGET = Math.max(1, Number(process.env.WAZE_MONTHLY_BUDGET ?? 44)); // Puffer unter 50

// ---------- Monats-Haushaltsbuch (best effort, überlebt Server-Neustarts meist) ----------

type Ledger = { month: string; used: number; last: number; cooldownUntil: number };
const LEDGER_FILE = join(tmpdir(), "fahrerradar-waze.json");

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function loadLedger(): Ledger {
  try {
    const raw = JSON.parse(readFileSync(LEDGER_FILE, "utf8")) as Partial<Ledger>;
    if (raw.month !== monthKey()) return { month: monthKey(), used: 0, last: 0, cooldownUntil: 0 };
    return { month: monthKey(), used: raw.used ?? 0, last: raw.last ?? 0, cooldownUntil: raw.cooldownUntil ?? 0 };
  } catch {
    return { month: monthKey(), used: 0, last: 0, cooldownUntil: 0 };
  }
}

function saveLedger(l: Ledger): void {
  try {
    writeFileSync(LEDGER_FILE, JSON.stringify(l));
  } catch {
    /* Dateisystem nicht beschreibbar → nur In-Memory, unkritisch */
  }
}

// ---------- API-Typen (Antwort: { status, parameters, data: { alerts, jams } }) ----------

type WazeAlert = {
  alert_id?: string;
  type?: string;
  subtype?: string | null;
  description?: string | null;
  publish_datetime_utc?: string;
  city?: string | null;
  street?: string | null;
  num_thumbs_up?: number;
  alert_reliability?: number;
};

type WazeJam = {
  jam_id?: string;
  level?: number;
  severity?: number;
  speed_kmh?: number;
  length_meters?: number;
  delay_seconds?: number;
  update_datetime_utc?: string;
  city?: string | null;
  street?: string | null;
};

export type WazeResult = {
  items: TrafficItem[];
  status: SourceStatus | null; // null = Feature deaktiviert (kein Key)
  quotaLeft: number | null; // noch freie Abfragen im Monat (null = deaktiviert)
};

// ---------- Helfer ----------

function place(a: { city?: string | null; street?: string | null }): string {
  const parts = [a.street?.trim(), a.city?.trim()].filter(Boolean);
  return parts.join(", ");
}

function formatRel(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 60) return `vor ${Math.max(1, min)} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.round(h / 24)} Tag${h < 48 ? "" : "e"}`;
}

// Deutsche Bezeichnungen für die wichtigsten Waze-Typen
function alertLabel(type: string, subtype: string | null | undefined): { label: string; kind: TrafficItem["kind"] } | null {
  const st = (subtype ?? "").toUpperCase();
  if (type === "POLICE") {
    if (st.includes("MOBILE_CAMERA")) return { label: "Mobilblitzer", kind: "blitzer" };
    if (st.includes("HIDDEN")) return { label: "Polizei (verdeckt)", kind: "blitzer" };
    if (st.includes("VISIBLE")) return { label: "Polizei (sichtbar)", kind: "blitzer" };
    return { label: "Polizeimeldung", kind: "blitzer" };
  }
  if (type === "ACCIDENT") return { label: st.includes("MAJOR") ? "Schwerer Unfall" : "Unfall", kind: "verkehr" };
  if (type === "ROAD_CLOSED") {
    if (st.includes("CONSTRUCTION")) return { label: "Baustellen-Sperrung", kind: "sperrung" };
    if (st.includes("EVENT")) return { label: "Sperrung (Veranstaltung)", kind: "sperrung" };
    return { label: "Straße gesperrt", kind: "sperrung" };
  }
  if (type === "CONSTRUCTION") return { label: "Baustelle", kind: "baustelle" };
  if (type === "HAZARD") {
    if (st.includes("CONSTRUCTION")) return { label: "Baustelle", kind: "baustelle" };
    if (st.includes("WEATHER")) return { label: "Wettergefahr", kind: "stoerung" };
    return { label: "Gefahrenstelle", kind: "stoerung" };
  }
  if (type === "JAM") return { label: "Stau", kind: "verkehr" };
  return null; // MISC & Co. überspringen
}

function mapAlert(a: WazeAlert): TrafficItem | null {
  const type = (a.type ?? "").toUpperCase();
  const pub = a.publish_datetime_utc ?? null;
  // Nur frische Meldungen – alles Ältere staut die Liste nur zu
  if (!pub || Date.now() - Date.parse(pub) > ALERT_MAX_AGE_MS) return null;

  const mapped = alertLabel(type, a.subtype);
  if (!mapped) return null;
  const { label, kind } = mapped;
  const where = place(a);
  const title = [label, where].filter(Boolean).join(" · ");

  const bits: string[] = [];
  if (a.description && a.description !== a.subtype) bits.push(a.description);
  if (a.num_thumbs_up && a.num_thumbs_up > 0) bits.push(`${a.num_thumbs_up} Bestätigungen`);
  if (a.alert_reliability && a.alert_reliability >= 8) bits.push(`Zuverlässigkeit ${a.alert_reliability}/10`);

  return {
    id: `wz:a:${a.alert_id ?? `${type}:${where}:${pub}`}`,
    kind,
    title,
    detail: bits.join(" · ").slice(0, 220),
    timeLabel: formatRel(pub) || "gerade gemeldet",
    source: "Waze (Community)",
    url: null,
    publishedAt: pub,
    trafficRelevant: true,
  };
}

function mapJam(j: WazeJam): TrafficItem | null {
  const upd = j.update_datetime_utc ?? null;
  if (upd && Date.now() - Date.parse(upd) > JAM_MAX_AGE_MS) return null;
  const delay = j.delay_seconds ?? 0;
  const len = j.length_meters ?? 0;
  // Kleine Nadelstiche rausfiltern
  if (delay < 30 && len < 300) return null;
  const where = place(j);
  const mins = Math.max(1, Math.round(delay / 60));
  const speed = j.speed_kmh != null ? `${Math.round(j.speed_kmh)} km/h` : null;
  const title = ["Stau", where].filter(Boolean).join(" · ");
  const bits = [`${len >= 1000 ? `${(len / 1000).toFixed(1)} km` : `${Math.round(len)} m`}`, speed, `+${mins} Min.`].filter(Boolean);
  return {
    id: `wz:j:${j.jam_id ?? title}`,
    kind: "verkehr",
    title,
    detail: bits.join(" · "),
    timeLabel: formatRel(upd),
    source: "Waze (Community)",
    url: null,
    publishedAt: upd,
    trafficRelevant: true,
  };
}

function dedupe(items: TrafficItem[]): TrafficItem[] {
  const byId = new Map<string, TrafficItem>();
  const byPlace = new Map<string, TrafficItem>();
  for (const it of items) {
    if (byId.has(it.id)) continue;
    byId.set(it.id, it);
    // Gleicher Typ an gleicher Stelle → nur die frischeste Meldung behalten
    const spot = `${it.kind}:${it.title}`;
    const prev = byPlace.get(spot);
    if (!prev || (Date.parse(it.publishedAt ?? "") || 0) > (Date.parse(prev.publishedAt ?? "") || 0)) {
      byPlace.set(spot, it);
    }
  }
  return [...byPlace.values()];
}

// ---------- Öffentliche Funktion ----------

function pausedStatus(detail: string): SourceStatus {
  return { key: "waze", label: "Waze-Meldungen (Community)", ok: true, detail, fetchedAt: null };
}

export async function getWaze(): Promise<WazeResult> {
  if (!KEY) {
    return { items: [], status: null, quotaLeft: null };
  }

  const key = "waze:v2";
  const cached = cacheGet<{ items: TrafficItem[]; detail: string }>(key);
  if (cached) {
    return {
      items: cached.items,
      status: { key: "waze", label: "Waze-Meldungen (Community)", ok: true, detail: cached.detail, fetchedAt: null },
      quotaLeft: Math.max(0, MONTHLY_BUDGET - loadLedger().used),
    };
  }

  // Kontingent-Schutz: Mo-Do zwischen 01:00 und 04:00 Uhr nachts kein frisches Monatskontingent verbrennen
  const nowParts = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const bHour = parseInt(nowParts.find((p) => p.type === "hour")?.value ?? "12", 10);
  const bWd = (nowParts.find((p) => p.type === "weekday")?.value ?? "").slice(0, 2);
  if (["Mo", "Di", "Mi", "Do"].includes(bWd) && bHour >= 1 && bHour <= 3) {
    const staleNight = cacheStale<{ items: TrafficItem[]; detail: string }>(key);
    if (staleNight) {
      return {
        items: staleNight.items,
        status: pausedStatus(`Nacht-Sparmodus (schont Monats-Kontingent) · ${staleNight.detail}`),
        quotaLeft: Math.max(0, MONTHLY_BUDGET - loadLedger().used),
      };
    }
  }

  // Haushaltsbuch prüfen: Monat frisch? Pausiert? Budget aufgebraucht?
  let ledger = loadLedger();
  const remaining = Math.max(0, MONTHLY_BUDGET - ledger.used);
  if (ledger.cooldownUntil > Date.now()) {
    const stale = cacheStale<{ items: TrafficItem[]; detail: string }>(key);
    const h = Math.ceil((ledger.cooldownUntil - Date.now()) / 3600000);
    return {
      items: stale?.items ?? [],
      status: pausedStatus(`pausiert für ~${h} h (Kontingent des Free-Plans aufgebraucht)`),
      quotaLeft: remaining,
    };
  }
  if (remaining <= 0) {
    const stale = cacheStale<{ items: TrafficItem[]; detail: string }>(key);
    return {
      items: stale?.items ?? [],
      status: pausedStatus("Monats-Budget erreicht – Pause bis zum Monatswechsel"),
      quotaLeft: 0,
    };
  }

  try {
    const url =
      `https://api.openwebninja.com/waze/alerts-and-jams` +
      `?center=${CENTER}&radius=${RADIUS_KM}&radius_units=KM&max_alerts=25&max_jams=10`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "x-api-key": KEY, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 429 || res.status === 402 || res.status === 403) {
      // Anfrage kam beim Anbieter an → zählen + Pause
      ledger.used += 1;
      ledger.cooldownUntil = Date.now() + COOLDOWN_MS;
      saveLedger(ledger);
      const stale = cacheStale<{ items: TrafficItem[]; detail: string }>(key);
      return {
        items: stale?.items ?? [],
        status: pausedStatus("pausiert für 24 h (Kontingent-Prüfung nötig – bitte in OpenWeb Ninja nachsehen)"),
        quotaLeft: Math.max(0, MONTHLY_BUDGET - ledger.used),
      };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = (await res.json()) as { status?: string; data?: { alerts?: WazeAlert[]; jams?: WazeJam[] } };
    const data = json.data ?? {};
    const alerts = dedupe((data.alerts ?? []).map(mapAlert).filter((x): x is TrafficItem => x !== null));
    const jams = dedupe((data.jams ?? []).map(mapJam).filter((x): x is TrafficItem => x !== null));
    const items = [...alerts, ...jams].slice(0, 12);

    ledger.used += 1;
    ledger.last = Date.now();
    saveLedger(ledger);

    const left = Math.max(0, MONTHLY_BUDGET - ledger.used);
    const detail =
      items.length > 0
        ? `${alerts.length} Meldungen · ${jams.length} Staus (20 km) · noch ~${left} Abfragen diesen Monat`
        : `gerade keine frischen Meldungen im Umkreis · noch ~${left} Abfragen diesen Monat`;
    cacheSet(key, { items, detail }, CACHE_TTL_MS);
    return {
      items,
      status: { key: "waze", label: "Waze-Meldungen (Community)", ok: true, detail, fetchedAt: null },
      quotaLeft: left,
    };
  } catch (e) {
    const stale = cacheStale<{ items: TrafficItem[]; detail: string }>(key);
    if (stale) {
      return {
        items: stale.items,
        status: { key: "waze", label: "Waze-Meldungen (Community)", ok: true, detail: "gecacht (Quelle gerade langsam)", fetchedAt: null },
        quotaLeft: Math.max(0, MONTHLY_BUDGET - loadLedger().used),
      };
    }
    return {
      items: [],
      status: {
        key: "waze",
        label: "Waze-Meldungen (Community)",
        ok: false,
        detail: `nicht erreichbar: ${e instanceof Error ? e.message : "Fehler"}`,
        fetchedAt: null,
      },
      quotaLeft: Math.max(0, MONTHLY_BUDGET - loadLedger().used),
    };
  }
}
