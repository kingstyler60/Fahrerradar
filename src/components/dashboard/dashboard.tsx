"use client";

// Seite: Kopfzeile, Blöcke a–d (in market.tsx), Veranstaltungen, Verkehr,
// aufklappbare Woche und Szene sowie die Datenquellen.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Ban,
  CarFront,
  ChevronDown,
  ExternalLink,
  Gauge,
  LocateFixed,
  Newspaper,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrafficCone,
  TriangleAlert,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { AlertItem, CityEvent, DemandResponse, SourceStatus, TrafficItem } from "@/lib/sources/types";
import { useLocation } from "@/hooks/use-location";
import { CATEGORY_ICON, scoreTier, WeatherGlyph } from "./helpers";
import { LogoMark, Wordmark } from "./logo";
import { FahrerPlanCard, FahrerStatusCard } from "./market";

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// ---------- Aufklappbarer Block ----------

function Disclosure({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-zinc-200 hover:bg-white/[0.03]"
      >
        <span className="min-w-0 flex-1">{title}</span>
        {meta && <span className="shrink-0 text-xs text-zinc-400">{meta}</span>}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && <div className="border-t border-white/10 p-4">{children}</div>}
    </section>
  );
}

// ---------- Veranstaltungen ----------

type EventFilter = "alle" | "music" | "party" | "sport" | "fest" | "kultur";

const EVENT_FILTERS: { key: EventFilter; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "music", label: "Musik" },
  { key: "party", label: "Party" },
  { key: "sport", label: "Sport" },
  { key: "fest", label: "Feste" },
  { key: "kultur", label: "Kultur" },
];

function EventsCard({ data }: { data: DemandResponse }) {
  const [filter, setFilter] = useState<EventFilter>("alle");
  const todayKey = data.berlinNow.dateKey;

  const filtered = useMemo(
    () =>
      data.events.filter((e) => {
        if (filter === "alle") return e.category !== "kultur" && e.category !== "sonst";
        if (filter === "kultur") return e.category === "kultur" || e.category === "sonst";
        return e.category === filter;
      }),
    [data.events, filter]
  );

  const groups = useMemo(() => {
    const map = new Map<string, CityEvent[]>();
    for (const e of filtered) {
      const key = e.dateKey < todayKey ? todayKey : e.dateKey;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered, todayKey]);

  const dayLabel = (key: string) => {
    if (key === todayKey) return "Heute";
    if (key === data.days[1]?.dateKey) return "Morgen";
    const weekday = data.days.find((d) => d.dateKey === key)?.weekday ?? 1;
    return `${WD[weekday]}, ${key.slice(8, 10)}.${key.slice(5, 7)}.`;
  };

  const match = data.football[0];
  const matchDay = match ? data.days.find((d) => d.dateKey === match.dateKey) : undefined;

  return (
    <Disclosure title="Veranstaltungen" meta={String(filtered.length)}>
      {match && (
        <p className="mb-3 flex items-center gap-2 rounded-lg border border-[#06C167]/30 bg-[#06C167]/10 px-3 py-2 text-xs text-zinc-200">
          <Trophy className="h-3.5 w-3.5 shrink-0 text-[#06C167]" aria-hidden />
          <span className="min-w-0">
            Jahn – {match.away} ·{" "}
            {matchDay ? `${WD[matchDay.weekday]}, ` : ""}
            {`${match.dateKey.slice(8, 10)}.${match.dateKey.slice(5, 7)}. ${String(match.hour).padStart(2, "0")}:00`}
          </span>
        </p>
      )}

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {EVENT_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`h-11 shrink-0 rounded-lg border px-3 text-xs font-medium ${
              filter === f.key ? "border-white bg-white text-black" : "border-white/10 text-zinc-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-zinc-400">Keine Einträge.</p>
      ) : (
        groups.map(([key, list]) => (
          <div key={key} className="mt-3 first:mt-0">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">{dayLabel(key)}</p>
            {list.map((e, i) => {
              const Icon = CATEGORY_ICON[e.category] ?? Sparkles;
              return (
                <div
                  key={`${e.id}-${i}`}
                  className={`flex items-start gap-3 py-2.5 ${i > 0 ? "border-t border-white/5" : ""}`}
                >
                  <span className="w-11 shrink-0 font-mono text-xs tabular-nums text-zinc-400">
                    {e.startHour !== null ? `${String(e.startHour).padStart(2, "0")}:00` : "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug text-zinc-100">{e.title}</span>
                    <span className="mt-0.5 block text-xs text-zinc-400">
                      {e.venue}
                      {e.startHour === null && e.timeText ? ` · ${e.timeText}` : ""}
                    </span>
                  </span>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                </div>
              );
            })}
          </div>
        ))
      )}
    </Disclosure>
  );
}

// ---------- Verkehr & Blitzer ----------

const TRAFFIC_ICON: Record<TrafficItem["kind"], LucideIcon> = {
  blitzer: Gauge,
  kontrolle: ShieldAlert,
  sperrung: Ban,
  stoerung: TriangleAlert,
  baustelle: TrafficCone,
  verkehr: CarFront,
  lokal: Newspaper,
};

function trafficTone(kind: TrafficItem["kind"]): string {
  if (kind === "sperrung" || kind === "stoerung") return "text-red-400";
  if (kind === "blitzer") return "text-amber-400";
  return "text-zinc-400";
}

function TrafficRow({ item }: { item: TrafficItem }) {
  const Icon = TRAFFIC_ICON[item.kind] ?? Newspaper;
  const content = (
    <>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${trafficTone(item.kind)}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-snug text-zinc-100">{item.title}</span>
        <span className="mt-0.5 block text-xs text-zinc-400">
          {[item.source, item.timeLabel].filter(Boolean).join(" · ")}
        </span>
      </span>
      {item.url && <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />}
    </>
  );
  const rowCls = "flex min-h-11 items-start gap-3 border-t border-white/5 py-2.5 first:border-t-0";

  return item.url ? (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className={`${rowCls} hover:bg-white/[0.03]`}>
      {content}
    </a>
  ) : (
    <div className={rowCls}>{content}</div>
  );
}

function TrafficCard({ items }: { items: TrafficItem[] }) {
  const [open, setOpen] = useState(false);
  const important = items.filter((t) => t.kind !== "baustelle" && t.kind !== "lokal");
  const rest = items.filter((t) => t.kind === "baustelle" || t.kind === "lokal");

  return (
    <section aria-label="Verkehr und Blitzer" className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/60">
      <h2 className="px-4 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-zinc-400">Verkehr &amp; Blitzer</h2>

      {important.length === 0 ? (
        <p className="px-4 pb-3 text-sm text-zinc-400">Keine Meldungen.</p>
      ) : (
        <div className="px-4 pb-2">
          {important.map((item) => (
            <TrafficRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div className="border-t border-white/10">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-white/[0.03]"
          >
            <span className="min-w-0 flex-1">Baustellen &amp; Hinweise</span>
            <span className="shrink-0 text-xs text-zinc-400">{rest.length}</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {open && (
            <div className="px-4 pb-2">
              {rest.map((item) => (
                <TrafficRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------- Woche ----------

function WeekCard({ data }: { data: DemandResponse }) {
  return (
    <Disclosure title="Woche" meta={`${data.days.length} Tage`}>
      {data.days.map((d, i) => {
        const tier = scoreTier(d.dayMax);
        return (
          <div key={d.dateKey} className={`flex items-center gap-2 py-2.5 ${i > 0 ? "border-t border-white/5" : ""}`}>
            <span className="w-16 shrink-0 text-xs tabular-nums text-zinc-400">
              {WD[d.weekday]} {d.dateKey.slice(8, 10)}.{d.dateKey.slice(5, 7)}.
            </span>
            <span className={`min-w-0 flex-1 truncate text-sm ${tier.text}`}>{d.verdict}</span>
            <span
              className={`inline-flex w-9 shrink-0 justify-center rounded-md py-0.5 text-sm font-bold tabular-nums ${tier.bg} ${tier.fg}`}
            >
              {d.dayMax}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-zinc-400">
              {Math.round(d.tempMin)}–{Math.round(d.tempMax)}°
            </span>
            <WeatherGlyph code={d.weatherCode} className="h-4 w-4 shrink-0 text-zinc-400" />
          </div>
        );
      })}
    </Disclosure>
  );
}

// ---------- Szene ----------

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 2) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  return `vor ${days} Tag${days === 1 ? "" : "en"}`;
}

function SceneCard({ items }: { items: AlertItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 6);

  return (
    <Disclosure title="Szene" meta={String(items.length)}>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-400">Keine Meldungen.</p>
      ) : (
        <>
          {visible.map((a, i) => {
            const host = a.url
              ? (() => {
                  try {
                    return new URL(a.url).hostname.replace(/^www\./, "");
                  } catch {
                    return a.feed;
                  }
                })()
              : a.feed;
            const content = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug text-zinc-100">{a.title}</span>
                  <span className="mt-0.5 block text-xs text-zinc-400">
                    {[host, relativeTime(a.publishedAt)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {a.url && <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />}
              </>
            );
            const rowCls = `flex min-h-11 items-start gap-3 py-2.5 ${i > 0 ? "border-t border-white/5" : ""}`;
            return a.url ? (
              <a
                key={`${a.id}-${i}`}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${rowCls} hover:bg-white/[0.03]`}
              >
                {content}
              </a>
            ) : (
              <div key={`${a.id}-${i}`} className={rowCls}>
                {content}
              </div>
            );
          })}
          {items.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="mt-2 flex min-h-11 w-full items-center justify-center rounded-lg border border-white/10 text-xs font-medium text-zinc-300"
            >
              {showAll ? "Weniger anzeigen" : `Alle ${items.length} anzeigen`}
            </button>
          )}
        </>
      )}
    </Disclosure>
  );
}

// ---------- Datenquellen ----------

function SourcesFooter({ sources }: { sources: SourceStatus[] }) {
  const rows = sources.filter((s) => s.key !== "geo");
  return (
    <Disclosure title="Datenquellen">
      <ul className="space-y-1.5">
        {rows.map((s) => (
          <li key={s.key} className="flex items-start gap-2 text-xs">
            <span
              className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${s.ok ? "bg-[#06C167]" : "bg-red-500"}`}
              aria-hidden
            />
            <span className="min-w-0 text-zinc-400">
              <span className="text-zinc-300">{s.label}</span> – {s.detail}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-zinc-400">Alle Angaben ohne Gewähr – die Nachfrage vor Ort entscheidet.</p>
    </Disclosure>
  );
}

// ---------- Seite ----------

export default function Dashboard() {
  const [data, setData] = useState<DemandResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demand", { cache: "no-store" });
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
    const interval = setInterval(() => load(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const day = now.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
      const time = now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      setClock(`${day} · ${time}`);
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, []);

  const region = data?.city ?? "Regensburg";
  const { coords, status, request, hint } = useLocation();

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/95 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div
          className="mx-auto flex w-full max-w-[560px] items-center gap-2 px-4 py-3"
          style={{
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
          }}
        >
          <LogoMark size={36} />
          <div className="min-w-0 flex-1">
            <Wordmark sub={[region, clock].filter(Boolean).join(" · ")} />
          </div>
          <button
            type="button"
            onClick={request}
            aria-label="Standort verwenden"
            title="Standort verwenden"
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
              status === "active" ? "border-[#06C167]/40 text-[#06C167]" : "border-white/10 text-zinc-300"
            } hover:border-white/25`}
          >
            <LocateFixed className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            aria-label="Daten aktualisieren"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-zinc-300 hover:border-white/25 disabled:text-zinc-600"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      <main
        className="mx-auto w-full max-w-[560px] flex-1 px-4 py-4"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        {error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
            <p className="text-sm font-semibold text-red-400">Daten nicht ladbar</p>
            <p className="mt-1 text-sm text-zinc-300">{error}</p>
            <button
              type="button"
              onClick={() => load()}
              className="mt-3 min-h-11 rounded-lg bg-white px-4 text-sm font-semibold text-black"
            >
              Erneut versuchen
            </button>
          </div>
        ) : !data ? (
          <div className="space-y-6" aria-busy="true">
            <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
              <div className="h-3 w-24 rounded bg-white/10" />
              <div className="mt-3 h-10 w-20 rounded bg-white/10" />
              <div className="mt-3 h-3 w-full rounded bg-white/10" />
            </div>
            <p className="text-sm text-zinc-400">Lade Daten …</p>
          </div>
        ) : (
          <div className="space-y-6">
            <h1 className="text-lg font-semibold tracking-tight text-white">Wann lohnt sich Fahren?</h1>
            <FahrerStatusCard
              data={data}
              position={coords}
              locationHint={hint}
              disruption={data.disruption ?? null}
            />
            <FahrerPlanCard data={data} />
            <EventsCard data={data} />
            <TrafficCard items={data.traffic} />
            <WeekCard data={data} />
            <SceneCard items={data.sceneNews} />
          </div>
        )}
      </main>

      {data && (
        <footer className="border-t border-white/10" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div
            className="mx-auto w-full max-w-[560px] px-4 py-4"
            style={{
              paddingLeft: "max(1rem, env(safe-area-inset-left))",
              paddingRight: "max(1rem, env(safe-area-inset-right))",
            }}
          >
            <SourcesFooter sources={data.sources} />
          </div>
        </footer>
      )}
    </div>
  );
}
