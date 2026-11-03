// Der Fahrer-Index (0-100): schätzt pro Stunde, wie gut die Fahrgast-Nachfrage
// in der gewählten Stadt sein wird – auf Basis von Wetter, Feiertagen, Ferien,
// Heimspielen, Veranstaltungen, Nachtleben-Rhythmus und Monatswechsel.
// Heuristik für Planung, keine offiziellen Daten.

import type {
  CityEvent,
  FootballMatch,
  HolidayInfo,
  HourScore,
  ReasonChip,
  WeatherData,
  FerienInfo,
} from "./sources/types";
import { ferienFor } from "./sources/ferien";
import { daysBetween, weekdayOf } from "./sources/time";

// ---------- Grundprofil pro Wochentag (typische Nachfragekurve) ----------
// Index 0-6 = Mo-So. Werte = Basis-Score 0-100 pro Stunde.
const BASE: number[][] = [
  // Mo
  [12, 10, 8, 6, 5, 6, 20, 45, 50, 35, 28, 28, 38, 36, 30, 30, 38, 52, 55, 45, 38, 30, 22, 16],
  // Di
  [12, 10, 8, 6, 5, 6, 20, 45, 50, 35, 28, 28, 38, 36, 30, 30, 38, 52, 55, 45, 38, 30, 22, 16],
  // Mi
  [12, 10, 8, 6, 5, 6, 20, 45, 50, 35, 28, 28, 38, 36, 30, 30, 38, 52, 55, 45, 40, 34, 26, 20],
  // Do (Kneipenabend)
  [14, 12, 9, 7, 5, 6, 20, 45, 50, 35, 28, 28, 38, 36, 30, 32, 40, 52, 55, 45, 44, 48, 48, 44],
  // Fr
  [35, 28, 20, 12, 8, 8, 18, 42, 46, 32, 26, 26, 36, 34, 30, 32, 42, 56, 58, 52, 56, 64, 70, 74],
  // Sa
  [66, 58, 44, 28, 14, 8, 8, 12, 18, 24, 30, 34, 38, 38, 40, 42, 44, 48, 50, 54, 62, 70, 74, 76],
  // So
  [56, 44, 30, 16, 8, 8, 8, 10, 14, 22, 32, 40, 44, 40, 34, 32, 32, 36, 42, 46, 40, 32, 24, 18],
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
  weather: WeatherData;
  holidays: Map<string, string>;
  schoolFree: Map<string, string>;
  ferien: FerienInfo[];
  football: FootballMatch[];
  events: CityEvent[];
};

export function computeHourly(input: ScoreInput): HourScore[] {
  const { todayKey, weather, holidays, schoolFree, football, events } = input;

  // Hilfskarten
  const wxByHour = new Map<string, WeatherData["hourly"][number]>();
  for (const h of weather.hourly) wxByHour.set(`${h.dateKey}:${h.hour}`, h);

  const dayOfHolidayBefore = new Set<string>();
  for (const [dk] of holidays) {
    // Vorabend aller Feiertage
    const [y, m, d] = dk.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    dayOfHolidayBefore.add(dt.toISOString().slice(0, 10));
  }

  // 16 Tage ab heute
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

    // Tagesfaktoren einmal pro Tag berechnen
    const holidayName = holidays.get(dateKey);
    const eveBeforeHoliday = dayOfHolidayBefore.has(dateKey) && wd !== 6 && wd !== 7;
    const ferien = ferienFor(dateKey);
    const ferienStart = ferien && ferien.startKey === dateKey;
    const ferienEnde = ferien && ferien.endKey === dateKey;
    const schoolFreeDay = schoolFree.get(dateKey);
    const dayNum = parseInt(dateKey.slice(8, 10), 10);
    const payDay = dayNum >= 29 || dayNum <= 2;
    // Semester-Uni: ca.-Zeiträume (Heuristik, klar gekennzeichnet)
    const mmdd = dateKey.slice(5, 10);
    const uniSemester =
      (mmdd >= "10-15" || mmdd <= "02-15") || (mmdd >= "04-15" && mmdd <= "07-20");

    const dayChips: ReasonChip[] = [];
    if (holidayName) dayChips.push({ icon: "🎉", label: `Feiertag: ${holidayName}`, weight: 12 });
    if (eveBeforeHoliday) dayChips.push({ icon: "🥂", label: "Abend vor Feiertag", weight: 14 });
    if (ferien) dayChips.push({ icon: "🏝️", label: `${ferien.name} (Schule frei)`, weight: 6 });

    for (let hour = 0; hour < 24; hour++) {
      const wx = wxByHour.get(`${dateKey}:${hour}`);
      let score = baseRow[hour];
      const chips: ReasonChip[] = [];

      // ---- Wetter ----
      if (wx) {
        if (isSnowCode(wx.weatherCode)) {
          const b = 30;
          score += b;
          addChip(chips, { icon: "❄️", label: "Schnee", weight: b });
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
          addChip(chips, { icon: "🌫️", label: "Nebel", weight: 8 });
        }
        if (wx.temp <= -5) {
          score += 10;
          addChip(chips, { icon: "🥶", label: `Kälte ${Math.round(wx.temp)}°C`, weight: 10 });
        } else if (wx.temp >= 32) {
          score += 8;
          addChip(chips, { icon: "🥵", label: `Hitze ${Math.round(wx.temp)}°C`, weight: 8 });
        }
        if (wx.windGust >= 60) {
          score += 8;
          addChip(chips, { icon: "🌬️", label: `Sturm ${Math.round(wx.windGust)} km/h`, weight: 8 });
        }
        // Schönes Wetter: mehr Leute laufen/fahren Rad -> leichte Abzüge bei Tagstunden
        if (wx.weatherCode <= 2 && wx.temp >= 20 && wx.temp <= 27 && wx.precip < 0.1 && hour >= 11 && hour <= 19) {
          score -= 3;
          addChip(chips, { icon: "☀️", label: "Schönes Wetter (Fußgänger)", weight: -3 });
        }
      }

      // ---- Kalender ----
      if (holidayName) {
        score += 12;
        addChip(chips, { icon: "🎉", label: `Feiertag: ${holidayName}`, weight: 12 });
      }
      if (eveBeforeHoliday && hour >= 17) {
        score += 14;
        addChip(chips, { icon: "🥂", label: "Abend vor Feiertag", weight: 14 });
      }
      if (ferien) {
        score += 6;
        if (!chips.some((c) => c.label.includes("Schule frei"))) {
          addChip(chips, { icon: "🏝️", label: `${ferien.name} (Schule frei)`, weight: 6 });
        }
        if (ferienStart) {
          score += 4;
          addChip(chips, { icon: "🚗", label: "Ferienstart (Reisen)", weight: 4 });
        }
        if (ferienEnde) {
          score += 4;
          addChip(chips, { icon: "🛣️", label: "Ferienende (Rückreise)", weight: 4 });
        }
      }
      if (schoolFreeDay && !ferien) {
        // z.B. Buß- und Bettag in Bayern: kein Feiertag, aber Schulen frei
        score += 6;
        addChip(chips, { icon: "🎒", label: `${schoolFreeDay} (Schule frei)`, weight: 6 });
      }
      if (payDay) {
        score += 7;
        addChip(chips, { icon: "💸", label: "Monatswechsel (Gehälter)", weight: 7 });
      }
      if (uniSemester && (wd === 3 || wd === 4 || wd === 5 || wd === 6) && hour >= 20) {
        score += 6;
        addChip(chips, { icon: "🎓", label: "Uni-Semester (ca.)", weight: 6 });
      }

      // ---- Fest-/Sondertermine ohne Uhrzeit (Silvester, Weihnachten) ----
      const mmddFull = dateKey.slice(5);
      if (mmddFull === "12-31" && hour >= 17) {
        score += 25;
        addChip(chips, { icon: "🎆", label: "Silvester", weight: 25 });
      }
      if (mmddFull === "01-01" && hour <= 4) {
        score += 22;
        addChip(chips, { icon: "🎉", label: "Neujahrsnacht", weight: 22 });
      }
      if (mmddFull === "12-24" && hour >= 12 && hour <= 20) {
        score += 12;
        addChip(chips, { icon: "🎄", label: "Heiligabend (Kirche/Besuche)", weight: 12 });
      }
      if ((mmddFull === "12-25" || mmddFull === "12-26") && hour >= 10) {
        score += 8;
        addChip(chips, { icon: "🎄", label: "Weihnachten", weight: 8 });
      }

      // ---- Heimspiele Jahn ----
      for (const m of football) {
        if (m.dateKey !== dateKey) continue;
        const rel = hour - m.hour;
        if (rel >= -2 && rel <= 3) {
          score += 20;
          addChip(chips, { icon: "⚽", label: `Heimspiel ${String(m.hour).padStart(2, "0")}:00 (${m.competition})`, weight: 20 });
        } else if (m.hour >= 18 && rel >= 4 && rel <= 6) {
          score += 8;
          addChip(chips, { icon: "⚽", label: "Nach dem Heimspiel", weight: 8 });
        }
      }

      // ---- Veranstaltungen ----
      for (const ev of events) {
        // Tag im Event-Zeitraum?
        if (dateKey < ev.dateKey || dateKey > ev.endKey) continue;
        if (ev.relevance < 1.5) continue; // reine Kultur/Sonstiges: kein Push

        let active = false;
        if (ev.weekdayHours) {
          const wh = ev.weekdayHours[wd];
          if (wh && hour >= wh[0] && hour < wh[1]) active = true;
        } else if (ev.startHour !== null) {
          const s = ev.startHour;
          const e = ev.endHour ?? ev.startHour + 2;
          if (hour >= s && hour < Math.max(e, s + 1)) active = true;
        } else {
          // ohne Zeit: grob 10-23 Uhr als Aktivitätsfenster
          if (hour >= 10 && hour <= 23) active = true;
        }
        if (!active) continue;

        const isEvening = hour >= 16;
        let bonus = 0;
        if (ev.category === "fest") bonus = isEvening ? 14 : 8;
        else if (ev.category === "party") bonus = hour >= 21 ? 14 : 10;
        else if (ev.category === "music") bonus = 12;
        else if (ev.category === "sport") bonus = 6; // Heimspiel separat schon bewertet
        if (bonus > 0) {
          score += bonus;
          const shortTitle = ev.title.length > 30 ? ev.title.slice(0, 28) + "…" : ev.title;
          addChip(chips, { icon: ICONS[ev.category], label: shortTitle, weight: bonus });
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
    const dayHours = sorted.filter((h) => h.hour >= 6 && h.hour <= 23);
    const dayAvg = Math.round(dayHours.reduce((s, h) => s + h.score, 0) / Math.max(dayHours.length, 1));
    let peak = sorted[0];
    for (const h of sorted) if (h.score > peak.score) peak = h;

    // Beste 2h-Fenster (nicht überlappend)
    const windows: BestWindow[] = [];
    for (let h = 6; h <= 22; h++) {
      const w = sorted.filter((x) => x.hour >= h && x.hour < h + 2);
      if (w.length < 2) continue;
      windows.push({
        dateKey,
        startHour: h,
        endHour: h + 2,
        score: Math.round(w.reduce((s, x) => s + x.score, 0) / w.length),
        reasons: mergeChips(w),
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
    // Tages-Chips aus den Gründen der Top-Stunden
    const topHours = sorted.filter((h) => h.score >= Math.max(45, peak.score - 15)).slice(0, 6);
    mergeChips(topHours).slice(0, 4).forEach((c) => chips.push(c));

    days.push({
      dateKey,
      weekday: weekdayOf(dateKey),
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
    return { verdict: peakHour >= 20 ? "Top-Nacht" : peakHour >= 16 ? "Starker Abend" : "Top-Tag", short: "Top" };
  }
  if (dayMax >= 62) {
    return { verdict: peakHour >= 20 ? "Starker Spätabend" : peakHour >= 16 ? "Starker Abend" : "Guter Tag", short: "Gut" };
  }
  if (dayMax >= 48) {
    return { verdict: peakHour >= 18 ? "Solider Abend" : "Solider Tag", short: "Ok" };
  }
  return { verdict: "Ruhiger Tag", short: "Schwach" };
}

type DaySummary = {
  dateKey: string;
  weekday: number;
  dayAvg: number;
  dayMax: number;
  peakHour: number;
  verdict: string;
  verdictShort: string;
  bestWindows: BestWindow[];
  chips: ReasonChip[];
  weatherCode: number;
  precipSum: number;
  tempMax: number;
  tempMin: number;
  sunset: string | null;
  sunrise: string | null;
};

type BestWindow = {
  dateKey: string;
  startHour: number;
  endHour: number;
  score: number;
  reasons: ReasonChip[];
};

type DaySummaries = {
  days: DaySummary[];
  holidayMap: Map<string, string>;
};
