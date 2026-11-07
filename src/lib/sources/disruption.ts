// ÖPNV-Störungen und Streiks aus den bereits geladenen Quellen:
// Deutsche-Bahn-Live-Zahlen (bahn.ts) sowie die vorhandenen RSS-/Google-Alerts-Einträge.
// Keine eigenen Abrufe, keine neuen Endpunkte, keine Schätzung als Fakt.

import { BAHNHOF_REGENSBURG_URL } from "./bahn";
import type { AlertItem, DisruptionSeverity, TrafficItem } from "./types";

// Zeitfenster, in dem der Bonus auf den Fahrer-Index wirkt.
const WINDOW_HOURS = 3;
// Meldungen älter als 48 Stunden zählen nicht.
const MAX_AGE_MS = 48 * 3600 * 1000;

const STRIKE_RE = /streik|warnstreik|arbeitsniederlegung/i;
const TRANSPORT_RE = /bahn|öpnv|oepnv|nahverkehr|\bbus\b|\bgdl\b|\bevg\b|ver\.?\s?di/i;
const REGION_RE = /regensburg|oberpfalz|bayern|bundesweit/i;
// Zurückgenommene oder beendete Streiks sind keine Störung mehr.
const ENDED_RE = /beendet|abgesagt|zurückgezogen|zurueckgezogen|ausgesetzt|einigung|vorbei/i;

export type DetectedDisruption = {
  severity: DisruptionSeverity;
  title: string;
  source: string;
  publishedAt: string | null;
  url: string | null;
  dateKey: string;
  startHour: number;
  endHour: number; // exklusiv
};

type Candidate = {
  title: string;
  text: string;
  source: string;
  url: string | null;
  publishedAt: string | null;
};

function findStrike(candidates: Candidate[]): Candidate | null {
  const recent = candidates
    .filter((c) => {
      if (!c.publishedAt) return false;
      const ts = Date.parse(c.publishedAt);
      return Number.isFinite(ts) && Date.now() - ts <= MAX_AGE_MS;
    })
    .sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));

  for (const c of recent) {
    if (!STRIKE_RE.test(c.text)) continue;
    // "Autobahn" ist keine Bahn.
    if (!TRANSPORT_RE.test(c.text.replace(/autobahn/gi, ""))) continue;
    if (!REGION_RE.test(c.text)) continue;
    if (ENDED_RE.test(c.title)) continue;
    return c;
  }
  return null;
}

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

// Schwellen aus der Aufgabe: ab 2 Ausfällen oder 3 Zügen über 15 Minuten stark,
// darunter leicht. Ohne Auffälligkeit gar keine Störung.
function bahnDisruption(
  cancellations: number,
  delayed15: number
): { severity: DisruptionSeverity; title: string } | null {
  if (cancellations <= 0 && delayed15 <= 0) return null;

  const parts: string[] = [];
  if (cancellations > 0) parts.push(count(cancellations, "Ausfall", "Ausfälle"));
  if (delayed15 > 0) parts.push(`${count(delayed15, "Zug", "Züge")} über 15 min verspätet`);

  const title = `Bahn: ${parts.join(", ")}`;
  if (cancellations >= 2 || delayed15 >= 3) return { severity: "stark", title };
  return { severity: "leicht", title };
}

export function detectDisruption(input: {
  traffic: TrafficItem[];
  scene: AlertItem[];
  cancellations: number;
  delayed15: number;
  dateKey: string;
  hour: number;
}): DetectedDisruption | null {
  const window = {
    dateKey: input.dateKey,
    startHour: input.hour,
    endHour: Math.min(24, input.hour + WINDOW_HOURS),
  };

  const candidates: Candidate[] = [
    ...input.scene.map((s) => ({
      title: s.title,
      text: `${s.title} ${s.snippet}`,
      source: `Google Alert · ${s.feed}`,
      url: s.url,
      publishedAt: s.publishedAt,
    })),
    ...input.traffic.map((t) => ({
      title: t.title,
      text: `${t.title} ${t.detail}`,
      source: t.source,
      url: t.url,
      publishedAt: t.publishedAt,
    })),
  ];

  // Streik hat den höchsten Bonus – angezeigt und gewertet wird immer nur eine Störung.
  const strike = findStrike(candidates);
  if (strike) {
    return {
      severity: "streik",
      title: strike.title,
      source: strike.source,
      publishedAt: strike.publishedAt,
      url: strike.url,
      ...window,
    };
  }

  const bahn = bahnDisruption(input.cancellations, input.delayed15);
  if (bahn) {
    return {
      severity: bahn.severity,
      title: bahn.title,
      source: "Deutsche Bahn Live (Regensburg Hbf)",
      publishedAt: new Date().toISOString(),
      url: BAHNHOF_REGENSBURG_URL,
      ...window,
    };
  }

  return null;
}
