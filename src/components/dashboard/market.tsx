"use client";

// Block a–d: Fahrer-Index jetzt, Standplatz, Kontext-Chips und der Fahrer-Plan
// für heute und morgen.

import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  CloudRain,
  Droplets,
  MapPin,
  Minus,
  Moon,
  Navigation,
  Sunset,
  Thermometer,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import type { BestWindow, DemandResponse, Disruption, HourScore, TrafficItem } from "@/lib/sources/types";
import { formatDistance, nearestHotspot, resolveHotspot, type LatLon } from "@/lib/geo";
import { formatSunset, ReasonGlyph, scoreTier, WeatherGlyph } from "./helpers";

const GREEN = "#06C167";
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const fmtH = (h: number) => String(((h % 24) + 24) % 24).padStart(2, "0");

// Alter einer Meldung ("vor 5 h"), bewusst kurz für die Hinweiszeile.
function ageLabel(iso: string | null): string {
  if (!iso) return "live";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "live";
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 60) return `vor ${Math.max(1, minutes)} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} h`;
  const days = Math.round(hours / 24);
  return `vor ${days} Tag${days === 1 ? "" : "en"}`;
}

// ---------- Chip ----------

function Chip({
  icon,
  children,
  tone = "neutral",
}: {
  icon: ReactNode;
  children: ReactNode;
  tone?: "neutral" | "warn" | "danger";
}) {
  const toneCls =
    tone === "danger"
      ? "border-red-500/30 bg-red-500/10 text-red-400"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
        : "border-white/10 bg-white/[0.04] text-zinc-300";
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${toneCls}`}>
      <span className="shrink-0" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

// ---------- Was gilt jetzt? ----------

type Action = { label: string; detail: string; driving: boolean };

function nextAction(data: DemandResponse): Action {
  const clock = (h: number) => `${fmtH(h)}:00`;
  const dur = (min: number) => {
    const m = Math.max(0, Math.round(min));
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
  };
  const { hour: nowHour, minute: nowMinute, dateKey } = data.berlinNow;
  const today = data.hours.filter((h) => h.dateKey === dateKey).sort((a, b) => a.hour - b.hour);
  const nowScore = today.find((h) => h.hour === nowHour)?.score;

  if (nowScore != null && nowScore >= 50) {
    let end = nowHour + 1;
    while (end < 24 && (today.find((h) => h.hour === end)?.score ?? 0) >= 45) end++;
    return {
      label: "Jetzt fahren",
      detail: `Guter Block bis ${clock(end)} – noch ${dur((end - nowHour) * 60 - nowMinute)}`,
      driving: true,
    };
  }

  const next = today.find((h) => h.hour > nowHour && h.score >= 45);
  if (next) {
    return {
      label: "Besser warten",
      detail: `Nächste Chance ${clock(next.hour)} (Index ${next.score}) – in ${dur((next.hour - nowHour) * 60 - nowMinute)}`,
      driving: false,
    };
  }

  const tomorrowWindow = data.days[1]?.bestWindows[0];
  return {
    label: "Feierabend",
    detail: tomorrowWindow
      ? `Morgen ${clock(tomorrowWindow.startHour)}–${clock(tomorrowWindow.endHour)} (Index ${tomorrowWindow.score})`
      : `Morgen: ${data.days[1]?.verdict ?? "—"}`,
    driving: false,
  };
}

const WARNING_ORDER: TrafficItem["kind"][] = ["sperrung", "stoerung", "blitzer"];

function topWarning(items: TrafficItem[]): TrafficItem | undefined {
  for (const kind of WARNING_ORDER) {
    const hit = items.find((t) => t.kind === kind);
    if (hit) return hit;
  }
  return undefined;
}

// ---------- a–c: Index, Standplatz, Chips ----------

export function FahrerStatusCard({
  data,
  position,
  locationHint,
  disruption,
}: {
  data: DemandResponse;
  position: LatLon | null;
  locationHint: string | null;
  disruption: Disruption | null;
}) {
  const [showDisruption, setShowDisruption] = useState(false);
  const now = data.now;
  const tier = scoreTier(now.score);
  const act = nextAction(data);
  const TrendIcon = now.trend === "up" ? TrendingUp : now.trend === "down" ? TrendingDown : Minus;
  const warning = topWarning(data.traffic);

  // Entfernungen nur zur Anzeige – Standplatz-Empfehlung und Index bleiben unverändert.
  const place = position && now.hotspot ? resolveHotspot(now.hotspot, position) : null;
  const alternative = position ? nearestHotspot(position) : null;
  const otherHotspot = alternative && alternative.name !== place?.name ? alternative : null;

  return (
    <section aria-label="Fahrer-Index jetzt" className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Fahrer-Index</p>

      <div className="mt-2 flex items-center gap-3">
        <span className={`flex items-baseline gap-1 ${tier.text}`}>
          <span className="text-5xl font-bold leading-none tabular-nums">{now.score}</span>
          <TrendIcon
            className={`h-4 w-4 shrink-0 ${now.trend === "up" ? "text-[#06C167]" : "text-zinc-400"}`}
            aria-hidden
          />
        </span>
        <p
          className={`min-w-0 flex-1 text-lg font-semibold leading-tight ${
            act.driving ? "text-[#06C167]" : "text-white"
          }`}
        >
          {act.label}
        </p>
      </div>

      <p className="mt-2 text-sm text-zinc-300">{act.detail}</p>

      {disruption && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowDisruption((open) => !open)}
            aria-expanded={showDisruption}
            className={`flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left ${
              disruption.severity === "streik"
                ? "border-red-500/30 bg-red-500/10"
                : "border-amber-500/30 bg-amber-500/10"
            }`}
          >
            <TriangleAlert
              className={`h-3.5 w-3.5 shrink-0 ${
                disruption.severity === "streik" ? "text-red-400" : "text-amber-400"
              }`}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-100" title={disruption.title}>
              {disruption.title}
            </span>
            <span className="shrink-0 text-xs text-zinc-400">{ageLabel(disruption.publishedAt)}</span>
            <span
              className={`shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-semibold ${
                disruption.severity === "streik"
                  ? "border-red-500/40 text-red-400"
                  : "border-amber-500/40 text-amber-400"
              }`}
            >
              {disruption.severity === "streik" ? "Streik" : "Störung"} +{disruption.bonus}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
                showDisruption ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </button>

          {showDisruption && (
            <div className="mt-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400">
              <p className="break-words text-zinc-300">{disruption.title}</p>
              <p className="mt-1 break-words">
                Quelle: {disruption.source}
                {disruption.url && (
                  <>
                    {" · "}
                    <a
                      href={disruption.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-300 underline underline-offset-2"
                    >
                      Meldung öffnen
                    </a>
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {now.hotspot && (
        <p className="mt-2 flex items-start gap-1.5 text-sm">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#06C167]" aria-hidden />
          <span className="min-w-0 text-zinc-100">
            {now.hotspot}
            {place && (
              <span className="text-zinc-400">
                {` · ${formatDistance(place.km)} entfernt · ca. ${place.minutes} min`}
              </span>
            )}
          </span>
        </p>
      )}

      {otherHotspot && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-zinc-400">
          <Navigation className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span className="min-w-0">
            Nächster Hotspot: {otherHotspot.name} · {formatDistance(otherHotspot.km)} · ca.{" "}
            {otherHotspot.minutes} min
          </span>
        </p>
      )}

      {!position && locationHint && <p className="mt-1 text-xs text-zinc-400">{locationHint}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <Chip icon={<Thermometer className="h-3.5 w-3.5" />}>{now.tempNow} °C</Chip>
        {now.isRainyNow ? (
          <Chip icon={<CloudRain className="h-3.5 w-3.5" />}>
            {`Regen ${now.precipNow.toFixed(1).replace(".", ",")} mm/h`}
          </Chip>
        ) : now.rainNext3h ? (
          <Chip icon={<CloudRain className="h-3.5 w-3.5" />}>Regen zieht auf</Chip>
        ) : (
          <Chip icon={<Droplets className="h-3.5 w-3.5" />}>Trocken</Chip>
        )}
        <Chip icon={<Sunset className="h-3.5 w-3.5" />}>{formatSunset(now.sunsetToday)}</Chip>
        {warning && (
          <Chip
            tone={warning.kind === "blitzer" ? "warn" : "danger"}
            icon={<TriangleAlert className="h-3.5 w-3.5" />}
          >
            {warning.title.length > 44 ? `${warning.title.slice(0, 42)}…` : warning.title}
          </Chip>
        )}
      </div>
    </section>
  );
}

// ---------- Stunden-Verlauf ----------

function bandFill(score: number): { fill: string; opacity: number } {
  if (score >= 60) return { fill: GREEN, opacity: 0.16 };
  if (score >= 45) return { fill: GREEN, opacity: 0.08 };
  if (score >= 35) return { fill: "#ffffff", opacity: 0.04 };
  return { fill: "#ffffff", opacity: 0.02 };
}

function IndexChart({
  hours,
  nowFloat,
  selected,
  onSelect,
}: {
  hours: HourScore[];
  nowFloat: number | null;
  selected: number | null;
  onSelect: (hour: number) => void;
}) {
  const sorted = useMemo(() => [...hours].sort((a, b) => a.hour - b.hour), [hours]);

  if (sorted.length === 0) {
    return <p className="text-sm text-zinc-400">Keine Stundenwerte für diesen Tag.</p>;
  }

  const W = 360;
  const H = 170;
  const padL = 26;
  const padR = 8;
  const padT = 20;
  const padB = 18;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xStart = (h: number) => padL + (h / 24) * plotW;
  const xCenter = (h: number) => padL + ((h + 0.5) / 24) * plotW;
  const y = (s: number) => padT + (1 - s / 100) * plotH;
  const baseY = y(0);

  const line = sorted.map((h) => `${xCenter(h.hour)},${y(h.score)}`).join(" ");
  const area = `${padL},${baseY} ${line} ${padL + plotW},${baseY}`;
  const nowX = nowFloat != null ? padL + (nowFloat / 24) * plotW : null;
  const current = nowFloat != null ? sorted.find((h) => h.hour === Math.floor(nowFloat)) : undefined;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Fahrer-Index im Tagesverlauf">
      {sorted.map((h) => {
        const band = bandFill(h.score);
        return (
          <rect
            key={`band-${h.hour}`}
            x={xStart(h.hour)}
            y={padT}
            width={plotW / 24}
            height={plotH}
            fill={band.fill}
            opacity={band.opacity}
          />
        );
      })}

      {[0, 50, 100].map((s) => (
        <g key={`grid-${s}`}>
          <line x1={padL} x2={padL + plotW} y1={y(s)} y2={y(s)} stroke="#ffffff" strokeOpacity={0.08} strokeWidth={1} />
          <text x={padL - 5} y={y(s) + 2.5} textAnchor="end" fontSize={8} fill="#71717a">
            {s}
          </text>
        </g>
      ))}

      <polygon points={area} fill={GREEN} fillOpacity={0.14} />

      {sorted
        .filter((h) => h.precip >= 0.1)
        .map((h) => {
          const barH = Math.min(14, 4 + h.precip * 8);
          return (
            <rect
              key={`rain-${h.hour}`}
              x={xCenter(h.hour) - 3}
              y={baseY - barH}
              width={6}
              height={barH}
              rx={1}
              fill="#a1a1aa"
              opacity={0.5}
            />
          );
        })}

      <polyline
        points={line}
        fill="none"
        stroke={GREEN}
        strokeOpacity={0.25}
        strokeWidth={5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <polyline points={line} fill="none" stroke={GREEN} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {nowX != null && (
        <>
          <line x1={nowX} x2={nowX} y1={padT} y2={baseY} stroke={GREEN} strokeWidth={1.2} strokeDasharray="3 3" />
          {current && <circle cx={nowX} cy={y(current.score)} r={3.5} fill={GREEN} stroke="#09090b" strokeWidth={1.5} />}
        </>
      )}

      {selected != null && (
        <rect
          x={xStart(selected)}
          y={padT}
          width={plotW / 24}
          height={plotH}
          fill="#ffffff"
          fillOpacity={0.08}
          stroke="#ffffff"
          strokeOpacity={0.5}
          strokeWidth={1}
          rx={3}
        />
      )}

      {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
        <text key={`hour-${h}`} x={xCenter(h)} y={baseY + 12} textAnchor="middle" fontSize={8} fill="#a1a1aa">
          {fmtH(h)}
        </text>
      ))}

      {sorted.map((h) => (
        <rect
          key={`hit-${h.hour}`}
          x={xStart(h.hour)}
          y={padT}
          width={plotW / 24}
          height={plotH}
          fill="transparent"
          className="cursor-pointer"
          onClick={() => onSelect(h.hour)}
        />
      ))}
    </svg>
  );
}

// ---------- Zeitleiste ----------

function PlanRows({
  windows,
  hours,
  isToday,
  nowHour,
}: {
  windows: BestWindow[];
  hours: HourScore[];
  isToday: boolean;
  nowHour: number | null;
}) {
  if (windows.length === 0) {
    return (
      <p className="rounded-lg border border-white/10 px-3 py-2.5 text-sm text-zinc-400">
        Kein deutliches Zeitfenster.
      </p>
    );
  }

  const rows: ReactNode[] = [];

  windows.forEach((w, i) => {
    const prev = i > 0 ? windows[i - 1] : null;
    if (prev && w.startHour - prev.endHour >= 2) {
      rows.push(
        <div key={`pause-${i}`} className="flex items-center gap-2.5 px-3 py-1 text-sm text-zinc-400">
          <span className="w-14 shrink-0 font-mono tabular-nums">
            {fmtH(prev.endHour)}–{fmtH(w.startHour)}
          </span>
          <span>Pause</span>
        </div>
      );
    }

    const tier = scoreTier(w.score);
    const running = isToday && nowHour != null && nowHour >= w.startHour && nowHour < w.endHour;

    rows.push(
      <div
        key={`window-${i}`}
        className={`rounded-lg border px-3 py-2.5 ${running ? "border-[#06C167]/60 bg-[#06C167]/10" : "border-white/10"}`}
      >
        <div className="flex items-center gap-2.5">
          <span className="w-14 shrink-0 font-mono text-sm font-semibold tabular-nums text-zinc-100">
            {fmtH(w.startHour)}–{fmtH(w.endHour)}
          </span>
          <span
            className={`inline-flex w-9 shrink-0 justify-center rounded-md px-1 py-0.5 text-sm font-bold tabular-nums ${tier.bg} ${tier.fg}`}
          >
            {w.score}
          </span>
          {running && (
            <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-[#06C167]">läuft</span>
          )}
        </div>
        {w.hotspot && (
          <p className="mt-1.5 flex items-start gap-1.5 pl-14 text-xs text-zinc-400">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#06C167]" aria-hidden />
            <span className="min-w-0">{w.hotspot}</span>
          </p>
        )}
      </div>
    );
  });

  if (isToday) {
    const last = windows[windows.length - 1];
    if (last.endHour < 23) {
      const after = hours.filter((h) => h.hour >= last.endHour);
      if (after.length > 0) {
        const avg = Math.round(after.reduce((sum, h) => sum + h.score, 0) / after.length);
        if (avg < 35) {
          rows.push(
            <div key="feierabend" className="flex items-center gap-2.5 px-3 py-1 text-sm text-zinc-400">
              <Moon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Feierabend ab {fmtH(last.endHour)} Uhr – Ø {avg}
              </span>
            </div>
          );
        }
      }
    }
  }

  return <>{rows}</>;
}

// ---------- d: Fahrer-Plan ----------

export function FahrerPlanCard({ data }: { data: DemandResponse }) {
  const [dayIdx, setDayIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const isToday = dayIdx === 0;
  const day = data.days[dayIdx];

  const hours = useMemo(
    () => (day ? data.hours.filter((h) => h.dateKey === day.dateKey) : []),
    [data, day]
  );
  const windows = day?.bestWindows ?? [];
  const nowHour = isToday ? data.berlinNow.hour : null;
  const nowFloat = isToday ? data.berlinNow.hour + data.berlinNow.minute / 60 : null;
  const selectedHour = selected != null ? hours.find((h) => h.hour === selected) : undefined;
  const tomorrow = data.days[1];

  return (
    <section aria-label="Fahrer-Plan" className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Fahrer-Plan</h2>
        <div className="flex rounded-lg border border-white/10 p-0.5" role="group" aria-label="Tag wählen">
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setDayIdx(i);
                setSelected(null);
              }}
              aria-pressed={dayIdx === i}
              className={`min-h-11 rounded-md px-3 text-xs font-semibold ${
                dayIdx === i ? "bg-white text-black" : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {i === 0 ? "Heute" : "Morgen"}
            </button>
          ))}
        </div>
      </div>

      {!isToday && tomorrow && (
        <p className="mt-2 text-xs text-zinc-400">
          {WD[tomorrow.weekday]}, {tomorrow.dateKey.slice(8, 10)}.{tomorrow.dateKey.slice(5, 7)}. · {tomorrow.verdict}
        </p>
      )}

      <div className="mt-3 space-y-2">
        <PlanRows windows={windows} hours={hours} isToday={isToday} nowHour={nowHour} />
      </div>

      <div className="mt-4">
        <IndexChart
          hours={hours}
          nowFloat={nowFloat}
          selected={selected}
          onSelect={(h) => setSelected((prev) => (prev === h ? null : h))}
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-zinc-400/70" aria-hidden />
            Regen
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 border-l border-dashed border-[#06C167]" aria-hidden />
            Jetzt
          </span>
        </div>

        {selectedHour && (
          <div className="mt-3 rounded-lg border border-white/10 p-3">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-100">
              {fmtH(selectedHour.hour)}:00–{fmtH(selectedHour.hour + 1)}:00 · Index {selectedHour.score}
              <WeatherGlyph code={selectedHour.weatherCode} className="h-3.5 w-3.5 text-zinc-400" />
              <span className="font-normal tabular-nums text-zinc-400">{Math.round(selectedHour.temp)} °C</span>
            </p>
            {selectedHour.hotspot && (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-zinc-400">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[#06C167]" aria-hidden />
                <span className="min-w-0">{selectedHour.hotspot}</span>
              </p>
            )}
            {selectedHour.reasons.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedHour.reasons.map((c, i) => (
                  <Chip key={i} icon={<ReasonGlyph icon={c.icon} />}>
                    {c.label}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
