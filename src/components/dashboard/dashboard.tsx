"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Ban,
  CalendarDays,
  CarFront,
  ChevronDown,
  CloudRain,
  ExternalLink,
  Gauge,
  Landmark,
  LayoutGrid,
  Lightbulb,
  Disc3,
  MapPin,
  Music,
  Newspaper,
  Radio,
  RefreshCw,
  Rss,
  ShieldAlert,
  Sparkles,
  Store,
  Sunrise,
  Sunset,
  Tent,
  TrafficCone,
  TriangleAlert,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { DemandResponse, CityEvent, TrafficItem, AlertItem } from "@/lib/sources/types";
import {
  scoreTier,
  WeatherGlyph,
  ReasonGlyph,
  CATEGORY_META,
  relevanceDots,
  formatSunset,
} from "./helpers";
import { LogoMark, Wordmark } from "./logo";
import { FahrerOverviewCard } from "./market";
import { Reveal } from "@/components/reveal";
import { Aurora } from "./aurora";
import { SplitText } from "./split-text";

const UBER_GREEN = "text-[#06C167]";

// ---------- kleine Bausteine ----------

// Voll lesbarer Anlass-Eintrag für schmale Karten: Text umbricht, statt abgeschnitten zu werden
function ReasonLine({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div
      className="glass-soft flex min-w-0 items-start gap-1.5 rounded-lg px-2 py-1"
      title={label}
    >
      <span className={`mt-px shrink-0 ${UBER_GREEN}`} aria-hidden>{icon}</span>
      <span className="text-[11px] leading-4 text-zinc-300">{label}</span>
    </div>
  );
}

function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const t = scoreTier(score);
  const cls =
    size === "lg"
      ? "text-4xl font-black px-3 py-1.5 rounded-xl"
      : size === "sm"
        ? "text-xs font-bold px-1.5 py-0.5 rounded-md"
        : "text-base font-bold px-2 py-0.5 rounded-lg";
  return (
    <span className={`${cls} ${t.bg} ${t.fg} tabular-nums`} title={`Fahrer-Index ${score} (${t.label})`}>
      {score}
    </span>
  );
}

function SectionTitle({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
        <Icon className={`h-5 w-5 ${UBER_GREEN}`} aria-hidden />
        {title}
      </h2>
      {hint && <span className="hidden text-xs text-zinc-500 sm:inline">{hint}</span>}
    </div>
  );
}

// ---------- Logo & Header ----------

// Ehrliche Regions-Anzeige statt Ort-Buttons: Das Wetter ist in der Region fast
// identisch, Veranstaltungen/Jahn/Verkehr sowieso regional – pro Ort umschalten
// würde also nichts Sichtbares verändern. Daher klare Info statt Schein-Knöpfe.
function RegionLine() {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="mr-1 inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider text-zinc-500">
        <MapPin className="h-3.5 w-3.5" aria-hidden /> Region
      </span>
      <span className="font-medium text-zinc-300">Regensburg &amp; Umland</span>
      <span className="hidden text-zinc-600 sm:inline">
        · Neutraubling, Lappersdorf, Kelheim, Straubing, Landshut, Amberg, Schwandorf, Cham, Parsberg
      </span>
    </div>
  );
}

// ---------- Regen-Verlauf ----------

function RainCard({ data }: { data: DemandResponse }) {
  const todayKey = data.berlinNow.dateKey;
  const nowHour = data.berlinNow.hour;
  const next12 = data.hours
    .filter((h) => (h.dateKey === todayKey && h.hour >= nowHour) || (h.dateKey > todayKey))
    .slice(0, 12);
  const maxP = Math.max(0.8, ...next12.map((h) => h.precip));
  const rainHours = next12.filter((h) => h.precip >= 0.1).length;

  return (
    <div className="rounded-2xl glass glass-edge p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Regen &amp; Fahrt-Motor
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-sm text-zinc-300">
        <CloudRain className={`h-4 w-4 shrink-0 ${rainHours > 0 ? "text-teal-300" : "text-zinc-500"}`} aria-hidden />
        {rainHours === 0 ? (
          <>In den nächsten 12 Stunden <b className="text-zinc-100">kein Regen</b> gemeldet.</>
        ) : (
          <><b className="text-teal-300">{rainHours} von 12 Std.</b> mit Regen – Fahrten nehmen zu.</>
        )}
      </div>
      <div className="mt-3 flex h-20 items-end gap-1" role="img" aria-label="Regen-Verlauf der nächsten 12 Stunden">
        {next12.map((h) => {
          const pct = Math.min(100, (h.precip / maxP) * 100);
          return (
            <div key={`${h.dateKey}:${h.hour}`} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-14 w-full items-end rounded-sm bg-white/10" title={`${String(h.hour).padStart(2, "0")}:00 · ${h.precip.toFixed(1)} mm/h`}>
                <div
                  className={`w-full rounded-sm ${h.precip >= 0.1 ? "bg-teal-400" : "bg-white/5"}`}
                  style={{ height: `${Math.max(pct, 4)}%` }}
                />
              </div>
              <div className="text-[10px] text-zinc-500">{String(h.hour).padStart(2, "0")}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-400">
        <div className="flex items-center gap-1.5"><Sunrise className="h-3.5 w-3.5 text-zinc-500" aria-hidden /> <span className="text-zinc-200">{formatSunset(data.now.sunrisetToday)}</span></div>
        <div className="flex items-center gap-1.5"><Sunset className="h-3.5 w-3.5 text-zinc-500" aria-hidden /> <span className="text-zinc-200">{formatSunset(data.now.sunsetToday)}</span></div>
      </div>
    </div>
  );
}

// ---------- Wochen-Karten ----------

function WeekGrid({ data }: { data: DemandResponse }) {
  const week = data.days.slice(0, 7);
  const todayKey = data.berlinNow.dateKey;
  const wdNames = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {week.map((d) => {
        const t = scoreTier(d.dayMax);
        const isToday = d.dateKey === todayKey;
        return (
          <div
            key={d.dateKey}
            className={`rounded-2xl border p-3.5 ${
              isToday
                ? "border-[#06C167]/40 bg-[#06C167]/10 shadow-[0_0_45px_rgba(6,193,103,0.13)] backdrop-blur-xl"
                : "glass glass-edge"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-white">
                  {wdNames[d.weekday]} {d.dateKey.slice(8, 10)}.{d.dateKey.slice(5, 7)}.
                </div>
                {isToday && <div className="text-[10px] font-semibold uppercase tracking-wide text-[#06C167]">Heute</div>}
              </div>
              <WeatherGlyph code={d.weatherCode} className="h-5 w-5 text-zinc-400" />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <ScoreBadge score={d.dayMax} />
              <div className="text-[11px] leading-tight text-zinc-500">
                Ø {d.dayAvg} · Top {String(d.peakHour).padStart(2, "0")}:00
              </div>
            </div>
            <div className={`mt-1.5 text-xs font-semibold ${t.text}`}>{d.verdict}</div>
            <div className="mt-1 text-[11px] text-zinc-500">
              {Math.round(d.tempMax)}° / {Math.round(d.tempMin)}°
              {d.precipSum >= 0.2 ? ` · ${d.precipSum.toFixed(1)} mm` : ""}
            </div>
            <div className="mt-2 space-y-1">
              {d.chips.length === 0 && (
                <div className="text-[11px] text-zinc-600">Kein besonderer Anlass</div>
              )}
              {d.chips.slice(0, 4).map((c, i) => (
                <ReasonLine key={i} icon={<ReasonGlyph icon={c.icon} className="h-3.5 w-3.5" />} label={c.label} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Nächste Woche ----------

function NextWeek({ data }: { data: DemandResponse }) {
  const rest = data.days.slice(7);
  const wdNames = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  return (
    <div className="overflow-hidden rounded-2xl glass glass-edge">
      {rest.map((d, i) => {
        const t = scoreTier(d.dayMax);
        return (
          <div key={d.dateKey} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-white/5" : ""}`}>
            <div className="w-24 shrink-0 text-sm font-bold text-zinc-200">
              {wdNames[d.weekday]} {d.dateKey.slice(8, 10)}.{d.dateKey.slice(5, 7)}.
            </div>
            <ScoreBadge score={d.dayMax} size="sm" />
            <div className={`hidden flex-1 truncate text-xs sm:block ${t.text}`}>{d.verdict}</div>
            <div className="hidden min-w-0 flex-1 flex-wrap items-start gap-1 sm:flex">
              {d.chips.slice(0, 3).map((c, j) => (
                <ReasonLine key={j} icon={<ReasonGlyph icon={c.icon} className="h-3.5 w-3.5" />} label={c.label} />
              ))}
            </div>
            <WeatherGlyph code={d.weatherCode} className="ml-auto h-5 w-5 shrink-0 text-zinc-400" />
          </div>
        );
      })}
      {rest.length === 0 && <div className="p-4 text-sm text-zinc-500">—</div>}
    </div>
  );
}

// ---------- Verkehr & Blitzer ----------

const TRAFFIC_META: Record<TrafficItem["kind"], { icon: LucideIcon; cls: string; label: string }> = {
  blitzer: { icon: Gauge, cls: "border-amber-400/30 bg-amber-400/10 text-amber-400", label: "Blitzer" },
  kontrolle: { icon: ShieldAlert, cls: "border-sky-400/30 bg-sky-400/10 text-sky-300", label: "Polizei" },
  sperrung: { icon: Ban, cls: "border-rose-400/30 bg-rose-400/10 text-rose-400", label: "Sperrung" },
  stoerung: { icon: TriangleAlert, cls: "border-orange-400/30 bg-orange-400/10 text-orange-400", label: "Störung" },
  baustelle: { icon: TrafficCone, cls: "border-orange-300/30 bg-orange-300/10 text-orange-300", label: "Baustelle" },
  verkehr: { icon: CarFront, cls: "border-teal-400/30 bg-teal-400/10 text-teal-300", label: "Verkehr" },
  lokal: { icon: Newspaper, cls: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400", label: "Hinweis" },
};

function TrafficRow({ t, first }: { t: TrafficItem; first: boolean }) {
  const meta = TRAFFIC_META[t.kind] ?? TRAFFIC_META.lokal;
  const Icon = meta.icon;
  const content = (
    <>
      <span className={`mt-0.5 inline-flex shrink-0 items-center justify-center rounded-lg border p-1.5 ${meta.cls}`} aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-snug text-zinc-100">{t.title}</div>
        {t.detail && <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">{t.detail}</div>}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-600">
          <span className="rounded border border-white/10 px-1.5 py-0.5 font-semibold text-zinc-400">{meta.label}</span>
          <span>{t.source.startsWith("Waze") ? <b className="font-semibold text-[#06C167]">{t.source}</b> : t.source}</span>
          {t.timeLabel && <span>· {t.timeLabel}</span>}
        </div>
      </div>
      {t.url && <ExternalLink className="ml-2 h-3.5 w-3.5 shrink-0 self-center text-zinc-600" aria-hidden />}
    </>
  );
  // Blitzer visuell leicht hervorheben (linke Kante), ohne laut zu wirken
  const blitz = t.kind === "blitzer" ? "border-l-2 border-l-amber-400/60 bg-amber-400/[0.05]" : "";
  const rowCls = `block w-full px-4 py-2.5 text-left transition-colors ${first ? "" : "border-t border-white/5"} ${blitz} ${t.url ? "hover:bg-white/5" : ""}`;
  return t.url ? (
    <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer" className={rowCls}>
      {content}
    </a>
  ) : (
    <div key={t.id} className={rowCls}>
      {content}
    </div>
  );
}

function TrafficCard({ data }: { data: DemandResponse }) {
  const [open, setOpen] = useState(false);
  const items = data.traffic;
  // Blitzer, Sperrungen & Störungen bleiben immer sichtbar – der Fahrer braucht
  // sie sofort. Die endlose Baustellen-Liste klappt sich auf Wunsch auf.
  const important = items.filter((t) => t.kind !== "baustelle" && t.kind !== "lokal");
  const rest = items.filter((t) => t.kind === "baustelle" || t.kind === "lokal");
  return (
    <div className="overflow-hidden rounded-2xl glass glass-edge">
      {items.length === 0 && (
        <div className="flex items-center gap-2 p-4 text-sm text-zinc-500">
          <TrafficCone className="h-4 w-4" aria-hidden /> Aktuell keine Verkehrs-Hinweise – alles fließt.
        </div>
      )}
      {important.map((t, i) => (
        <TrafficRow key={t.id} t={t} first={i === 0} />
      ))}
      {rest.length > 0 && (
        <div className={important.length > 0 ? "border-t border-white/10" : ""}>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
          >
            <TrafficCone className="h-4 w-4 shrink-0 text-orange-300/80" aria-hidden />
            <span>
              <b className="font-semibold text-zinc-300">{open ? "Baustellen & Hinweise ausblenden" : `Baustellen & Hinweise (${rest.length})`}</b>
              {" "}– aufklappen, wenn es relevant wird
            </span>
            <ChevronDown className={`ml-auto h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {open && (
            <div>
              {rest.map((t, i) => (
                <TrafficRow key={t.id} t={t} first={i === 0} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Veranstaltungen ----------

type EventFilter = "alle" | "music" | "party" | "sport" | "fest" | "kultur";

function EventsList({ data }: { data: DemandResponse }) {
  const [filter, setFilter] = useState<EventFilter>("alle");
  const todayKey = data.berlinNow.dateKey;

  const filtered = useMemo(() => {
    return data.events.filter((e) => {
      if (filter === "alle") return true;
      if (filter === "kultur") return e.category === "kultur" || e.category === "sonst";
      return e.category === filter;
    });
  }, [data.events, filter]);

  const groups = useMemo(() => {
    const m = new Map<string, CityEvent[]>();
    for (const e of filtered) {
      const key = e.dateKey < todayKey ? todayKey : e.dateKey;
      const arr = m.get(key) ?? [];
      arr.push(e);
      m.set(key, arr);
    }
    return [...m.entries()];
  }, [filtered, todayKey]);

  const wdNames = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  const label = (dk: string) => {
    if (dk === todayKey) return "Heute";
    if (dk === data.days[1]?.dateKey) return "Morgen";
    return `${wdNames[data.days.find((d) => d.dateKey === dk)?.weekday ?? 1]}, ${dk.slice(8, 10)}.${dk.slice(5, 7)}.`;
  };

  const FILTERS: { key: EventFilter; label: string; icon: LucideIcon }[] = [
    { key: "alle", label: "Alle", icon: LayoutGrid },
    { key: "music", label: "Musik", icon: Music },
    { key: "party", label: "Party", icon: Disc3 },
    { key: "sport", label: "Sport", icon: Trophy },
    { key: "fest", label: "Feste & Märkte", icon: Tent },
    { key: "kultur", label: "Kultur & Sonst.", icon: Landmark },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`glass-soft inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              filter === f.key
                ? "border-white bg-white text-black"
                : "text-zinc-400 hover:border-white/25 hover:text-zinc-100"
            }`}
            aria-pressed={filter === f.key}
          >
            <f.icon className="h-3.5 w-3.5" aria-hidden />
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {groups.map(([dk, evs]) => (
          <div key={dk}>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-zinc-500">{label(dk)}</div>
            <div className="overflow-hidden rounded-2xl glass glass-edge">
              {evs.map((e, i) => {
                const meta = CATEGORY_META[e.category];
                const MetaIcon = meta.icon;
                const isRange = e.dateKey !== e.endKey;
                return (
                  <div key={e.id + i} className={`flex items-start gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-white/5" : ""}`}>
                    <div className="w-16 shrink-0 font-mono text-xs text-zinc-400">
                      {e.startHour !== null
                        ? `${String(e.startHour).padStart(2, "0")}:00`
                        : "—"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug text-zinc-100" title={e.title}>
                        {e.title}
                        {isRange && (
                          <span className="ml-2 text-[10px] text-zinc-500">
                            (seit {e.dateKey.slice(8, 10)}.{e.dateKey.slice(5, 7)}., bis {e.endKey.slice(8, 10)}.{e.endKey.slice(5, 7)}.)
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500">
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden /> {e.venue}</span>
                        {(e.startHour !== null || e.weekdayHours) && <span>· {e.timeText}</span>}
                      </div>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`} title={`${meta.label} · Fahrten-Relevanz ${e.relevance.toFixed(1)}/3`}>
                      <MetaIcon className="h-3 w-3" aria-hidden />
                      {meta.label}
                    </span>
                    <span className="hidden w-16 shrink-0 text-right text-[11px] text-zinc-600 sm:block" title="Fahrten-Relevanz">
                      {relevanceDots(e.relevance)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="rounded-2xl glass glass-edge p-4 text-sm text-zinc-500">
            Keine Einträge in dieser Kategorie für die nächsten 16 Tage.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Szene, Partys & Nachtleben (Google Alerts) ----------

function relTime(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return `vor ${d} Tag${d === 1 ? "" : "e"}`;
}

const ALERT_META: Record<AlertItem["group"], { icon: LucideIcon; cls: string; label: string }> = {
  nachtleben: { icon: Disc3, cls: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300", label: "Nachtleben" },
  konzert: { icon: Music, cls: "border-violet-400/30 bg-violet-400/10 text-violet-300", label: "Konzert" },
  messe: { icon: Store, cls: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300", label: "Messe" },
  veranstaltung: { icon: Sparkles, cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300", label: "Termin" },
  fussball: { icon: Trophy, cls: "border-lime-400/30 bg-lime-400/10 text-lime-300", label: "Fußball" },
  news: { icon: Newspaper, cls: "border-zinc-400/30 bg-zinc-400/10 text-zinc-300", label: "Stadt-News" },
  wetter: { icon: CloudRain, cls: "border-teal-400/30 bg-teal-400/10 text-teal-300", label: "Wetter" },
};

function SceneNews({ items }: { items: AlertItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 6);
  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-white">
          <Rss className="h-4 w-4 text-[#06C167]" aria-hidden /> Szene, Partys &amp; Nachtleben
        </span>
        <span className="text-xs text-zinc-500">deine Google-Alerts – Partys, Konzerte, Messe, Stadt-News, immer frisch</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-2xl glass glass-edge p-4 text-sm text-zinc-500">
          Gerade keine neuen Meldungen aus der Szene – sobald Google neue Artikel zu Partys,
          Konzerten &amp; Nachtleben findet, erscheinen sie hier automatisch.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl glass glass-edge">
          {visible.map((a, i) => {
            const meta = ALERT_META[a.group];
            const Icon = meta.icon;
            const host = a.url
              ? (() => {
                  try {
                    return new URL(a.url).hostname.replace(/^www\./, "");
                  } catch {
                    return a.feed;
                  }
                })()
              : a.feed;
            const inner = (
              <>
                <span className={`mt-0.5 inline-flex shrink-0 items-center justify-center rounded-lg border p-1.5 ${meta.cls}`} aria-hidden>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-snug text-zinc-100">{a.title}</div>
                  {a.snippet && <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">{a.snippet}</div>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-600">
                    <span className="rounded border border-white/10 px-1.5 py-0.5 font-semibold text-zinc-400">{meta.label}</span>
                    <span>{host}</span>
                    {a.publishedAt && <span>· {relTime(a.publishedAt)}</span>}
                  </div>
                </div>
                {a.url && <ExternalLink className="ml-2 h-3.5 w-3.5 shrink-0 self-center text-zinc-600" aria-hidden />}
              </>
            );
            const rowCls = `block w-full px-4 py-2.5 text-left transition-colors ${i > 0 ? "border-t border-white/5" : ""} ${a.url ? "hover:bg-white/5" : ""}`;
            return a.url ? (
              <a key={a.id + i} href={a.url} target="_blank" rel="noopener noreferrer" className={rowCls}>
                {inner}
              </a>
            ) : (
              <div key={a.id + i} className={rowCls}>
                {inner}
              </div>
            );
          })}
          {items.length > 6 && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="w-full border-t border-white/10 px-4 py-2.5 text-center text-xs font-semibold text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
            >
              {showAll ? "Weniger anzeigen" : `Alle ${items.length} Meldungen anzeigen`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Heimspiel-Hinweis ----------

function FootballNotice({ data }: { data: DemandResponse }) {
  if (data.football.length === 0) return null;
  const m = data.football[0];
  const d = data.days.find((x) => x.dateKey === m.dateKey);
  const wdNames = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  return (
    <div className="rounded-2xl border border-[#06C167]/40 bg-[#06C167]/10 p-4 shadow-[0_0_55px_rgba(6,193,103,0.10)] backdrop-blur-xl">
      <div className="flex items-start gap-2 text-sm text-zinc-200">
        <Trophy className={`mt-0.5 h-4 w-4 shrink-0 ${UBER_GREEN}`} aria-hidden />
        <div>
          <b>Nächstes Jahn-Heimspiel:</b>{" "}
          {wdNames[d?.weekday ?? 6]}, {m.dateKey.slice(8, 10)}.{m.dateKey.slice(5, 7)}. · {String(m.hour).padStart(2, "0")}:00 Uhr · Jahn Regensburg – {m.away} ({m.competition})
          <div className="mt-1 text-xs text-zinc-500">
            Rund um Anpfiff und Abpfiff springt der Fahrer-Index deutlich (+20). Ab 2 Stunden vor Spielbeginn einplanen.
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Erklärung + Quellen ----------

function ExplainCard() {
  const rows: [string, string][] = [
    ["Nachfrage-Rhythmus", "Stoßzeiten 7–9 & 16–19 Uhr, Kneipenabend Do, Fr/Sa Nacht, Sonntagabend – je nach Wochentag"],
    ["Regen / Schnee", "Regen +10 bis +26 · Schnee +30 · Gewitter +24 · Nebel +8 · Sturm +8"],
    ["Kälte / Hitze", "Unter −5 °C +10 · über 32 °C +8 · Schönwetter tagsüber −3 (Fußgänger & Rad)"],
    ["Feiertage & Ferien", "Feiertag +12 · Abend vor Feiertag +14 · Schulferien (Bayern, amtlich) +6 · Start/Ende +4"],
    ["Jahn-Heimspiele", "+20 ab 2h vor Anpfiff bis 3h danach (3. Liga, automatisch aktualisiert)"],
    ["Veranstaltungen", "Konzerte +12 · Partys +10–14 · Feste/Märkte +8–14 (aus dem Kalender der Stadt)"],
    ["Rhythmus-Spitzen", "Monatswechsel (Gehälter) +7 · Uni-Semester nachts +6 (ca.-Zeiten)"],
    ["Sondertermine", "Silvester +25 · Neujahrsnacht +22 · Heiligabend +12 · Weihnachten +8"],
    ["Verkehr & Blitzer", "Blitzer & Sperrungen immer sichtbar, Baustellen einklappbar. Live von der Autobahn (A3/A93), Regional-Radio (Gong FM, Charivari, Ramasuri, Regensburg Digital), deinen Google-Alerts (Blitzer, Radarkontrolle, Polizei, Sperrung) und optional Waze – reine Info, ohne Index-Einfluss"],
    ["Google Alerts (Szene)", "Deine eigenen Alert-Feeds: Nachtleben, Konzerte, Messe, Veranstaltungen, Fußball, News, Wetter – erscheinen unter ‚Partys & Szene‘, damit du nichts verpasst"],
  ];
  return (
    <div className="rounded-2xl glass glass-edge p-5 text-sm">
      <div className="font-bold text-white">Wie der Fahrer-Index gerechnet wird</div>
      <p className="mt-1 text-xs text-zinc-500">
        Startpunkt ist eine typische Nachfragekurve (0–100). Alles Weitere wird addiert, Deckel bei 100.
        Das sind erfahrungsbasierte Richtwerte für die Planung – keine offiziellen Uber-Daten.
      </p>
      <div className="mt-3 space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 border-b border-white/5 pb-1.5 last:border-0 sm:flex-row sm:gap-3">
            <div className="w-48 shrink-0 font-semibold text-zinc-300">{k}</div>
            <div className="text-zinc-500">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourcesFooter({ data }: { data: DemandResponse }) {
  return (
    <footer className="mt-auto border-t border-white/10 bg-black/60 backdrop-blur-xl">
      <div
        className="mx-auto max-w-6xl px-4 py-6"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Datenquellen (live)</div>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {data.sources.map((s) => (
            <div key={s.key} className="flex items-start gap-2 text-xs">
              <span aria-hidden className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${s.ok ? "bg-[#06C167]" : "bg-rose-500"}`} />
              <span className="text-zinc-400">
                <b className="text-zinc-300">{s.label}</b> – {s.detail}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
          FahrerRadar ist eine Planungshilfe für Fahrdienst-Fahrer. Die Nachfrage-Schätzung kombiniert Wetter
          (Open-Meteo), gesetzliche Feiertage (Bayern), die amtliche bayerische Ferienordnung, Heimspiele des Jahn
          Regensburg (OpenLigaDB), den Veranstaltungskalender der Stadt Regensburg, kuratierte Groß-Events sowie
          Verkehrsmeldungen der Autobahn-API des Bundes (A3/A93), der Regional-Radio-Feeds von Gong FM, Charivari,
          Radio Ramasuri und Regensburg Digital, deinen eigenen Google-Alerts-Feeds (Blitzer, Radar, Polizei,
          Sperrung, Nachtleben, Konzerte, Messe u.a.) sowie optionalen Waze-Community-Meldungen. Alle Angaben ohne Gewähr – die echte Nachfrage vor Ort entscheidet. Stand:{" "}
          {new Date(data.generatedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr.
        </p>
      </div>
    </footer>
  );
}

// ---------- Hero ----------

function HeroSection() {
  return (
    <div className="pb-1 pt-4 sm:pt-7">
      <p className="glass-soft mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#06C167] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#06C167]" />
        </span>
        Live-Fahrer-Index · Regensburg &amp; Umland
      </p>
      <h1 className="max-w-3xl text-3xl font-black leading-tight tracking-tight sm:text-4xl">
        <SplitText text="Wann lohnt sich" /> <SplitText text="Fahren?" className="text-gradient" delay={0.35} />
      </h1>
      <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        Wetter, Verkehr, Blitzer, Veranstaltungen und Feiertage – alles auf einen Blick.
        Jetzt, heute, morgen und die ganze Woche im Voraus geplant.
      </p>
      <RegionLine />
    </div>
  );
}

// ---------- Haupt-Dashboard ----------

export default function Dashboard() {
  const [data, setData] = useState<DemandResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/demand`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Server: ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verbindungsfehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(() => load(), 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
    tick();
    const iv = setInterval(tick, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col text-zinc-100">
      <Aurora />
      {/* Header – safe-area-top: dunkler Balken unter der iPhone-Statusleiste im Vollbild */}
      <header
        className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/60 backdrop-blur-xl"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <LogoMark size={40} />
            <Wordmark sub="Fahrer-Index · Regensburg & Umland" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden w-12 text-right font-mono text-sm text-zinc-400 sm:block" aria-label="Uhrzeit">{clock}</div>
            <button
              onClick={() => load()}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-400"
              aria-label="Daten aktualisieren"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
              {loading ? "Lädt …" : "Neu laden"}
            </button>
          </div>
        </div>
        {data?.holidayNotice && (
          <div className="mx-auto max-w-6xl px-4 pb-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> {data.holidayNotice}
            </span>
          </div>
        )}
      </header>

      {/* Content – safe-area seitlich/unten für iPhone-Notch & Home-Balken */}
      <main
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-5"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
        }}
      >
        <HeroSection />
        {error && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-center">
            <div className="flex items-center justify-center gap-2 text-lg font-bold text-rose-300">
              <TriangleAlert className="h-5 w-5" aria-hidden /> Daten nicht ladbar
            </div>
            <div className="mt-1 text-sm text-rose-200/70">{error}</div>
            <button
              onClick={() => load()}
              className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-bold text-black hover:bg-zinc-200"
            >
              Erneut versuchen
            </button>
          </div>
        )}

        {!error && (loading || !data) && (
          <div className="space-y-4" aria-busy="true" aria-label="Lade Daten">
            <div className="h-40 glass-soft animate-pulse rounded-2xl" />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="h-28 glass-soft animate-pulse rounded-2xl" />
              <div className="h-28 glass-soft animate-pulse rounded-2xl" />
            </div>
            <div className="h-24 glass-soft animate-pulse rounded-2xl" />
            <div className="text-center text-sm text-zinc-500">Sammle Wetter, Veranstaltungen, Verkehr & mehr …</div>
          </div>
        )}

        {!error && data && (
          <div className="space-y-7">
            {/* 1) ALLES IN EINER KARTE: JETZT + AKTION + FAHRER-PLAN + CHART */}
            <Reveal>
              <section aria-label="Lage jetzt, Fahrer-Plan und Stunden-Verlauf">
                <SectionTitle icon={Activity} title="Jetzt live & Dein Fahrer-Plan" hint="eine Karte: Status, Tages-Plan, Chart & Morgen-Vorschau" />
                <FahrerOverviewCard data={data} />
              </section>
            </Reveal>

            {/* 2) Wetter */}
            <Reveal>
              <section aria-label="Wetter und Regen">
                <SectionTitle icon={CloudRain} title="Wetter & Regen" hint="die nächsten 12 Stunden" />
                <RainCard data={data} />
              </section>
            </Reveal>

            {/* 3) Verkehr & Blitzer – Blitzer immer sichtbar, Baustellen einklappbar */}
            <Reveal>
              <section aria-label="Verkehr und Blitzer">
                <SectionTitle icon={Radio} title="Verkehr & Blitzer" hint="Blitzer & Sperrungen oben · Baustellen einklappbar · ohne Index-Einfluss" />
                <TrafficCard data={data} />
              </section>
            </Reveal>

            {/* 4) Woche */}
            <Reveal>
              <section aria-label="Die nächsten 7 Tage">
                <SectionTitle icon={CalendarDays} title="Die Woche" hint="maximaler Index pro Tag + Anlässe" />
                <WeekGrid data={data} />
              </section>
            </Reveal>

            {/* 5) Heimspiel */}
            <Reveal>
              <FootballNotice data={data} />
            </Reveal>

            {/* 6) Nächste Woche */}
            <Reveal>
              <section aria-label="Nächste Woche">
                <SectionTitle icon={CalendarDays} title="Übermorgen bis +15 Tage" hint="Frühplanung: Ferien, Feiertage, Groß-Events" />
                <NextWeek data={data} />
              </section>
            </Reveal>

            {/* 7) Veranstaltungen, Partys & Szene (inkl. Google Alerts) */}
            <Reveal>
              <section aria-label="Veranstaltungen und Anlässe">
                <SectionTitle icon={Sparkles} title="Veranstaltungen, Partys &amp; Szene" hint="Kalender der Stadt + deine Google-Alerts (Party, Nachtleben, Konzerte)" />
                <EventsList data={data} />
                <SceneNews items={data.sceneNews} />
              </section>
            </Reveal>

            {/* 8) Erklärung */}
            <Reveal>
              <section aria-label="Erklärung des Index">
                <SectionTitle icon={Lightbulb} title="Das steckt drin" />
                <ExplainCard />
              </section>
            </Reveal>
          </div>
        )}
      </main>

      {data && <SourcesFooter data={data} />}
      {!data && (
        <footer
          className="mt-auto border-t border-white/10 bg-black/60 backdrop-blur-xl py-4 text-center text-[11px] text-zinc-600"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          FahrerRadar · Planungshilfe für Fahrdienst-Fahrer · keine offiziellen Uber-Daten
        </footer>
      )}
    </div>
  );
}
