// Kuratierte, verifizierte Groß-Events in Regensburg (feste Termine).
// Quellen (Stand 02.11.2026):
//  - regensburg.de (Dult, Bürgerfest): offizielle Termine
//  - Christkindlmarkt Neupfarrplatz: ca. 20.11.-23.12.2026 (Mo-Do 15-22, Fr-Sa bis 23, So bis 21)
//  - Adventsmarkt St. Katharinenspital (Spitalgarten): 11.-23.12.2026 (stadtmaus.de)
// Nur Termine, die öffentlich angekündigt waren – keine Schätzungen.

import type { CityEvent } from "./types";

export function recurringEvents(): CityEvent[] {
  const list: CityEvent[] = [];

  const push = (e: Omit<CityEvent, "id" | "source" | "url"> & { url?: string }) => {
    list.push({ ...e, id: `cur:${e.title}|${e.dateKey}`, source: "kuratiert", url: e.url ?? null });
  };

  // ===== 2026 =====
  push({
    title: "Christkindlmarkt am Neupfarrplatz",
    category: "fest",
    relevance: 3,
    dateKey: "2026-11-20",
    endKey: "2026-12-23",
    timeText: "ca. 15:00 - 22:00 Uhr",
    startHour: 15,
    endHour: 22,
    weekdayHours: { 1: [15, 22], 2: [15, 22], 3: [15, 22], 4: [15, 22], 5: [15, 23], 6: [15, 23], 7: [15, 21] },
    venue: "Neupfarrplatz",
  });
  push({
    title: "Adventsmarkt St. Katharinenspital (Spitalgarten)",
    category: "fest",
    relevance: 2.5,
    dateKey: "2026-12-11",
    endKey: "2026-12-23",
    timeText: "Mo-Fr 16-22, Sa 11-22, So 11-21 Uhr",
    startHour: 16,
    endHour: 22,
    weekdayHours: { 1: [16, 22], 2: [16, 22], 3: [16, 22], 4: [16, 22], 5: [16, 22], 6: [11, 22], 7: [11, 21] },
    venue: "St. Katharinenspital",
  });

  // ===== 2027 (amtlich bzw. offiziell verkündet) =====
  push({
    title: "Regensburger Maidult",
    category: "fest",
    relevance: 3,
    dateKey: "2027-05-14",
    endKey: "2027-05-30",
    timeText: "nachmittags bis spät",
    startHour: 13,
    endHour: 23,
    venue: "Dultplatz",
  });
  push({
    title: "Regensburger Herbstdult",
    category: "fest",
    relevance: 3,
    dateKey: "2027-08-27",
    endKey: "2027-09-12",
    timeText: "nachmittags bis spät",
    startHour: 13,
    endHour: 23,
    venue: "Dultplatz",
  });
  push({
    title: "Regensburger Bürgerfest",
    category: "fest",
    relevance: 3,
    dateKey: "2027-06-18",
    endKey: "2027-06-20",
    timeText: "nachmittags bis Abends",
    startHour: 12,
    endHour: 23,
    venue: "Altstadt / Stadtamhof",
  });

  return list;
}
