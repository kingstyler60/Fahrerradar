// Standort-Hilfen: Luftlinie (Haversine), geschätzte Fahrzeit und die Standplätze,
// die im Code bereits als Hotspot-Text vorkommen. Kein Speichern, kein Versand.

export type LatLon = { lat: number; lon: number };

type Spot = LatLon & { name: string };

export type HotspotDistance = Spot & { km: number; minutes: number };

// Näherungswerte ohne amtliche Quelle – bitte auf Google Maps prüfen.
const HOTSPOTS: Spot[] = [
  { name: "Hauptbahnhof", lat: 49.0116, lon: 12.0993 }, // KOORDINATEN PRÜFEN
  { name: "Arcaden", lat: 49.0105, lon: 12.0987 }, // KOORDINATEN PRÜFEN
  { name: "Altstadt", lat: 49.0192, lon: 12.096 }, // KOORDINATEN PRÜFEN
  { name: "Arnulfsplatz", lat: 49.0198, lon: 12.0935 }, // KOORDINATEN PRÜFEN
  { name: "Bismarckplatz", lat: 49.019, lon: 12.0977 }, // KOORDINATEN PRÜFEN
  { name: "Dachauplatz", lat: 49.0172, lon: 12.0953 }, // KOORDINATEN PRÜFEN
  { name: "Petersweg", lat: 49.0203, lon: 12.094 }, // KOORDINATEN PRÜFEN
  { name: "Alte Mälzerei", lat: 49.0146, lon: 12.1119 }, // KOORDINATEN PRÜFEN
  { name: "Uni", lat: 48.999, lon: 12.0945 }, // KOORDINATEN PRÜFEN
  { name: "Uniklinikum", lat: 48.9975, lon: 12.089 }, // KOORDINATEN PRÜFEN
  { name: "Donau-Einkaufszentrum", lat: 49.0168, lon: 12.1155 }, // KOORDINATEN PRÜFEN
  { name: "Jahnstadion", lat: 49.01, lon: 12.125 }, // KOORDINATEN PRÜFEN
  { name: "BMW", lat: 49.0055, lon: 12.135 }, // KOORDINATEN PRÜFEN
  { name: "Prüfening", lat: 49.0126, lon: 12.0577 }, // KOORDINATEN PRÜFEN
  { name: "Neutraubling", lat: 48.9333, lon: 12.1833 }, // KOORDINATEN PRÜFEN
];

export function haversineKm(from: LatLon, to: LatLon): number {
  const R = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Luftlinie × 1,3 bei 25 km/h, aufgerundet auf volle Minuten.
export function driveMinutes(km: number): number {
  return Math.max(1, Math.ceil(((km * 1.3) / 25) * 60));
}

export function formatDistance(km: number): string {
  const meters = Math.round((km * 1000) / 10) * 10;
  if (meters < 1000) return `${Math.max(10, meters)} m`;
  const rounded = Math.round(km * 10) / 10;
  if (rounded < 10) return `${rounded.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}

// Längster passender Name gewinnt, damit z. B. "Uniklinikum" nicht als "Uni" gilt.
function matchSpot(text: string): Spot | null {
  const haystack = text.toLowerCase();
  let best: Spot | null = null;
  for (const spot of HOTSPOTS) {
    if (!haystack.includes(spot.name.toLowerCase())) continue;
    if (!best || spot.name.length > best.name.length) best = spot;
  }
  return best;
}

export function nearestHotspot(from: LatLon): HotspotDistance | null {
  let best: HotspotDistance | null = null;
  for (const spot of HOTSPOTS) {
    const km = haversineKm(from, spot);
    if (!best || km < best.km) best = { ...spot, km, minutes: driveMinutes(km) };
  }
  return best;
}

// Hotspot-Texte sehen so aus: "Hauptbahnhof (Albertstraße) / Uni / Gewerbepark".
// Geliefert wird der erste aufgelöste Standplatz – die Empfehlung selbst bleibt unverändert.
export function resolveHotspot(hotspot: string, from: LatLon): HotspotDistance | null {
  for (const part of hotspot.split("/")) {
    const spot = matchSpot(part);
    if (spot) {
      const km = haversineKm(from, spot);
      return { ...spot, km, minutes: driveMinutes(km) };
    }
  }
  return null;
}
