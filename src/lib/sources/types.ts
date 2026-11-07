// Gemeinsame Typen für alle Datenquellen und den Fahrer-Index

export type SourceStatus = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  fetchedAt: string | null;
};

export type WeatherHour = {
  dateKey: string; // YYYY-MM-DD (Berlin)
  hour: number; // 0-23
  temp: number;
  precip: number; // mm/h
  weatherCode: number;
  windGust: number; // km/h
};

export type WeatherDay = {
  dateKey: string;
  weatherCode: number;
  precipSum: number;
  tempMax: number;
  tempMin: number;
  sunrise: string | null; // ISO
  sunset: string | null; // ISO
};

export type WeatherData = {
  city: string;
  lat: number;
  lon: number;
  hourly: WeatherHour[];
  daily: WeatherDay[];
};

export type HolidayInfo = { dateKey: string; name: string };

export type FerienInfo = { startKey: string; endKey: string; name: string };

export type FootballMatch = {
  dateKey: string; // Berlin
  hour: number;
  home: string;
  away: string;
  league: string;
  competition: string;
};

export type EventCategory =
  | "party"
  | "music"
  | "sport"
  | "fest"
  | "kultur"
  | "sonst";

export type CityEvent = {
  id: string;
  title: string;
  category: EventCategory;
  relevance: number; // 1-3
  dateKey: string; // erstes Datum (Berlin)
  endKey: string; // letztes Datum (Berlin)
  timeText: string; // z.B. "19:00 - 20:30 Uhr" oder "Di-Fr 12:00-18:00"
  startHour: number | null; // für Score
  endHour: number | null;
  weekdayHours?: Record<number, [number, number]>; // 1=Mo..7=So -> [start,end]
  venue: string;
  source: string;
  url: string | null;
};

export type ReasonChip = { icon: string; label: string; weight: number };

// Frische Meldung aus einem Google-Alerts-Feed (Szene, Partys, Nachtleben, News …)
export type AlertItem = {
  id: string;
  feed: string; // z.B. "Regensburg Nachtleben"
  group: AlertGroup;
  title: string;
  snippet: string;
  url: string | null;
  publishedAt: string | null;
};

export type AlertGroup =
  | "nachtleben"
  | "konzert"
  | "messe"
  | "veranstaltung"
  | "fussball"
  | "news"
  | "wetter";

export type TrafficItem = {
  id: string;
  kind: "baustelle" | "sperrung" | "stoerung" | "blitzer" | "verkehr" | "kontrolle" | "lokal";
  title: string;
  detail: string;
  timeLabel: string;
  source: string;
  url: string | null;
  publishedAt: string | null;
  trafficRelevant: boolean;
};

export type HourScore = {
  dateKey: string;
  hour: number;
  score: number;
  reasons: ReasonChip[];
  temp: number;
  precip: number;
  weatherCode: number;
  hotspot?: string;
  hotspotReason?: string;
};

export type BestWindow = {
  dateKey: string;
  startHour: number;
  endHour: number; // exklusiv
  score: number;
  reasons: ReasonChip[];
  hotspot?: string;
};

export type DaySummary = {
  dateKey: string;
  weekday: number; // 1=Mo..7=So
  dayAvg: number; // Ø 6-23 Uhr
  dayMax: number;
  peakHour: number;
  verdict: string; // "Starker Abend"
  verdictShort: string;
  bestWindows: BestWindow[];
  chips: ReasonChip[]; // Tages-Chips (Feiertag, Ferien, Heimspiel...)
  weatherCode: number;
  precipSum: number;
  tempMax: number;
  tempMin: number;
  sunset: string | null;
  sunrise: string | null;
};

export type NowStatus = {
  score: number;
  statusText: string;
  trend: "up" | "down" | "flat";
  trendText: string;
  next3hScore: number;
  isRainyNow: boolean;
  rainNext3h: boolean;
  precipNow: number;
  tempNow: number;
  weatherCode: number;
  sunsetToday: string | null;
  sunrisetToday: string | null;
  nowChips: ReasonChip[];
  recommendation: string;
  hotspot?: string;
  hotspotReason?: string;
};

// ÖPNV-Störung oder Streik, aus bereits geladenen Quellen abgeleitet
export type DisruptionSeverity = "streik" | "stark" | "leicht";

export type Disruption = {
  severity: DisruptionSeverity;
  bonus: number; // bereits angewendeter Index-Bonus
  title: string;
  source: string;
  publishedAt: string | null;
  url: string | null;
  dateKey: string; // Tag, an dem der Bonus gilt
  startHour: number;
  endHour: number; // exklusiv
};

export type DemandResponse = {
  city: string;
  generatedAt: string;
  berlinNow: { dateKey: string; hour: number; minute: number; weekday: number };
  now: NowStatus;
  hours: HourScore[]; // alle 16 Tage × 24h
  days: DaySummary[]; // 16 Tageszusammenfassungen
  events: CityEvent[]; // nächste 16 Tage, sortiert
  football: FootballMatch[];
  traffic: TrafficItem[]; // Verkehr & Blitzer (Autobahn + Radio + Google Alerts + Bahn)
  sceneNews: AlertItem[]; // Szene/Partys/Nachtleben aus Google Alerts
  sources: SourceStatus[];
  holidayNotice: string | null; // z.B. "Allerheiligenferien bis Fr · Uni-Vorlesungszeit"
  disruption: Disruption | null; // nur gesetzt, wenn eine Störung erkannt wurde
};
