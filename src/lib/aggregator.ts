// Orchestriert alle Quellen und baut die finale Antwort für das Dashboard.

import type {
  CityEvent,
  DemandResponse,
  HourScore,
  NowStatus,
  SourceStatus,
  WeatherData,
} from "./sources/types";
import { berlinParts, daysBetween, dateKeyOffset, relativeDayLabel, hourLabel } from "./sources/time";
import { geocode, getWeather, weatherText } from "./sources/weather";
import { getHolidays } from "./sources/holidays";
import { getFootball } from "./sources/football";
import { getEvents } from "./sources/events";
import { recurringEvents } from "./sources/recurring";
import { computeHourly, summarizeDays } from "./score";
import { ferienFor, uniStatusFor } from "./sources/ferien";
import { getTraffic } from "./sources/traffic";
import { getAlerts } from "./sources/alerts";
import { getDwdWarnings } from "./sources/dwd";
import { getBahnRegensburg } from "./sources/bahn";

export type PresetCity = { name: string; lat: number; lon: number };

export const PRESET_CITIES: PresetCity[] = [
  { name: "Regensburg", lat: 49.0151, lon: 12.1016 },
  { name: "Neutraubling", lat: 48.9353, lon: 12.1697 },
  { name: "Lappersdorf", lat: 49.0667, lon: 12.0333 },
  { name: "Kelheim", lat: 48.9167, lon: 11.8833 },
  { name: "Straubing", lat: 48.8811, lon: 12.5833 },
  { name: "Landshut", lat: 48.5389, lon: 12.1511 },
  { name: "Amberg", lat: 49.4428, lon: 11.8628 },
  { name: "Schwandorf", lat: 49.3206, lon: 12.1092 },
  { name: "Cham", lat: 49.225, lon: 12.8636 },
  { name: "Parsberg", lat: 49.1644, lon: 11.7264 },
];

export async function buildDemandResponse(cityQuery: string): Promise<DemandResponse> {
  const nowBerlin = berlinParts(new Date());
  const todayKey = nowBerlin.dateKey;
  const years = [todayKey.slice(0, 4), dateKeyOffset(todayKey, 320).slice(0, 4)];
  const uniqueYears = [...new Set(years)];

  // Stadt auflösen
  let geo = PRESET_CITIES.find((c) => c.name.toLowerCase() === cityQuery.toLowerCase());
  let geoSource: string = geo ? "Voreinstellung" : "";
  if (!geo) {
    const g = await geocode(cityQuery);
    if (g) {
      geo = { name: g.name, lat: g.lat, lon: g.lon };
      geoSource = "Geocoding";
    }
  }
  if (!geo) geo = PRESET_CITIES[0]; // Regensburg als Fallback

  const isRegensburg = geo.name.toLowerCase().includes("regensburg");

  // Alle Quellen parallel laden (inkl. Live-Bahn am Regensburger Hbf)
  const [wx, hol, ball, ev, traffic, alerts, dwd, bahn] = await Promise.all([
    getWeather(geo),
    getHolidays(uniqueYears),
    isRegensburg
      ? getFootball()
      : Promise.resolve({
          matches: [],
          status: { key: "football", label: "Jahn-Heimspiele (OpenLigaDB)", ok: true, detail: "Nur für Regensburg", fetchedAt: null } as SourceStatus,
        }),
    isRegensburg
      ? getEvents()
      : Promise.resolve({
          events: [],
          status: { key: "events", label: "Veranstaltungen (regensburg.de)", ok: true, detail: "Nur für Regensburg", fetchedAt: null } as SourceStatus,
        }),
    getTraffic(),
    getAlerts(),
    getDwdWarnings(),
    isRegensburg
      ? getBahnRegensburg()
      : Promise.resolve({
          scoreBoostNow: 0,
          scoreBoostNextHour: 0,
          chipLabel: null,
          hotspotDetail: null,
          trafficItems: [],
          status: { key: "bahn", label: "Deutsche Bahn Live (Hbf)", ok: true, detail: "Nur für Regensburg", fetchedAt: null } as SourceStatus,
        }),
  ]);
  const holidayMap = hol.maps.holidays;

  // Kuratierte Events nur im Fenster relevant
  const horizonEnd = dateKeyOffset(todayKey, 15);
  const curated = recurringEvents().filter((e) => e.endKey >= todayKey && e.dateKey <= horizonEnd);
  const liveEvents = ev.events
    .filter((e) => e.endKey >= todayKey && e.dateKey <= horizonEnd)
    .map((e) => ({ ...e, endKey: e.endKey > horizonEnd ? horizonEnd : e.endKey }));

  const allEvents = [...liveEvents, ...curated];

  // Scores berechnen
  const hours = computeHourly({
    todayKey,
    nowHour: nowBerlin.hour,
    weather: wx.data,
    holidays: holidayMap,
    schoolFree: hol.maps.schoolFree,
    ferien: [],
    football: ball.matches.filter((m) => m.dateKey <= horizonEnd),
    events: allEvents,
    bahnBoostNow: bahn.scoreBoostNow,
    bahnBoostNext: bahn.scoreBoostNextHour,
    bahnChipLabel: bahn.chipLabel,
    bahnHotspotDetail: bahn.hotspotDetail,
  });

  const { days } = summarizeDays(hours, todayKey, wx.data, holidayMap);
  // Jetzt-Status
  const now = buildNow(hours, days, wx.data, todayKey, nowBerlin.hour, nowBerlin.minute);

  // Ferien- & Uni-Semester-Hinweis oben im Header
  const noticeParts: string[] = [];
  const fToday = ferienFor(todayKey);
  if (fToday) {
    const remain = daysBetween(todayKey, fToday.endKey);
    noticeParts.push(
      remain === 0
        ? `Letzter Tag ${fToday.name}`
        : `Schulferien: ${fToday.name} (bis ${fToday.endKey.slice(8, 10)}.${fToday.endKey.slice(5, 7)}.)`
    );
  }
  const tomorrowKey = dateKeyOffset(todayKey, 1);
  const tomorrowHoliday = [...holidayMap.entries()].find(([dk]) => dk === tomorrowKey);
  const tomorrowSchoolFree = [...hol.maps.schoolFree.entries()].find(([dk]) => dk === tomorrowKey);
  if (tomorrowHoliday) {
    noticeParts.push(`Morgen Feiertag: ${tomorrowHoliday[1]}`);
  } else if (tomorrowSchoolFree) {
    noticeParts.push(`Morgen ${tomorrowSchoolFree[1]} (Schulen frei)`);
  }
  const uniToday = uniStatusFor(todayKey);
  noticeParts.push(uniToday.shortLabel);

  const holidayNotice = noticeParts.join(" · ");

  const sources: SourceStatus[] = [
    { ...wx.status },
    { ...bahn.status },
    { ...hol.status },
    { ...ball.status },
    { ...ev.status },
    { key: "recurring", label: "Regensburg-Rhythmus (Werke, Kliniken, Uni, Märkte)", ok: true, detail: `${curated.length} Groß-Events + Schicht/Klinik/Uni-Takt aktiv`, fetchedAt: null },
    { ...alerts.status },
    { ...dwd.status },
    {
      key: "coverage",
      label: "Abdeckung Veranstaltungen",
      ok: !isRegensburg || liveEvents.length > 0,
      detail: !isRegensburg
        ? "Nur für Regensburg"
        : liveEvents.length > 0
          ? `${liveEvents.length} Live-Termine + ${curated.length} kuratierte`
          : "Keine Live-Termine gefunden – Szene-Meldungen aktiv",
      fetchedAt: null,
    },
    { key: "geo", label: `Ort: ${geo.name}`, ok: true, detail: geoSource, fetchedAt: null },
  ];

  const effDate = (e: CityEvent) => (e.dateKey < todayKey ? todayKey : e.dateKey);
  const sortedEvents = [...allEvents].sort((a, b) =>
    (effDate(a) + String(a.startHour ?? 12)).localeCompare(effDate(b) + String(b.startHour ?? 12))
  );

  return {
    city: geo.name,
    generatedAt: new Date().toISOString(),
    berlinNow: nowBerlin,
    now,
    hours,
    days,
    events: sortedEvents,
    football: ball.matches.filter((m) => m.dateKey >= todayKey),
    traffic: [...dwd.items, ...bahn.trafficItems, ...traffic.items],
    sceneNews: alerts.scene,
    sources: [...sources, traffic.status],
    holidayNotice,
  };
}

function buildNow(
  hours: HourScore[],
  days: ReturnType<typeof summarizeDays>["days"],
  weather: WeatherData,
  todayKey: string,
  currentHour: number,
  currentMinute: number
): NowStatus {
  const current = hours.find((h) => h.dateKey === todayKey && h.hour === currentHour);
  const next3 = hours.filter((h) => h.dateKey === todayKey && h.hour > currentHour && h.hour <= currentHour + 3);
  const next3hScore = next3.length
    ? Math.round(next3.reduce((s, h) => s + h.score, 0) / next3.length)
    : current?.score ?? 0;

  const score = current?.score ?? 0;
  const diff = next3hScore - score;
  const trend: NowStatus["trend"] = diff >= 8 ? "up" : diff <= -8 ? "down" : "flat";
  const trendText =
    trend === "up"
      ? `Wird besser (Ø nächste 3h: ${next3hScore})`
      : trend === "down"
        ? `Geht zurück (Ø nächste 3h: ${next3hScore})`
        : `Bleibt stabil (Ø nächste 3h: ${next3hScore})`;

  const nowWx = weather.hourly.find((h) => h.dateKey === todayKey && h.hour === currentHour);
  const rainyNow = (nowWx?.precip ?? 0) >= 0.1;
  const rainNext3h = next3.some((h) => h.precip >= 0.1) || next3.some((h) => h.dateKey !== todayKey);
  const tomorrowDay = days.find((d) => d.dateKey === dateKeyOffset(todayKey, 1));

  // Status-Text
  let statusText: string;
  if (score >= 70) statusText = "Jetzt ist Spitzenzeit";
  else if (score >= 55) statusText = "Jetzt gut zu tun";
  else if (score >= 40) statusText = "Läuft ordentlich";
  else if (score >= 25) statusText = "Ruhig – gezielt positionieren";
  else statusText = "Flaute – Pause nutzen";

  // Empfehlung: nächstes gutes Fenster suchen
  let recommendation: string;
  const lookAhead = hours.filter(
    (h) =>
      (h.dateKey === todayKey && h.hour >= currentHour) ||
      (h.dateKey === dateKeyOffset(todayKey, 1) && h.hour <= 23)
  );
  const good = lookAhead.find((h) => h.score >= 55);
  if (score >= 55) {
    recommendation = rainyNow ? "Regen = hohe Nachfrage. Jetzt online bleiben." : "Gute Nachfrage – draußen bleiben lohnt sich.";
  } else if (good && good.dateKey === todayKey) {
    recommendation = `Nächste starke Welle: ab ${hourLabel(good.hour)} Uhr (Index ${good.score}).`;
  } else if (good) {
    recommendation = `Heute bleibt es ruhig – morgen ab ${hourLabel(good.hour)} Uhr (Index ${good.score}) starten.`;
  } else {
    recommendation = "Ruhige Phase – Tagesverlauf unten beachten.";
  }
  if (rainNext3h && !rainyNow) recommendation += " Regen zieht auf – Fahrten steigen.";

  // Feierabend-Tipp: ab 17 Uhr heute weiterfahren oder morgen besser starten?
  if (currentHour >= 17 && tomorrowDay) {
    const left = hours.filter((h) => h.dateKey === todayKey && h.hour >= currentHour);
    const tonightPeak = left.reduce((m, h) => Math.max(m, h.score), 0);
    if (tonightPeak < 45 && tomorrowDay.dayMax >= tonightPeak + 10) {
      recommendation += ` Feierabend-Tipp: heute kaum noch Spitze (max. ${tonightPeak}) – morgen deutlich stärker (Top ${tomorrowDay.dayMax} um ${hourLabel(tomorrowDay.peakHour)}).`;
    } else if (tonightPeak >= 60) {
      recommendation += ` Heute Abend noch Spitze bis ${tonightPeak} – dranbleiben.`;
    }
  }

  const nowChips = current?.reasons ?? [];
  const todaySun = weather.daily.find((d) => d.dateKey === todayKey);

  return {
    score,
    statusText,
    trend,
    trendText,
    next3hScore,
    isRainyNow: rainyNow,
    rainNext3h,
    precipNow: nowWx?.precip ?? 0,
    tempNow: Math.round(nowWx?.temp ?? 0),
    weatherCode: nowWx?.weatherCode ?? 0,
    sunsetToday: todaySun?.sunset ?? null,
    sunrisetToday: todaySun?.sunrise ?? null,
    nowChips,
    recommendation,
    hotspot: current?.hotspot ?? "Hauptbahnhof (Albertstraße) / Altstadt",
    hotspotReason: current?.hotspotReason ?? "Zentraler Knotenpunkt für Bahn & Innenstadt",
  };
}

export { weatherText, relativeDayLabel };
export type { CityEvent };
