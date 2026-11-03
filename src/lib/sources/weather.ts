// Wetter über Open-Meteo (kostenlos, ohne API-Key):
// Geocoding für beliebige Städte + stündliche Vorhersage für 16 Tage.

import type { WeatherData, WeatherHour, WeatherDay, SourceStatus } from "./types";
import { cacheGet, cacheSet, cacheStale } from "./cache";

const GEO_TTL = 7 * 24 * 3600 * 1000; // 7 Tage
const FC_TTL = 30 * 60 * 1000; // 30 Minuten

export type Geo = { name: string; lat: number; lon: number };

async function fetchTimeout(url: string, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

export async function geocode(query: string): Promise<Geo | null> {
  const key = `geo:${query.toLowerCase()}`;
  const cached = cacheGet<Geo>(key);
  if (cached) return cached;
  try {
    const res = await fetchTimeout(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&language=de&count=1&countryCode=DE`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const r = json?.results?.[0];
    if (!r) return null;
    const geo: Geo = { name: r.name, lat: r.latitude, lon: r.longitude };
    cacheSet(key, geo, GEO_TTL);
    return geo;
  } catch {
    return null;
  }
}

export async function getWeather(
  geo: Geo
): Promise<{ data: WeatherData; status: SourceStatus }> {
  const key = `wx:${geo.lat.toFixed(3)},${geo.lon.toFixed(3)}`;
  const cached = cacheGet<WeatherData>(key);
  if (cached) {
    return {
      data: cached,
      status: { key: "weather", label: "Wetter (Open-Meteo)", ok: true, detail: "Cache · 16 Tage", fetchedAt: null },
    };
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
    `&hourly=temperature_2m,precipitation,weather_code,wind_gusts_10m` +
    `&daily=weather_code,precipitation_sum,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
    `&timezone=Europe%2FBerlin&forecast_days=16`;

  try {
    const res = await fetchTimeout(url);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const j = await res.json();

    const hourly: WeatherHour[] = [];
    const times: string[] = j.hourly.time;
    for (let i = 0; i < times.length; i++) {
      const dk = times[i].slice(0, 10);
      const hr = parseInt(times[i].slice(11, 13), 10);
      hourly.push({
        dateKey: dk,
        hour: hr,
        temp: j.hourly.temperature_2m[i] ?? 0,
        precip: j.hourly.precipitation[i] ?? 0,
        weatherCode: j.hourly.weather_code[i] ?? 0,
        windGust: j.hourly.wind_gusts_10m[i] ?? 0,
      });
    }

    const daily: WeatherDay[] = (j.daily.time as string[]).map((dk, i) => ({
      dateKey: dk,
      weatherCode: j.daily.weather_code[i] ?? 0,
      precipSum: j.daily.precipitation_sum[i] ?? 0,
      tempMax: j.daily.temperature_2m_max[i] ?? 0,
      tempMin: j.daily.temperature_2m_min[i] ?? 0,
      sunrise: j.daily.sunrise?.[i] ?? null,
      sunset: j.daily.sunset?.[i] ?? null,
    }));

    const data: WeatherData = { city: geo.name, lat: geo.lat, lon: geo.lon, hourly, daily };
    cacheSet(key, data, FC_TTL);
    return {
      data,
      status: { key: "weather", label: "Wetter (Open-Meteo)", ok: true, detail: "Live · 16 Tage", fetchedAt: new Date().toISOString() },
    };
  } catch (e) {
    const stale = cacheStale<WeatherData>(key);
    if (stale) {
      return {
        data: stale,
        status: { key: "weather", label: "Wetter (Open-Meteo)", ok: true, detail: "Älterer Cache (Quelle gestört)", fetchedAt: null },
      };
    }
    return {
      data: { city: geo.name, lat: geo.lat, lon: geo.lon, hourly: [], daily: [] },
      status: { key: "weather", label: "Wetter (Open-Meteo)", ok: false, detail: e instanceof Error ? e.message : "Fehler", fetchedAt: null },
    };
  }
}

export const WEATHER_CODES: Record<number, { text: string; icon: string }> = {
  0: { text: "Klar", icon: "☀️" },
  1: { text: "Überwiegend klar", icon: "🌤️" },
  2: { text: "Wolkig", icon: "⛅" },
  3: { text: "Bedeckt", icon: "☁️" },
  45: { text: "Nebel", icon: "🌫️" },
  48: { text: "Reifnebel", icon: "🌫️" },
  51: { text: "Leichter Niesel", icon: "🌦️" },
  53: { text: "Niesel", icon: "🌦️" },
  55: { text: "Starker Niesel", icon: "🌧️" },
  56: { text: "Niesel gefrierend", icon: "🌧️" },
  57: { text: "Starker Niesel gefrierend", icon: "🌧️" },
  61: { text: "Leichter Regen", icon: "🌦️" },
  63: { text: "Regen", icon: "🌧️" },
  65: { text: "Starker Regen", icon: "🌧️" },
  66: { text: "Gefrierender Regen", icon: "🌧️" },
  67: { text: "Starker gefrierender Regen", icon: "🌧️" },
  71: { text: "Leichter Schnee", icon: "🌨️" },
  73: { text: "Schnee", icon: "❄️" },
  75: { text: "Starker Schnee", icon: "❄️" },
  77: { text: "Schneegriesel", icon: "🌨️" },
  80: { text: "Leichte Schauer", icon: "🌦️" },
  81: { text: "Schauer", icon: "🌧️" },
  82: { text: "Heftige Schauer", icon: "⛈️" },
  85: { text: "Schneeschauer", icon: "🌨️" },
  86: { text: "Starke Schneeschauer", icon: "❄️" },
  95: { text: "Gewitter", icon: "⛈️" },
  96: { text: "Gewitter mit Hagel", icon: "⛈️" },
  99: { text: "Schweres Gewitter", icon: "⛈️" },
};

export function weatherText(code: number): { text: string; icon: string } {
  return WEATHER_CODES[code] ?? { text: "—", icon: "🌡️" };
}
