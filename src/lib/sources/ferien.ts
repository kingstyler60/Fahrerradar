// Amtliche Ferienordnung Bayern (Bekanntmachung des Bayer. Staatsministeriums
// für Unterricht und Kultus v. 07.12.2022, BayMBl. Nr. 747 – Schuljahre 2024/25 bis 2029/30)
// SOWIE offizielle Vorlesungszeiten der Universität Regensburg & OTH Regensburg (~32.000 Studierende).

import type { FerienInfo } from "./types";

const R = (name: string, startKey: string, endKey: string): FerienInfo => ({
  name,
  startKey,
  endKey,
});

export const FERIEN_BAYERN: FerienInfo[] = [
  // Schuljahr 2025/2026
  R("Sommerferien", "2025-08-01", "2025-09-15"),
  R("Allerheiligenferien", "2025-11-03", "2025-11-07"),
  R("Weihnachtsferien", "2025-12-22", "2026-01-05"),
  R("Frühjahrsferien", "2026-02-16", "2026-02-20"),
  R("Osterferien", "2026-03-30", "2026-04-10"),
  R("Pfingstferien", "2026-05-26", "2026-06-05"),
  // Schuljahr 2026/2027
  R("Sommerferien", "2026-08-03", "2026-09-14"),
  R("Allerheiligenferien", "2026-11-02", "2026-11-06"),
  R("Weihnachtsferien", "2026-12-24", "2027-01-08"),
  R("Frühjahrsferien", "2027-02-08", "2027-02-12"),
  R("Osterferien", "2027-03-22", "2027-04-02"),
  R("Pfingstferien", "2027-05-18", "2027-05-28"),
  // Schuljahr 2027/2028
  R("Sommerferien", "2027-08-02", "2027-09-13"),
  R("Allerheiligenferien", "2027-11-02", "2027-11-05"),
  R("Weihnachtsferien", "2027-12-24", "2028-01-07"),
];

export function ferienFor(dateKey: string): FerienInfo | null {
  for (const f of FERIEN_BAYERN) {
    if (dateKey >= f.startKey && dateKey <= f.endKey) return f;
  }
  return null;
}

// Offizielle Vorlesungszeiten Uni Regensburg & OTH Regensburg
export type UniStatus = {
  inLecture: boolean;
  label: string;
  shortLabel: string;
};

const UNI_LECTURE_PERIODS: { name: string; startKey: string; endKey: string }[] = [
  { name: "Sommersemester 2026 (Vorlesungszeit)", startKey: "2026-04-13", endKey: "2026-07-17" },
  { name: "Wintersemester 2026/27 (Vorlesungszeit)", startKey: "2026-10-12", endKey: "2027-02-05" },
  { name: "Sommersemester 2027 (Vorlesungszeit)", startKey: "2027-04-12", endKey: "2027-07-16" },
  { name: "Wintersemester 2027/28 (Vorlesungszeit)", startKey: "2027-10-18", endKey: "2028-02-11" },
];

export function uniStatusFor(dateKey: string): UniStatus {
  // Weihnachtsruhe der Hochschulen (24.12. - 06.01.)
  const mmdd = dateKey.slice(5, 10);
  if (mmdd >= "12-24" || mmdd <= "01-06") {
    return {
      inLecture: false,
      label: "Uni/OTH: Vorlesungsfrei (Weihnachtspause)",
      shortLabel: "Uni-Pause",
    };
  }
  for (const p of UNI_LECTURE_PERIODS) {
    if (dateKey >= p.startKey && dateKey <= p.endKey) {
      return {
        inLecture: true,
        label: `Uni & OTH aktiv: ${p.name}`,
        shortLabel: "Uni-Vorlesungszeit (32.000 Stud.)",
      };
    }
  }
  return {
    inLecture: false,
    label: "Uni & OTH: Semesterferien (vorlesungsfreie Zeit)",
    shortLabel: "Semesterferien (Uni/OTH)",
  };
}
