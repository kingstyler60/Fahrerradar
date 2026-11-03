// Kuratierte, verifizierte Groß-Events in Regensburg (feste Termine)
// UND automatischer Regensburger Rhythmus-Puls (Schichtwechsel BMW/Krones/Continental,
// Klinik-Entlassungswellen UKR/Barmherzige Brüder, Hbf ICE-Knoten & Altstadt-Sperrstunden).

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
    dateKey: "2026-11-23",
    endKey: "2026-12-23",
    timeText: "So-Mi 10-20, Do-Sa 10-21 Uhr",
    startHour: 15,
    endHour: 21,
    weekdayHours: { 1: [15, 20], 2: [15, 20], 3: [15, 20], 4: [15, 21], 5: [15, 22], 6: [13, 22], 7: [13, 20] },
    venue: "Neupfarrplatz (Altstadt)",
  });
  push({
    title: "Romantischer Weihnachtsmarkt Schloss Thurn und Taxis",
    category: "fest",
    relevance: 3,
    dateKey: "2026-11-20",
    endKey: "2026-12-23",
    timeText: "Mo-Do 15-22, Fr 15-23, Sa 12-23, So 12-21 Uhr",
    startHour: 15,
    endHour: 22,
    weekdayHours: { 1: [15, 22], 2: [15, 22], 3: [15, 22], 4: [15, 22], 5: [15, 23], 6: [12, 23], 7: [12, 21] },
    venue: "Schloss St. Emmeram (Emmeramsplatz)",
  });
  push({
    title: "Adventsmarkt St. Katharinenspital (Spitalgarten)",
    category: "fest",
    relevance: 2.5,
    dateKey: "2026-11-26",
    endKey: "2026-12-23",
    timeText: "Mo-Fr 16-22, Sa 11-22, So 11-21 Uhr",
    startHour: 16,
    endHour: 22,
    weekdayHours: { 1: [16, 22], 2: [16, 22], 3: [16, 22], 4: [16, 22], 5: [16, 22], 6: [11, 22], 7: [11, 21] },
    venue: "St. Katharinenspital (Stadtamhof)",
  });
  push({
    title: "Lucrezia-Markt der Kunsthandwerker (Haidplatz & Kohlenmarkt)",
    category: "fest",
    relevance: 2.5,
    dateKey: "2026-11-27",
    endKey: "2026-12-23",
    timeText: "täglich 11:00 - 20:00 Uhr",
    startHour: 15,
    endHour: 20,
    venue: "Haidplatz / Kohlenmarkt",
  });

  // ===== 2027 (amtlich bzw. offiziell verkündet) =====
  push({
    title: "Regensburger Maidult",
    category: "fest",
    relevance: 3,
    dateKey: "2027-05-14",
    endKey: "2027-05-30",
    timeText: "nachmittags bis 23:30 Uhr",
    startHour: 13,
    endHour: 23,
    venue: "Dultplatz (Am Protzenweiher)",
  });
  push({
    title: "Regensburger Bürgerfest",
    category: "fest",
    relevance: 3,
    dateKey: "2027-06-18",
    endKey: "2027-06-20",
    timeText: "ganztägig bis spät in die Nacht",
    startHour: 12,
    endHour: 24,
    venue: "Altstadt / Stadtamhof",
  });
  push({
    title: "Bayerisches Jazzweekend Regensburg",
    category: "music",
    relevance: 2.5,
    dateKey: "2027-07-08",
    endKey: "2027-07-11",
    timeText: "18:00 - 23:30 Uhr",
    startHour: 18,
    endHour: 23,
    venue: "Altstadt-Plätze",
  });
  push({
    title: "Regensburger Herbstdult",
    category: "fest",
    relevance: 3,
    dateKey: "2027-08-27",
    endKey: "2027-09-12",
    timeText: "nachmittags bis 23:30 Uhr",
    startHour: 13,
    endHour: 23,
    venue: "Dultplatz (Am Protzenweiher)",
  });

  return list;
}

export type LocalPulse = {
  bonus: number;
  chipIcon?: string;
  chipLabel?: string;
  hotspot: string;
  hotspotReason: string;
};

/**
 * Liefert für jede Stunde automatisch den passenden Regensburger Standplatz-Tipp
 * und strukturelle Nachfrage-Impulse (Frühschicht, Klinik-Entlassungen, Werk-Schichtwechsel,
 * Studenten-Nachtleben, Wochenend-Sperrstunde).
 */
export function getRegensburgPulse(
  hour: number,
  weekday: number, // 1=Mo..7=So
  isHoliday: boolean,
  eveBeforeHoliday: boolean,
  uniInLecture: boolean
): LocalPulse {
  const isWorkday = weekday >= 1 && weekday <= 5 && !isHoliday;

  // 1) Wochenend- & Feiertags-Nachtschicht: Sperrstunden-Abreisewelle (00:00 - 05:00 Uhr)
  const isWeekendEarlyMorning = weekday === 6 || weekday === 7 || isHoliday;
  if (isWeekendEarlyMorning && hour >= 0 && hour <= 5) {
    if (hour >= 1 && hour <= 4) {
      return {
        bonus: 14,
        chipIcon: "🕺",
        chipLabel: "Sperrstunden-Welle (Clubs & Altstadt)",
        hotspot: "Petersweg / Dachauplatz / Bismarckplatz / Alte Mälzerei",
        hotspotReason: "Clubs & Bars schließen – höchste Rückfahrt-Dichte ins Umland",
      };
    }
    return {
      bonus: 8,
      chipIcon: "🕺",
      chipLabel: "Späte Altstadt-Heimfahrer & Frühschicht",
      hotspot: "Hauptbahnhof / Arnulfsplatz / Dachauplatz",
      hotspotReason: "Letzte Nachtschwärmer + erste Bahnpendler am Hbf",
    };
  }

  // 2) Studenten-Nacht unter der Woche (Di->Mi, Mi->Do, Do->Fr)
  const isStudentLateNight =
    (weekday === 2 && hour >= 22) ||
    (weekday === 3 && (hour <= 2 || hour >= 22)) ||
    (weekday === 4 && (hour <= 2 || hour >= 21)) ||
    (weekday === 5 && hour <= 3);

  if (isStudentLateNight) {
    if (uniInLecture) {
      return {
        bonus: 10,
        chipIcon: "🎓",
        chipLabel: "Uni-Vorlesungszeit: Studenten-Nacht",
        hotspot: "Altstadt-Rand (Arnulfsplatz / Bismarckplatz / Petersweg)",
        hotspotReason: "32.000 Studierende in der Vorlesungszeit – Kneipen & Clubs aktiv",
      };
    }
    return {
      bonus: -6,
      hotspot: "Hauptbahnhof / Albertstraße",
      hotspotReason: "Semesterferien – unter der Woche nachts deutlich ruhiger",
    };
  }

  // 3) Früh-Zubringer & Werk-Frühschicht (04:00 - 05:59 Uhr an Werktagen)
  if (isWorkday && (hour === 4 || hour === 5)) {
    return {
      bonus: 14,
      chipIcon: "🚕",
      chipLabel: "Früh-Zubringer & Werk-Frühschicht",
      hotspot: "Hbf Süd (Arcaden) / Prüfening / Neutraubling",
      hotspotReason: "Erste ICE/Airport-Zubringer & Schichtbeginn BMW / Krones / Continental",
    };
  }

  // 4) Morgen-Pendler & ICE-Knoten (06:00 - 08:59 Uhr an Werktagen)
  if (isWorkday && hour >= 6 && hour <= 8) {
    return {
      bonus: uniInLecture ? 6 : 2,
      chipIcon: "🚗",
      chipLabel: "Berufsverkehr & Hbf ICE-Welle",
      hotspot: "Hauptbahnhof (Albertstraße) / Uni / Gewerbepark",
      hotspotReason: "ICE-Ankünfte (:15/:45) + Geschäftsreisende zu Siemens/Vitesco/Uni",
    };
  }

  // 5) Klinik-Entlassungswelle & Ambulanzen (09:00 - 11:59 Uhr an Werktagen)
  if (isWorkday && hour >= 9 && hour <= 11) {
    return {
      bonus: 8,
      chipIcon: "📌",
      chipLabel: "Klinik-Entlassungen & Ambulanzen",
      hotspot: "Uniklinikum (UKR) / Barmherzige Brüder / St. Josef",
      hotspotReason: "Tägliche Entlassungswelle & Facharzt-Ambulanzen (09:00–11:30 Uhr)",
    };
  }

  // 6) Werk-Schichtwechsel (14:00 - 14:59 Uhr an Werktagen)
  if (isWorkday && hour === 14) {
    return {
      bonus: 9,
      chipIcon: "🚗",
      chipLabel: "Schichtwechsel Werke (BMW / Krones)",
      hotspot: "BMW Werk Tor 2 (Harting) / Guerickestraße / Hbf",
      hotspotReason: "Früh-/Spätschichtwechsel Industrie & Nachmittags-Züge am Hbf",
    };
  }

  // 7) Feierabend-Pendler & Altstadt-Abend (16:00 - 19:59 Uhr)
  if (hour >= 16 && hour <= 19) {
    return {
      bonus: 0,
      hotspot: isWorkday
        ? "Hauptbahnhof / Donau-Einkaufszentrum (DEZ) / Altstadt"
        : "Hauptbahnhof / Regensburg Arcaden / Dachauplatz",
      hotspotReason: isWorkday
        ? "Feierabend-Rückreise am Hbf & Abendgastronomie in der Altstadt"
        : "Wochenend-Einkaufsverkehr & Anreise in die Altstadt-Gastronomie",
    };
  }

  // 8) Freitag-/Samstagabend & Vorabend von Feiertagen (20:00 - 23:59 Uhr)
  if ((weekday === 5 || weekday === 6 || eveBeforeHoliday) && hour >= 20) {
    return {
      bonus: 6,
      hotspot: "Altstadt-Übergabepunkte (Petersweg / Dachauplatz / Arnulfsplatz)",
      hotspotReason: "Starker Ausgeh-Abend – Übergabepunkte vor den Altstadt-Pollern anfahren",
    };
  }

  // Standard-Fallback
  return {
    bonus: 0,
    hotspot: "Hauptbahnhof (Albertstraße) / Dachauplatz",
    hotspotReason: "Zentraler Knotenpunkt für Bahnreisende & Innenstadt-Fahrten",
  };
}
