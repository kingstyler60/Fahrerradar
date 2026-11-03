"use client";

// Fahrer-Übersichts-Karte – ALLES WICHTIGE IN EINER KARTE:
// - Kopf: "Jetzt · Uhrzeit" mit Status + großem Fahrer-Index (Zahl läuft hoch)
// - Großer Aktions-Banner: "Jetzt fahren / Jetzt Pause / Feierabend" mit Countdown
// - DEIN FAHRER-PLAN: Beginnen 07:00–09:00 → Pause 09–17 → Fahren 17:00–21:00,
//   groß & sofort lesbar, mit "läuft gerade"-Markierung und Feierabend-Hinweis
// - Button Heute/Morgen: schaltet Plan + Chart + Details komplett um
//   (Schicht-Ende-Blick: besser aufhören & morgen besser anfangen)
// - Markt-Chart im Aktien-Stil: Zickzack-Linie, farbige Stundenbänder,
//   Regen als Volumen-Balken, Jetzt-Linie, Hover = Sofort-Handlungs-Anweisung,
//   Klick = Details zur Stunde

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  CarFront,
  CloudRain,
  Droplets,
  Minus,
  Moon,
  Navigation,
  Sunset,
  Thermometer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import gsap from "gsap";
import type { BestWindow, DemandResponse, HourScore } from "@/lib/sources/types";
import { ReasonGlyph, scoreTier, WeatherGlyph, formatSunset } from "./helpers";
import { SpotlightCard } from "./spotlight";

const GREEN = "#06C167";

const fmtH = (h: number) => String(((h % 24) + 24) % 24).padStart(2, "0");
const WD_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// kleine lokale Kopien der Dashboard-Bausteine (vermeidet Zirkel-Importe)

function Chip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="glass-soft inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium leading-4 text-zinc-300">
      <span className="text-[#06C167]" aria-hidden>{icon}</span>
      <span className="truncate max-w-[240px]">{label}</span>
    </span>
  );
}

function WindowScore({ score }: { score: number }) {
  const t = scoreTier(score);
  return (
    <span
      className={`inline-flex min-w-12 items-center justify-center rounded-lg px-2.5 py-1 text-lg font-black tabular-nums ${t.bg} ${t.fg}`}
      title={`Fahrer-Index ${score} (${t.label})`}
    >
      {score}
    </span>
  );
}

// ---------- Aktions-Logik: was gilt JETZT? ----------

function nextAction(data: DemandResponse): {
  state: "fahren" | "pause" | "feierabend";
  headline: string;
  detail: string;
} {
  const fmt = (h: number) => `${fmtH(h)}:00`;
  const dur = (min: number) => {
    const m = Math.max(0, Math.round(min));
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
  };
  const today = data.hours
    .filter((h) => h.dateKey === data.berlinNow.dateKey)
    .sort((a, b) => a.hour - b.hour);
  const nowHour = data.berlinNow.hour;
  const nowScore = today.find((h) => h.hour === nowHour)?.score;

  // 1) Läuft gerade ein guter Block? -> weiterfahren, bis er endet
  if (nowScore != null && nowScore >= 50) {
    let end = nowHour + 1;
    while (end < 24 && (today.find((h) => h.hour === end)?.score ?? 0) >= 45) end++;
    const mins = (end - nowHour) * 60 - data.berlinNow.minute;
    return {
      state: "fahren",
      headline: "Jetzt fahren – es läuft",
      detail: `Guter Block bis ~${fmt(end)} Uhr (noch ~${dur(mins)}) – dranbleiben.`,
    };
  }
  // 2) Nächste brauchbare Stunde heute? -> Pause einlegen mit Countdown
  const next = today.find((h) => h.hour > nowHour && h.score >= 45);
  if (next) {
    const mins = (next.hour - nowHour) * 60 - data.berlinNow.minute;
    return {
      state: "pause",
      headline: "Jetzt Pause – lohnt noch nicht",
      detail: `Nächste Chance: ${fmt(next.hour)} Uhr (Index ${next.score}) · das sind ~${dur(mins)}. Zeit zum Auftanken, Essen & App-Arbeit.`,
    };
  }
  // 3) Heute vorbei -> Feierabend mit Morgen-Blick (besser aufhören & starten)
  const tw = data.days[1]?.bestWindows[0];
  return {
    state: "feierabend",
    headline: "Feierabend – heute kommt nichts mehr",
    detail: tw
      ? `Morgen besser starten: ${fmt(tw.startHour)}–${fmt(tw.endHour)} Uhr (Index ${tw.score}).`
      : `Morgen: ${data.days[1]?.verdict ?? "—"}.`,
  };
}

// Klare Fahrer-Anweisung pro Stunde (für die Hover-Tooltips)
function hourAction(h: HourScore, windows: BestWindow[]): { text: string; color: string } {
  const w = windows.find((x) => h.hour >= x.startHour && h.hour < x.endHour);
  if (w) {
    if (h.hour === w.startHour) {
      return { text: "▶ Fenster öffnet – hier lohnt der Start", color: GREEN };
    }
    return { text: "★ Top-Zeit – jetzt dranbleiben", color: GREEN };
  }
  const gap =
    windows.length >= 2 && h.hour >= windows[0].endHour && h.hour < windows[windows.length - 1].startHour;
  if (gap) return { text: "Pausen-Zone – Auftanken, Essen, App-Arbeit", color: "#fbbf24" };
  if (h.score >= 50) return { text: "Läuft gut – weiterfahren", color: "#3EBE7E" };
  if (h.score >= 35) return { text: "Mäßig – nur fahren, wenn es sich lohnt", color: "#d4d4d8" };
  return { text: "Toter Punkt – besser Pause machen", color: "#a1a1aa" };
}

// ---------- Das Chart selbst ----------

function bandFill(score: number): { fill: string; opacity: number } {
  if (score >= 60) return { fill: GREEN, opacity: 0.15 };
  if (score >= 45) return { fill: GREEN, opacity: 0.07 };
  if (score >= 35) return { fill: "#a1a1aa", opacity: 0.05 };
  return { fill: "#ffffff", opacity: 0.02 };
}

type MarketChartProps = {
  hours: HourScore[];
  windows: BestWindow[];
  nowFloat: number | null; // z.B. 4.95 für 04:57 – null bei "Morgen"
  selected: number | null;
  onSelect: (hour: number) => void;
};

function MarketChart({ hours, windows, nowFloat, selected, onSelect }: MarketChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const sorted = useMemo(() => [...hours].sort((a, b) => a.hour - b.hour), [hours]);

  const W = 960;
  const H = 250;
  const padL = 40;
  const padR = 14;
  const padT = 30;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xC = (h: number) => padL + ((h + 0.5) / 24) * plotW; // Mitte der Stunde
  const xE = (h: number) => padL + (h / 24) * plotW; // Stunden-Grenze
  const y = (s: number) => padT + (1 - s / 100) * plotH;
  const baseY = y(0);

  if (sorted.length === 0) {
    return <div className="text-sm text-zinc-500">Keine Stunden-Daten für diesen Tag.</div>;
  }

  const linePts = sorted.map((h) => `${xC(h.hour)},${y(h.score)}`).join(" ");
  const areaPts = `${padL},${baseY} ${linePts} ${padL + plotW},${baseY}`;

  const nowX = nowFloat != null ? padL + (nowFloat / 24) * plotW : null;
  const curHour = nowFloat != null ? Math.floor(nowFloat) : null;
  const cur = curHour != null ? sorted.find((h) => h.hour === curHour) : undefined;

  const winLabels = windows.slice(0, 3);

  // Tooltip-Geometrie für die gehoverte Stunde
  const hoverH = hover != null ? sorted.find((h) => h.hour === hover) : undefined;
  let tip: { x: number; y: number; above: boolean; act: { text: string; color: string }; px: number; py: number } | null = null;
  if (hoverH) {
    const px = xC(hoverH.hour);
    const py = y(hoverH.score);
    const tw = 248;
    const th = 70;
    const tx = Math.max(padL - 8, Math.min(W - padR - tw + 8, px - tw / 2));
    const above = py - th - 14 >= padT;
    tip = { x: tx, y: above ? py - th - 10 : py + 12, above, act: hourAction(hoverH, windows), px, py };
  }

  return (
    <div className="overflow-x-auto pb-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[640px]"
        role="img"
        aria-label={`Markt-Analyse des Fahrer-Index über 24 Stunden${nowFloat != null ? " mit Jetzt-Markierung" : ""}`}
        onMouseLeave={() => setHover(null)}
      >
        {/* Stundenbänder – automatisch farbig nach Index-Stärke */}
        {sorted.map((h) => {
          const f = bandFill(h.score);
          return (
            <rect
              key={`band-${h.hour}`}
              x={xE(h.hour)}
              y={padT}
              width={plotW / 24}
              height={plotH}
              fill={f.fill}
              opacity={f.opacity}
            />
          );
        })}

        {/* Rasterlinien + Y-Beschriftung */}
        {[0, 50, 100].map((s) => (
          <g key={`grid-${s}`}>
            <line x1={padL} x2={padL + plotW} y1={y(s)} y2={y(s)} stroke="#ffffff" strokeOpacity={0.07} strokeWidth={1} />
            <text x={padL - 7} y={y(s) + 3.5} textAnchor="end" fontSize={10} fill="#52525b">{s}</text>
          </g>
        ))}

        {/* Fläche unter der Kurve */}
        <polygon points={areaPts} fill={GREEN} fillOpacity={0.12} />

        {/* Regen-Balken (unten, wie Volumen im Börsen-Chart) */}
        {sorted.filter((h) => h.precip >= 0.1).map((h) => (
          <rect
            key={`rain-${h.hour}`}
            x={xC(h.hour) - 3.5}
            y={baseY - Math.min(18, 5 + h.precip * 12)}
            width={7}
            height={Math.min(18, 5 + h.precip * 12)}
            rx={1.5}
            fill="#2dd4bf"
            opacity={0.55}
          />
        ))}

        {/* Zickzack-Linie: weicher Schein + scharfe Linie */}
        <polyline points={linePts} fill="none" stroke={GREEN} strokeOpacity={0.22} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={linePts} fill="none" stroke={GREEN} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Vergangenheit abdunkeln + Jetzt-Linie */}
        {nowX != null && (
          <>
            <rect x={padL} y={padT} width={Math.max(0, nowX - padL)} height={plotH} fill="#000000" opacity={0.32} />
            <line x1={nowX} x2={nowX} y1={padT} y2={baseY} stroke={GREEN} strokeWidth={1.4} strokeDasharray="3 3" opacity={0.9} />
            {cur && (
              <circle cx={nowX} cy={y(cur.score)} r={4.5} fill={GREEN} stroke="#e4e4e7" strokeWidth={1.5} />
            )}
            <text
              x={nowX > W - 90 ? nowX - 6 : nowX + 6}
              y={padT + 11}
              textAnchor={nowX > W - 90 ? "end" : "start"}
              fontSize={11}
              fontWeight={700}
              fill="#d4d4d8"
            >
              Jetzt
            </text>
          </>
        )}

        {/* Beste Zeitfenster: Rahmen + Beschriftung */}
        {winLabels.map((w, i) => {
          const x0 = xE(w.startHour) + 2;
          const x1 = xE(w.endHour) - 2;
          const cx = Math.max(padL + 48, Math.min(W - padR - 48, (x0 + x1) / 2));
          return (
            <g key={`win-${i}`}>
              <rect
                x={x0}
                y={padT + 3}
                width={Math.max(6, x1 - x0)}
                height={plotH - 6}
                rx={10}
                fill="none"
                stroke={GREEN}
                strokeOpacity={0.55}
                strokeWidth={1.2}
                strokeDasharray="5 4"
              />
              <text x={cx} y={padT - 9} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={GREEN}>
                {fmtH(w.startHour)}–{fmtH(w.endHour)} · {w.score}
              </text>
            </g>
          );
        })}

        {/* Ausgewählte Stunde */}
        {selected != null && (
          <rect
            x={xE(selected)}
            y={padT}
            width={plotW / 24}
            height={plotH}
            fill="#ffffff"
            fillOpacity={0.07}
            stroke="#e4e4e7"
            strokeOpacity={0.7}
            strokeWidth={1.4}
            rx={4}
          />
        )}

        {/* Hover-Hervorhebung */}
        {hover != null && (
          <rect
            x={xE(hover)}
            y={padT}
            width={plotW / 24}
            height={plotH}
            fill="#ffffff"
            fillOpacity={0.06}
            stroke="#ffffff"
            strokeOpacity={0.3}
            strokeWidth={1.2}
            rx={4}
            pointerEvents="none"
          />
        )}

        {/* X-Beschriftung (jede 3. Stunde) */}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
          <text key={`xl-${h}`} x={xC(h)} y={baseY + 16} textAnchor="middle" fontSize={10} fill="#71717a">
            {fmtH(h)}
          </text>
        ))}

        {/* Klick-/Hover-Flächen pro Stunde */}
        {sorted.map((h) => (
          <rect
            key={`hit-${h.hour}`}
            x={xE(h.hour)}
            y={padT}
            width={plotW / 24}
            height={plotH}
            fill="transparent"
            className="cursor-pointer"
            onMouseEnter={() => setHover(h.hour)}
            onMouseLeave={() => setHover((curH) => (curH === h.hour ? null : curH))}
            onClick={() => onSelect(h.hour)}
          />
        ))}

        {/* Sofort-Tooltip mit Handlungs-Anweisung */}
        {tip && hoverH && (
          <g pointerEvents="none">
            <line
              x1={tip.px}
              y1={tip.py}
              x2={tip.px}
              y2={tip.above ? tip.y + 70 : tip.y}
              stroke="#ffffff"
              strokeOpacity={0.3}
              strokeDasharray="2 2"
            />
            <rect x={tip.x} y={tip.y} width={248} height={70} rx={10} fill="#131316" fillOpacity={0.97} stroke={GREEN} strokeOpacity={0.4} />
            <text x={tip.x + 12} y={tip.y + 19} fontSize={12} fontWeight={700} fill="#ffffff">
              {fmtH(hoverH.hour)}:00–{fmtH(hoverH.hour + 1)}:00 · Index {hoverH.score}
            </text>
            <text x={tip.x + 12} y={tip.y + 38} fontSize={11.5} fontWeight={600} fill={tip.act.color}>
              {tip.act.text}
            </text>
            <text x={tip.x + 12} y={tip.y + 56} fontSize={10.5} fill="#a1a1aa">
              {Math.round(hoverH.temp)}°C · {hoverH.precip >= 0.1 ? `${hoverH.precip.toFixed(1).replace(".", ",")} mm/h Regen` : "trocken"}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

// ---------- DEIN FAHRER-PLAN: Beginnen → Pause → Fahren → Feierabend ----------

function DayPlanRows({
  windows,
  hours,
  isToday,
  nowFloat,
}: {
  windows: BestWindow[];
  hours: HourScore[];
  isToday: boolean;
  nowFloat: number | null;
}) {
  const nowHour = nowFloat != null ? Math.floor(nowFloat) : null;

  if (windows.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-400">
        Kein klares Zeitfenster an diesem Tag – der Chart zeigt den ganzen Verlauf.
        Fahre nach Gefühl, das Wetter entscheidet.
      </div>
    );
  }

  const rows: ReactNode[] = [];
  windows.forEach((w, i) => {
    const prev = i > 0 ? windows[i - 1] : null;
    // Automatischer Pausen-Hinweis zwischen den Fenstern – groß & lesbar
    if (prev && w.startHour - prev.endHour >= 2) {
      rows.push(
        <div
          key={`pause-${i}`}
          className="flex items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2.5"
        >
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/40 text-amber-300"
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="9" />
              <path d="M10 9v6M14 9v6" strokeLinecap="round" />
            </svg>
          </span>
          <div className="min-w-0 text-sm leading-snug sm:text-[15px]">
            <b className="font-extrabold text-zinc-100">Pause {fmtH(prev.endHour)}–{fmtH(w.startHour)} Uhr</b>
            <span className="text-zinc-400"> · läuft es flau – Zeit zum Auftanken, Essen &amp; App-Arbeit</span>
          </div>
        </div>
      );
    }

    // Fenster-Zeile: erste = "Beginnen", danach = "Fahren"
    const running = isToday && nowHour != null && nowHour >= w.startHour && nowHour < w.endHour;
    const isFirst = i === 0;
    const label = running
      ? "Jetzt fahren – läuft gerade!"
      : isFirst
        ? "Beginnen – hier lohnt der Start"
        : "Fahren – starke Zeit drin";
    rows.push(
      <div
        key={`win-${i}`}
        className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border p-3 ${
          running
            ? "border-[#06C167]/50 bg-[#06C167]/10 shadow-[0_0_35px_rgba(6,193,103,0.12)]"
            : "border-white/10 bg-black/30"
        }`}
      >
        <div className="w-24 shrink-0 font-mono text-base font-semibold text-zinc-100">
          {fmtH(w.startHour)}–{fmtH(w.endHour)}
        </div>
        <WindowScore score={w.score} />
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-extrabold leading-tight sm:text-[15px] ${running ? "text-[#06C167]" : "text-zinc-100"}`}>
            {label}
          </div>
          {w.reasons.length > 0 && (
            <div className="mt-1 flex min-w-0 flex-wrap gap-1.5">
              {w.reasons.slice(0, 3).map((c, j) => (
                <Chip key={j} icon={<ReasonGlyph icon={c.icon} />} label={c.label} />
              ))}
            </div>
          )}
        </div>
        {running && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#06C167] px-2.5 py-1 text-[11px] font-bold text-black">
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-black/50 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-black" />
            </span>
            läuft gerade
          </span>
        )}
      </div>
    );
  });

  // Feierabend-Hinweis (nur Heute-Tab): flaut es nach dem letzten Fenster ab?
  if (isToday) {
    const last = windows[windows.length - 1];
    if (last.endHour < 23) {
      const after = hours.filter((h) => h.hour >= last.endHour);
      if (after.length > 0) {
        const avg = Math.round(after.reduce((s, h) => s + h.score, 0) / after.length);
        if (avg < 35) {
          rows.push(
            <div key="feierabend" className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
              <span
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/40 text-zinc-400"
                aria-hidden
              >
                <Moon className="h-4 w-4" />
              </span>
              <div className="min-w-0 text-sm leading-snug sm:text-[15px]">
                <b className="font-extrabold text-zinc-200">Ab {fmtH(last.endHour)} Uhr: Feierabend</b>
                <span className="text-zinc-500"> · Ø Index {avg} – bringt danach kaum noch was</span>
              </div>
            </div>
          );
        }
      }
    }
  }

  return <div className="space-y-2">{rows}</div>;
}

// ---------- Die zusammengeführte Übersichts-Karte ----------

export function FahrerOverviewCard({ data }: { data: DemandResponse }) {
  const [dayIdx, setDayIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const isToday = dayIdx === 0;

  const n = data.now;
  const t = scoreTier(n.score);
  const scoreRef = useRef<HTMLSpanElement>(null);

  // Zahl läuft sanft hoch (dezent, bei reduzierter Bewegung aus)
  useEffect(() => {
    if (!isToday) return;
    const el = scoreRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = String(n.score);
      return;
    }
    const obj = { v: 0 };
    const tw = gsap.to(obj, {
      v: n.score,
      duration: 0.9,
      ease: "power2.out",
      onUpdate: () => {
        if (scoreRef.current) scoreRef.current.textContent = String(Math.round(obj.v));
      },
    });
    return () => {
      tw.kill();
    };
  }, [n.score, isToday]);

  const TrendIcon = n.trend === "up" ? TrendingUp : n.trend === "down" ? TrendingDown : Minus;
  const trendCls = n.trend === "up" ? "text-[#06C167]" : "text-zinc-400";
  const act = nextAction(data);

  const day = data.days[dayIdx];
  const hours = useMemo(
    () => (day ? data.hours.filter((h) => h.dateKey === day.dateKey) : []),
    [data, day]
  );
  const nowFloat = isToday ? data.berlinNow.hour + data.berlinNow.minute / 60 : null;
  const windows = day?.bestWindows ?? [];
  const selHour = selected != null ? hours.find((h) => h.hour === selected) : undefined;
  const dayLabel = isToday ? "Heute" : "Morgen";
  const tomorrow = data.days[1];
  const tomorrowDate = tomorrow
    ? `${WD_NAMES[tomorrow.weekday]}, ${tomorrow.dateKey.slice(8, 10)}.${tomorrow.dateKey.slice(5, 7)}.`
    : "";

  return (
    <SpotlightCard className="glass glass-edge rounded-2xl p-4 sm:p-5">
      {/* Kopf: JETZT (Heute-Tab) bzw. MORGEN (Morgen-Tab) */}
      {isToday ? (
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Navigation className="h-3.5 w-3.5" aria-hidden />
              Jetzt · {fmtH(data.berlinNow.hour)}:{String(data.berlinNow.minute).padStart(2, "0")} Uhr
            </div>
            <div className={`mt-1.5 text-2xl font-extrabold tracking-tight ${t.text}`}>{n.statusText}</div>
          </div>
          <div className="text-right">
            <span className={`inline-block text-4xl font-black tabular-nums ${t.bg} ${t.fg} rounded-xl px-3 py-1.5`}>
              <span ref={scoreRef}>{n.score}</span>
            </span>
            <div className="mt-1 text-[11px] text-zinc-500">Fahrer-Index</div>
          </div>
        </div>
      ) : (
        day && (
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                Morgen · {tomorrowDate}
              </div>
              <div className={`mt-1.5 text-2xl font-extrabold tracking-tight ${scoreTier(day.dayMax).text}`}>
                {day.verdict}
              </div>
              <div className="mt-1 text-sm text-zinc-400">
                Top-Index {day.dayMax} um {fmtH(day.peakHour)}:00 · {Math.round(day.tempMin)}–{Math.round(day.tempMax)}°C
                {day.precipSum >= 0.2 ? ` · ${day.precipSum.toFixed(1)} mm Regen` : " · trocken"}
              </div>
            </div>
            <div className="text-right">
              <span className={`inline-block text-4xl font-black tabular-nums ${scoreTier(day.dayMax).bg} ${scoreTier(day.dayMax).fg} rounded-xl px-3 py-1.5`}>
                {day.dayMax}
              </span>
              <div className="mt-1 text-[11px] text-zinc-500">Tages-Maximum</div>
            </div>
          </div>
        )
      )}

      {/* Aktions-Banner: der erste Blick sagt, was zu tun ist (nur Heute) */}
      {isToday && (
        <>
          <p className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
            <TrendIcon className={`h-4 w-4 shrink-0 ${trendCls}`} aria-hidden />
            {n.trendText}
          </p>
          <div
            className={`mt-3 flex items-start gap-3 rounded-2xl border p-4 ${
              act.state === "fahren" ? "border-[#06C167]/40 bg-[#06C167]/10" : "border-white/15 bg-white/[0.04]"
            }`}
          >
            <span
              className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/40 ${
                act.state === "fahren" ? "text-[#06C167]" : "text-zinc-300"
              }`}
              aria-hidden
            >
              {act.state === "fahren" ? (
                <CarFront className="h-5 w-5" />
              ) : act.state === "pause" ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M10 9v6M14 9v6" strokeLinecap="round" />
                </svg>
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0">
              <div className="text-lg font-extrabold leading-tight tracking-tight text-white sm:text-xl">
                {act.headline}
              </div>
              <div className="mt-1 text-sm leading-snug text-zinc-300">{act.detail}</div>
            </div>
          </div>

          {/* Wetter & Kontext-Chips */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip icon={<Thermometer className="h-3.5 w-3.5" />} label={`${n.tempNow}°C`} />
            {n.isRainyNow ? (
              <Chip icon={<CloudRain className="h-3.5 w-3.5" />} label={`Regen ${n.precipNow.toFixed(1)} mm/h`} />
            ) : n.rainNext3h ? (
              <Chip icon={<CloudRain className="h-3.5 w-3.5" />} label="Regen kommt (3h)" />
            ) : (
              <Chip icon={<Droplets className="h-3.5 w-3.5" />} label="Trocken" />
            )}
            <Chip icon={<Sunset className="h-3.5 w-3.5" />} label={`Sonnenuntergang ${formatSunset(n.sunsetToday)}`} />
            {n.nowChips.map((c, i) => (
              <Chip key={i} icon={<ReasonGlyph icon={c.icon} />} label={c.label} />
            ))}
          </div>
        </>
      )}

      {/* Dein Fahrer-Plan + Heute/Morgen-Umschalter */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <CalendarDays className="h-4 w-4 text-[#06C167]" aria-hidden />
          Dein Fahrer-Plan
          <span className="hidden text-xs font-medium text-zinc-500 sm:inline">
            · {dayLabel}: {day?.verdict}
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-1">
          {[0, 1].map((i) => (
            <button
              key={i}
              onClick={() => {
                setDayIdx(i);
                setSelected(null);
              }}
              aria-pressed={dayIdx === i}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                dayIdx === i ? "bg-white text-black" : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {i === 0 ? "Heute" : "Morgen"}
            </button>
          ))}
        </div>
      </div>

      {/* Plan-Zeilen: Beginnen → Pause → Fahren → Feierabend */}
      <div className="mt-2.5">
        <DayPlanRows windows={windows} hours={hours} isToday={isToday} nowFloat={nowFloat} />
      </div>

      {/* Chart-Block */}
      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <TrendingUp className="h-4 w-4 text-[#06C167]" aria-hidden />
          Stunden-Verlauf &amp; Markt-Analyse · {dayLabel}
        </div>
        <div className="mt-2">
          <MarketChart
            hours={hours}
            windows={windows}
            nowFloat={nowFloat}
            selected={selected}
            onSelect={(h) => setSelected((prev) => (prev === h ? null : h))}
          />
        </div>

        {/* Legende – alles mit einem Blick erkennbar */}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#06C167]/25 ring-1 ring-inset ring-[#06C167]/50" aria-hidden />
            stark/gut
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-white/10 ring-1 ring-inset ring-white/15" aria-hidden />
            mäßig/flau
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CloudRain className="h-3 w-3 text-teal-300" aria-hidden />
            Regen = mehr Fahrten
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-0 border-l border-dashed border-[#06C167]" aria-hidden />
            Jetzt
          </span>
          <span className="text-zinc-600">Maus drüber = Sofort-Info · antippen = Details</span>
        </div>
      </div>

      {/* Morgen-Vorschau fürs Schicht-Ende: besser aufhören & morgen starten – antippen schaltet um */}
      {isToday && tomorrow && (
        <button
          onClick={() => {
            setDayIdx(1);
            setSelected(null);
          }}
          className="mt-3 flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[#06C167]/25 bg-[#06C167]/[0.06] px-3 py-2.5 text-left text-sm transition-colors hover:bg-[#06C167]/[0.12]"
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-[#06C167]" aria-hidden />
          <b className="font-extrabold text-white">Morgen ({tomorrowDate}):</b>
          <span className="text-zinc-300">
            {tomorrow.bestWindows.length > 0
              ? `${tomorrow.bestWindows
                  .map((w) => `${fmtH(w.startHour)}–${fmtH(w.endHour)} (${w.score})`)
                  .join(" · ")} – ${tomorrow.verdict}`
              : tomorrow.verdict}
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#06C167]">
            Morgen ansehen
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
          </span>
        </button>
      )}

      {/* Zurück-Griff im Morgen-Tab */}
      {!isToday && (
        <button
          onClick={() => {
            setDayIdx(0);
            setSelected(null);
          }}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 text-sm font-bold text-zinc-200 transition-colors hover:bg-white/[0.08]"
        >
          <Navigation className="h-4 w-4 rotate-180 text-[#06C167]" aria-hidden />
          Zurück zu Heute
        </button>
      )}

      {/* Detail zur angetippten Stunde */}
      {selHour && (
        <div className="glass-soft mt-3 rounded-xl p-3">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
            {fmtH(selHour.hour)}:00 – {fmtH(selHour.hour + 1)}:00 · Index {selHour.score}
            <WeatherGlyph code={selHour.weatherCode} className="h-4 w-4 text-zinc-400" />
            {Math.round(selHour.temp)}°C
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {selHour.reasons.length === 0 && (
              <span className="text-xs text-zinc-500">Keine besonderen Faktoren – nur der Tages-Rhythmus.</span>
            )}
            {selHour.reasons.map((c, i) => (
              <Chip key={i} icon={<ReasonGlyph icon={c.icon} />} label={c.label} />
            ))}
          </div>
        </div>
      )}
    </SpotlightCard>
  );
}
