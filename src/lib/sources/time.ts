// Zeit-Helfer: alles auf Europa/Berlin bezogen.

const TZ = "Europe/Berlin";

/** ISO-String -> Teile in Berliner Lokalzeit */
export function berlinParts(d: Date): {
  dateKey: string;
  hour: number;
  minute: number;
  weekday: number; // 1=Mo ... 7=So
} {
  const fmt = new Intl.DateTimeFormat("de-DE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  const wdMap: Record<string, number> = { Mo: 1, Di: 2, Mi: 3, Do: 4, Fr: 5, Sa: 6, So: 7 };
  const wd = wdMap[get("weekday").slice(0, 2)] ?? 1;
  return {
    dateKey: `${year}-${month}-${day}`,
    hour: hour % 24,
    minute,
    weekday: wd,
  };
}

/** dateKey + hour -> ISO-Referenz (für Sortierung) */
export function dateKeyToISO(dateKey: string, hour = 0, minute = 0): Date {
  // Berlin ist UTC+1 (Winter) / UTC+2 (Sommer) – wir lösen das über einen Trick:
  const [y, m, d] = dateKey.split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, hour - 1, minute);
  return new Date(utcGuess);
}

export function dateKeyOffset(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86400000);
}

export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=So
  return js === 0 ? 7 : js;
}

const WD_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTH_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function formatDateKeyShort(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${d}.${m}.`;
}

export function formatDateKeyLong(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  const wd = WD_SHORT[weekdayOf(dateKey) % 7];
  return `${wd}, ${d}. ${MONTH_SHORT[parseInt(m, 10) - 1]}`;
}

export function formatDateKeyFull(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${d}.${m}.${y}`;
}

export function weekdayShort(dateKey: string): string {
  return WD_SHORT[weekdayOf(dateKey) % 7];
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** "heute", "morgen", sonst "Fr, 12. Dez." */
export function relativeDayLabel(dateKey: string, todayKey: string): string {
  const diff = daysBetween(todayKey, dateKey);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  if (diff === -1) return "Gestern";
  const [y, m, d] = dateKey.split("-");
  return `${WD_SHORT[weekdayOf(dateKey) % 7]}, ${d}. ${MONTH_SHORT[parseInt(m, 10) - 1]}`;
}
