// Gemeinsame Hilfsfunktionen, Farben und Icon-Mappings für das Dashboard.
// Eine Akzentfarbe (Grün), sonst neutrale Grautöne.

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

// ---------- Fahrer-Index ----------

export function scoreTier(score: number): { bg: string; fg: string; text: string; label: string } {
  if (score >= 70) return { bg: "bg-[#0A8A4A]", fg: "text-white", text: "text-[#06C167]", label: "stark" };
  if (score >= 50) return { bg: "bg-[#0B6B3C]", fg: "text-white", text: "text-[#3EBE7E]", label: "gut" };
  if (score >= 35) return { bg: "bg-zinc-700", fg: "text-zinc-100", text: "text-zinc-200", label: "mäßig" };
  return { bg: "bg-zinc-800", fg: "text-zinc-300", text: "text-zinc-300", label: "schwach" };
}

// ---------- Wetter-Glyphen ----------

export function WeatherGlyph({ code, className = "h-4 w-4" }: { code: number; className?: string }) {
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

const REASON_ICONS: Record<string, LucideIcon> = {
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

// ---------- Veranstaltungs-Kategorien ----------

export const CATEGORY_ICON: Record<string, LucideIcon> = {
  music: Music,
  party: Disc3,
  sport: Trophy,
  fest: Tent,
  kultur: Landmark,
  sonst: Sparkles,
};

export function formatSunset(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(11, 16);
}
