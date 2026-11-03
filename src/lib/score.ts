// Der Fahrer-Index (0-100): schätzt pro Stunde, wie gut die Fahrgast-Nachfrage
// in Regensburg & Umland sein wird – auf Basis von Wetter, Feiertagen, Schulferien,
// Uni-/OTH-Vorlesungszeiten, Live-Bahn-Lage am Hbf, Werk-Schichtwechseln (BMW/Krones),
// Klinik-Entlassungen (UKR/Barmherzige Brüder), SSV Jahn Heimspielen (mit Abreise-Peak),
// Veranstaltungen (Donau-Arena, Marinaforum, Altstadt) und Sperrstunden-Rhythmus.

import type {
  CityEvent,
  FootballMatch,
  HourScore,
  ReasonChip,
  WeatherData,
  FerienInfo,
  DaySummary,
  BestWindow,
} from "./sources/types";
import { ferienFor, uniStatusFor } from "./sources/ferien";
import { getRegensburgPulse } from "./sources/recurring";
import { weekdayOf } from "./sources/time";

// ---------- Grundprofil pro Wochentag (typische Nachfragekurve Regensburg) ----------
// Index 0-6 = Mo-So. Werte = Basis-Score 0-100 pro Stunde (00:00 bis 23:00).
const BASE: number[][] = [
  // Mo
  [12, 10, 8, 8, 22, 32, 38, 50, 52, 42, 38, 34, 38, 36, 42, 34, 40, 52, 55, 45, 36, 28, 22, 16],
  // Di (abends Studenten-Kneipen in Vorlesungszeit)
  [12, 10, 8, 8, 22, 32, 38, 50, 52, 42, 38, 34, 38, 36, 42, 34, 40, 52, 55, 45, 38, 34, 28, 22],
  // Mi
  [14, 12, 9, 8, 22, 32, 38, 50, 52, 42, 38, 34, 38, 36, 42, 34, 40, 52, 55, 45, 40, 34, 28, 22],
  // Do (Klassischer Studenten- & Kneipenabend in Regensburg)
  [16, 14, 10, 8, 22, 32, 38, 50, 52, 42, 38, 34, 38, 36, 42, 36, 42, 54, 56, 48, 46, 50, 52, 48],
  // Fr (Frühpendler + starker Wochenend-Abend)
  [36, 30, 22, 14, 22, 30, 34, 46, 48, 38, 34, 32, 38, 38, 44, 38, 44, 56, 60, 56, 60, 66, 72, 76],
  // Sa (00:00-05:00 Sperrstunden-Welle von Fr-Nacht + Samstagabend-Peak)
  [72, 66, 56, 44, 28, 16, 14, 16, 20, 26, 32, 36, 40, 40, 42, 42, 46, 50, 54, 58, 64, 72, 76, 78],
  // So (00:00-05:00 Sperrstunden-Welle von Sa-Nacht + Sonntags-Rückreise am Hbf)
  [74, 68, 58, 46, 30, 18, 10, 12, 14, 22, 32, 40, 44, 40, 36, 34, 36, 42, 48, 50, 42, 34, 24, 18],
];

const isSnowCode = (c: number) => [71, 73, 75, 77, 85, 86].includes(c);
const isThunderCode = (c: number) => c >= 95;
const isFogCode = (c: number) => c === 45 || c === 48;

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function addChip(chips: ReasonChip[], chip: ReasonChip): void {
  const existing = chips.find((c) => c.label === chip.label);
  if (!existing) chips.push(chip);
}

export type ScoreInput = {
  todayKey: string;
  nowHour?: number;
  weather: WeatherData;
  holidays: Map<string, string>;
  schoolFree: Map<string, string>;
  ferien: FerienInfo[];
  football: FootballMatch[];
  events: CityEvent[];
  bahnBoostNow?: number;
  bahnBoostNext?: number;
  bahnChipLabel?: string | null;
  bahnHotspotDetail?: string | null;
};

export function computeHourly(input: ScoreInput): HourScore[] {
  const {
    todayKey,
    nowHour = -1,
    weather,
    holidays,
    schoolFree,
    football,
    events,
    bahnBoostNow = 0,
    bahnBoostNext = 0,
    bahnChipLabel = null,
    bahnHotspotDetail = null,
  } = input;

  const wxByHour = new Map<string, WeatherData["hourly"][number]>();
  for (const h of weather.hourly) wxByHour.set(`${h.dateKey}:${h.hour}`, h);

  const dayOfHolidayBefore = new Set<string>();
  for (const [dk] of holidays) {
    const [y, m, d] = dk.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    dayOfHolidayBefore.add(dt.toISOString().slice(0, 10));
  }

  const allDays: string[] = [];
  for (let i = 0; i < 16; i++) {
    const [y, m, d] = todayKey.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + i);
    allDays.push(dt.toISOString().slice(0, 10));
  }

  const out: HourScore[] = [];

  for (const dateKey of allDays) {
    const wd = weekdayOf(dateKey); // 1=Mo..7=So
    const baseRow = BASE[wd - 1];

    const holidayName = holidays.get(dateKey);
    const eveBeforeHoliday = dayOfHolidayBefore.has(dateKey) && wd !== 6 && wd !== 7;
    const ferien = ferienFor(dateKey);
    const ferienStart = ferien && ferien.startKey === dateKey;
    const ferienEnde = ferien && ferien.endKey === dateKey;
    const schoolFreeDay = schoolFree.get(dateKey);
    const dayNum = parseInt(dateKey.slice(8, 10), 10);
    const payDay = dayNum >= 28 || dayNum <= 3;
    const uni = uniStatusFor(dateKey);

    for (let hour = 0; hour < 24; hour++) {
      const wx = wxByHour.get(`${dateKey}:${hour}`);
      let score = baseRow[hour];
      const chips: ReasonChip[] = [];

      // Automatischer Regensburger Rhythmus-Puls (Hotspot + Schicht/Klinik/Uni/Sperrstunde)
      const pulse = getRegensburgPulse(hour, wd, Boolean(holidayName), eveBeforeHoliday, uni.inLecture);
      score += pulse.bonus;
      if (pulse.chipLabel && pulse.chipIcon && Math.abs(pulse.bonus) >= 6) {
        addChip(chips, { icon: pulse.chipIcon, label: pulse.chipLabel, weight: pulse.bonus });
      }

      let hotspot = pulse.hotspot;
      let hotspotReason = pulse.hotspotReason;

      // ---- Wetter ----
      if (wx) {
        if (isSnowCode(wx.weatherCode)) {
          const b = 30;
          score += b;
          addChip(chips, { icon: "❄️", label: "Schnee & Glätte", weight: b });
        } else if (isThunderCode(wx.weatherCode)) {
          const b = 24;
          score += b;
          addChip(chips, { icon: "⛈️", label: "Gewitter", weight: b });
        } else if (wx.precip >= 0.1) {
          const b = wx.precip < 0.5 ? 10 : wx.precip < 1.5 ? 16 : wx.precip < 3 ? 22 : 26;
          score += b;
          addChip(chips, { icon: "🌧️", label: `Regen ${wx.precip.toFixed(1)} mm/h`, weight: b });
        }
        if (isFogCode(wx.weatherCode)) {
          score += 8;
          addChip(chips, { icon: "🌫️", label: "Dichter Nebel", weight: 8 });
        }
        if (wx.temp <= -5) {
          score += 10;
          addChip(chips, { icon: "🥶", label: `Frost ${Math.round(wx.temp)}°C`, weight: 10 });
        } else if (wx.temp >= 31) {
          score += 8;
          addChip(chips, { icon: "🥵", label: `Hitze ${Math.round(wx.temp)}°C`, weight: 8 });
        }
        if (wx.windGust >= 60) {
          score += 8;
          addChip(chips, { icon: "🌬️", label: `Sturmböen ${Math.round(wx.windGust)} km/h`, weight: 8 });
        }
        if (wx.weatherCode <= 2 && wx.temp >= 20 && wx.temp <= 27 && wx.precip < 0.1 && hour >= 11 && hour <= 19) {
          score -= 3;
          addChip(chips, { icon: "☀️", label: "Schönes Wetter (Fußgänger)", weight: -3 });
        }
      }

      // ---- Kalender, Ferien & Monatswechsel ----
      if (holidayName) {
        score += 12;
        addChip(chips, { icon: "🎉", label: `Feiertag: ${holidayName}`, weight: 12 });
      }
      if (eveBeforeHoliday && hour >= 18) {
        score += 16;
        addChip(chips, { icon: "🥂", label: "Vorabend Feiertag (Ausgeh-Nacht)", weight: 16 });
        hotspot = "Altstadt-Übergabepunkte (Petersweg / Dachauplatz / Bismarckplatz)";
        hotspotReason = "Vorabend eines gesetzlichen Feiertags – starkes Nachtleben wie am Wochenende";
      }
      if (ferien) {
        // Morgens weniger Schülerverkehr, abends/tagsüber mehr Ausflugs- & Reiseverkehr
        const ferienDelta = hour >= 6 && hour <= 8 && wd <= 5 ? -4 : 5;
        score += ferienDelta;
        if (ferienDelta > 0) {
          addChip(chips, { icon: "🏝️", label: `${ferien.name} (Schule frei)`, weight: ferienDelta });
        }
        if (ferienStart && hour >= 12 && hour <= 20) {
          score += 6;
          addChip(chips, { icon: "🚗", label: "Ferienstart (Reisewelle Hbf)", weight: 6 });
        }
        if (ferienEnde && hour >= 14 && hour <= 22) {
          score += 6;
          addChip(chips, { icon: "🛣️", label: "Ferienende (Rückreisewelle Hbf)", weight: 6 });
          hotspot = "Hauptbahnhof (Albertstraße) / Fernbus-Terminal";
          hotspotReason = "Ferien-Rückreisewelle am Regensburger Hauptbahnhof";
        }
      }
      if (schoolFreeDay && !ferien) {
        score += 6;
        addChip(chips, { icon: "🎒", label: `${schoolFreeDay} (Schule frei)`, weight: 6 });
      }
      if (payDay && (hour >= 17 || hour <= 3)) {
        score += 7;
        addChip(chips, { icon: "💸", label: "Monatswechsel (Gehalts-Wochenende)", weight: 7 });
      }

      // ---- Fest-/Sondertermine ohne Uhrzeit (Silvester, Weihnachten) ----
      const mmddFull = dateKey.slice(5);
      if (mmddFull === "12-31" && hour >= 17) {
        score += 28;
        addChip(chips, { icon: "🎆", label: "Silvesterabend", weight: 28 });
      }
      if (mmddFull === "01-01" && hour <= 5) {
        score += 30;
        addChip(chips, { icon: "🎉", label: "Neujahrsnacht (Dauerbetrieb)", weight: 30 });
      }
      if (mmddFull === "12-24" && hour >= 12 && hour <= 20) {
        score += 12;
        addChip(chips, { icon: "🎄", label: "Heiligabend (Familienbesuche)", weight: 12 });
      }
      if ((mmddFull === "12-25" || mmddFull === "12-26") && hour >= 10) {
        score += 8;
        addChip(chips, { icon: "🎄", label: "Weihnachtsfeiertag", weight: 8 });
      }

      // ---- Heimspiele SSV Jahn Regensburg (Anreise vs. ABREISE-PEAK) ----
      for (const m of football) {
        if (m.dateKey !== dateKey) continue;
        const rel = hour - m.hour;
        if (rel === -2 || rel === -1) {
          // Anreise-Fenster vor Anpfiff
          score += 12;
          addChip(chips, {
            icon: "⚽",
            label: `Anreise Jahn-Heimspiel (${String(m.hour).padStart(2, "0")}:00)`,
            weight: 12,
          });
          hotspot = "Hauptbahnhof → Jahnstadion (Franz-Josef-Strauß-Allee)";
          hotspotReason = `Anreise zum Heimspiel gegen ${m.away} (Anpfiff ${String(m.hour).padStart(2, "0")}:00 Uhr)`;
        } else if (rel === 0 || rel === 1) {
          // Spiel läuft -> Zuschauer sind im Stadion
          score += 6;
          addChip(chips, {
            icon: "⚽",
            label: `Spiel läuft: Jahn – ${m.away}`,
            weight: 6,
          });
        } else if (rel === 2 || rel === 3) {
          // SCHLUSSPFIFF & ABREISE-WELLE -> Maximaler Peak!
          const b = rel === 2 ? 28 : 18;
          score += b;
          addChip(chips, {
            icon: "⚽",
            label: `Abreise-Peak Jahnstadion (Ende vs. ${m.away})`,
            weight: b,
          });
          hotspot = "Jahnstadion (Franz-Josef-Strauß-Allee) / Hbf / Altstadt";
          hotspotReason = "Schlusspfiff im Jahnstadion – bis zu 15.000 Fans strömen gleichzeitig raus";
        }
      }

      // ---- Veranstaltungen (Donau-Arena, Marinaforum, Konzerte, Feste, Partys) ----
      for (const ev of events) {
        if (dateKey < ev.dateKey || dateKey > ev.endKey) continue;
        if (ev.relevance < 1.5) continue;

        let startH: number | null = ev.startHour;
        let endH: number | null = ev.endHour;
        if (ev.weekdayHours && ev.weekdayHours[wd]) {
          startH = ev.weekdayHours[wd][0];
          endH = ev.weekdayHours[wd][1];
        } else if (startH !== null && endH === null) {
          endH = startH + (ev.category === "sport" || ev.category === "music" ? 2 : 3);
        }

        const isArenaOrMajor = /donau-?arena|marinaforum|jahnstadion|audimax|alte mälzerei|velodrom|dult|christkindlmarkt|thurn und taxis/i.test(
          `${ev.title} ${ev.venue}`
        );

        let active = false;
        if (startH !== null && endH !== null) {
          if (hour >= startH && hour < Math.max(endH, startH + 1)) active = true;
        } else {
          if (hour >= 12 && hour <= 22) active = true;
        }

        if (!active) {
          // ABREISE-PEAK NACH VERANSTALTUNGSENDE (1 bis 2 Stunden nach Ende)
          if (endH !== null && hour >= endH && hour < endH + 2) {
            const eb =
              ev.category === "music" || ev.category === "sport"
                ? isArenaOrMajor ? 22 : 16
                : ev.category === "fest" || ev.category === "party"
                  ? 15
                  : 8;
            score += eb;
            const shortT = ev.title.length > 26 ? ev.title.slice(0, 24) + "…" : ev.title;
            addChip(chips, {
              icon: ICONS[ev.category] ?? "📌",
              label: `Abreise-Welle: ${shortT}`,
              weight: eb,
            });
            if (eb >= 15) {
              hotspot = `${ev.venue} → Hbf / Altstadt`;
              hotspotReason = `Veranstaltungsende „${shortT}“ – Besucher suchen Rückfahrt`;
            }
          }
          continue;
        }

        const isEvening = hour >= 17;
        let bonus = 0;
        if (ev.category === "fest") bonus = isEvening ? 14 : 8;
        else if (ev.category === "party") bonus = hour >= 21 ? 15 : 10;
        else if (ev.category === "music") bonus = isArenaOrMajor ? 15 : 12;
        else if (ev.category === "sport") bonus = isArenaOrMajor ? 16 : 8;
        else if (isArenaOrMajor) bonus = 10;

        if (bonus > 0) {
          score += bonus;
          const shortTitle = ev.title.length > 30 ? ev.title.slice(0, 28) + "…" : ev.title;
          addChip(chips, { icon: ICONS[ev.category] ?? "📌", label: shortTitle, weight: bonus });
          if (isArenaOrMajor && bonus >= 14) {
            hotspot = `${ev.venue} / Hauptbahnhof`;
            hotspotReason = `Großveranstaltung aktiv: ${shortTitle} (${ev.venue})`;
          }
        }
      }

      // ---- Live-Bahn-Boost am Regensburger Hbf (aktuelle & nächste Stunde) ----
      if (dateKey === todayKey && bahnBoostNow > 0 && (hour === nowHour || hour === nowHour + 1)) {
        const b = hour === nowHour ? bahnBoostNow : bahnBoostNext;
        if (b > 0) {
          score += b;
          if (bahnChipLabel) {
            addChip(chips, { icon: "🚕", label: bahnChipLabel, weight: b });
          }
          hotspot = "Hauptbahnhof Regensburg (Albertstraße / Bahnhofsvorplatz)";
          hotspotReason = bahnHotspotDetail ?? "Verspätete Züge / Zugausfall am Hauptbahnhof Regensburg";
        }
      }

      out.push({
        dateKey,
        hour,
        score: clamp(Math.round(score)),
        reasons: chips.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 4),
        temp: wx?.temp ?? 0,
        precip: wx?.precip ?? 0,
        weatherCode: wx?.weatherCode ?? 0,
        hotspot,
        hotspotReason,
      });
    }
  }

  return out;
}

const ICONS: Record<string, string> = {
  fest: "🎡",
  party: "🕺",
  music: "🎶",
  sport: "⚽",
  kultur: "🖼️",
  sonst: "📌",
};

// ---------- Tages-Zusammenfassung + beste Fenster ----------

export function summarizeDays(
  hours: HourScore[],
  todayKey: string,
  weather: WeatherData,
  holidays: Map<string, string>
): DaySummaries {
  const byDay = new Map<string, HourScore[]>();
  for (const h of hours) {
    const arr = byDay.get(h.dateKey) ?? [];
    arr.push(h);
    byDay.set(h.dateKey, arr);
  }

  const wxDaily = new Map(weather.daily.map((d) => [d.dateKey, d]));

  const days: DaySummary[] = [];
  for (const [dateKey, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.hour - b.hour);
    // Relevante Stunden für den Tagesschnitt (inkl. früher Morgen-Schicht ab 04:00 Uhr und Nacht)
    const dayHours = sorted.filter((h) => h.hour >= 4 && h.hour <= 23);
    const dayAvg = Math.round(dayHours.reduce((s, h) => s + h.score, 0) / Math.max(dayHours.length, 1));
    let peak = sorted[0];
    for (const h of sorted) if (h.score > peak.score) peak = h;

    // Beste 2h-Fenster (ab 04:00 Uhr für Frühschicht bis 24:00 Uhr, am Wochenende auch 00:00-04:00 Uhr)
    const windows: BestWindow[] = [];
    const wd = weekdayOf(dateKey);
    const startSearchHour = wd === 6 || wd === 7 ? 0 : 4;
    for (let h = startSearchHour; h <= 22; h++) {
      const w = sorted.filter((x) => x.hour >= h && x.hour < h + 2);
      if (w.length < 2) continue;
      const topH = w[0].score >= w[1].score ? w[0] : w[1];
      windows.push({
        dateKey,
        startHour: h,
        endHour: h + 2,
        score: Math.round(w.reduce((s, x) => s + x.score, 0) / w.length),
        reasons: mergeChips(w),
        hotspot: topH.hotspot,
      });
    }
    windows.sort((a, b) => b.score - a.score);
    const best: BestWindow[] = [];
    for (const w of windows) {
      if (best.every((b) => w.startHour >= b.endHour || w.endHour <= b.startHour)) best.push(w);
      if (best.length >= 3) break;
    }
    best.sort((a, b) => a.startHour - b.startHour);

    const day = daySummaryVerdict(dayAvg, peak.score, peak.hour);
    const wx = wxDaily.get(dateKey);
    const chips: ReasonChip[] = [];
    const topHours = sorted.filter((h) => h.score >= Math.max(45, peak.score - 15)).slice(0, 6);
    mergeChips(topHours).slice(0, 4).forEach((c) => chips.push(c));

    days.push({
      dateKey,
      weekday: wd,
      dayAvg,
      dayMax: peak.score,
      peakHour: peak.hour,
      verdict: day.verdict,
      verdictShort: day.short,
      bestWindows: best,
      chips,
      weatherCode: wx?.weatherCode ?? 0,
      precipSum: wx?.precipSum ?? 0,
      tempMax: wx?.tempMax ?? 0,
      tempMin: wx?.tempMin ?? 0,
      sunset: wx?.sunset ?? null,
      sunrise: wx?.sunrise ?? null,
    });
  }

  days.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return { days, holidayMap: holidays };
}

function mergeChips(hours: HourScore[]): ReasonChip[] {
  const map = new Map<string, ReasonChip>();
  for (const h of hours) {
    for (const c of h.reasons) {
      const ex = map.get(c.label);
      if (!ex || Math.abs(ex.weight) < Math.abs(c.weight)) map.set(c.label, c);
    }
  }
  return [...map.values()].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
}

function daySummaryVerdict(dayAvg: number, dayMax: number, peakHour: number): { verdict: string; short: string } {
  if (dayMax >= 75) {
    return { verdict: peakHour >= 20 || peakHour <= 4 ? "Top-Nacht" : peakHour >= 16 ? "Starker Abend" : "Top-Tag", short: "Top" };
  }
  if (dayMax >= 62) {
    return { verdict: peakHour >= 20 || peakHour <= 4 ? "Starke Nacht" : peakHour >= 16 ? "Starker Abend" : "Guter Tag", short: "Gut" };
  }
  if (dayMax >= 48) {
    return { verdict: peakHour >= 18 ? "Solider Abend" : "Solider Tag", short: "Ok" };
  }
  return { verdict: "Ruhiger Tag", short: "Schwach" };
}

type DaySummaries = {
  days: DaySummary[];
  holidayMap: Map<string, string>;
};
