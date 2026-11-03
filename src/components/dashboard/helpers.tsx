// Gemeinsame Hilfsfunktionen, Farben und Icon-Mappings für das Dashboard.
// Alle Icons sind Lucide-SVGs (statt Emojis) für einen hochwertigen Look.

import {
  Activity,
  Backpack,
  Banknote,
  Car,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Cloudy,
  Disc3,
  Droplets,
  GraduationCap,
  Landmark,
  Music,
  PartyPopper,
  Route,
  Snowflake,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Tent,
  ThermometerSnowflake,
  ThermometerSun,
  TreePalm,
  TreePine,
  Trophy,
  Wind,
  Wine,
  type LucideIcon,
} from "lucide-react";

// ---------- Fahrer-Index-Farben ----------
// Bewusst ruhig & einheitlich: eine dunkle Grün-Skala (edel statt bunt).
// Stark = dunkles Grün mit heller Schrift, darunter neutrale Grautöne.

export function scoreTier(score: number): {
  bg: string;
  fg: string; // Schriftfarbe auf dem Badge-Hintergrund (bg)
  text: string; // Textfarbe für Verdicts/Status
  border: string;
  label: string;
} {
  if (score >= 70)
    return { bg: "bg-[#0A8A4A]", fg: "text-white", text: "text-[#06C167]", border: "border-[#06C167]/40", label: "stark" };
  if (score >= 50)
    return { bg: "bg-[#0B6B3C]", fg: "text-white/95", text: "text-[#3EBE7E]", border: "border-[#0B8A4A]/50", label: "gut" };
  if (score >= 35)
    return { bg: "bg-zinc-700", fg: "text-zinc-100", text: "text-zinc-300", border: "border-zinc-600/60", label: "mäßig" };
  return { bg: "bg-zinc-800", fg: "text-zinc-400", text: "text-zinc-500", border: "border-zinc-700/60", label: "schwach" };
}

export function scoreTextColor(score: number): string {
  return scoreTier(score).text;
}

// ---------- Wetter-Glyphen ----------

export function WeatherGlyph({ code, className = "h-5 w-5" }: { code: number; className?: string }) {
  const props = { className, "aria-hidden": true } as const;
  if (code === 0) return <Sun {...props} />;
  if (code <= 2) return <CloudSun {...props} />;
  if (code === 3) return <Cloud {...props} />;
  if (code === 45 || code === 48) return <CloudFog {...props} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle {...props} />;
  if (code >= 61 && code <= 67) return <CloudRain {...props} />;
  if (code >= 71 && code <= 77) return <CloudSnow {...props} />;
  if (code >= 80 && code <= 82) return <CloudRain {...props} />;
  if (code === 85 || code === 86) return <CloudSnow {...props} />;
  if (code >= 95) return <CloudLightning {...props} />;
  return <Cloudy {...props} />;
}

// ---------- Icon-Mapping für Grund-Chips (Backend liefert Emoji-Schlüssel) ----------

export const REASON_ICONS: Record<string, LucideIcon> = {
  "❄️": Snowflake,
  "⛈️": CloudLightning,
  "🌧️": CloudRain,
  "🌫️": CloudFog,
  "🥶": ThermometerSnowflake,
  "🥵": ThermometerSun,
  "🌬️": Wind,
  "☀️": Sun,
  "🎉": PartyPopper,
  "🥂": Wine,
  "🏝️": TreePalm,
  "🚗": Car,
  "🛣️": Route,
  "🎒": Backpack,
  "💸": Banknote,
  "🎓": GraduationCap,
  "🎆": Sparkles,
  "🎄": TreePine,
  "⚽": Trophy,
  "🎶": Music,
  "🕺": Disc3,
  "🖼️": Landmark,
  "📌": Activity,
  "💧": Droplets,
  "🌇": Sunset,
  "🌅": Sunrise,
  "🎡": Tent,
  "🚕": Car,
};

export function ReasonGlyph({ icon, className = "h-3.5 w-3.5" }: { icon: string; className?: string }) {
  const Icon = REASON_ICONS[icon] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}

// ---------- Kategorie-Metadaten ----------

export const CATEGORY_META: Record<string, { icon: LucideIcon; label: string; cls: string }> = {
  music: { icon: Music, label: "Musik", cls: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  party: { icon: Disc3, label: "Party", cls: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
  sport: { icon: Trophy, label: "Sport", cls: "bg-[#06C167]/15 text-[#06C167] border-[#06C167]/30" },
  fest: { icon: Tent, label: "Fest & Markt", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  kultur: { icon: Landmark, label: "Kultur", cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30" },
  sonst: { icon: Sparkles, label: "Sonstiges", cls: "bg-zinc-600/15 text-zinc-400 border-zinc-600/30" },
};

export function relevanceDots(n: number): string {
  const full = Math.round(n);
  return "●".repeat(Math.max(1, Math.min(3, full))) + "○".repeat(Math.max(0, 3 - Math.max(1, Math.min(3, full))));
}

export function formatSunset(iso: string | null): string {
  if (!iso) return "—";
  // ISO mit Zeitzone (z.B. 2026-11-02T16:45) -> HH:MM
  return iso.slice(11, 16);
}

export function minutesSinceMidnight(hour: number, minute: number): number {
  return hour * 60 + minute;
}
