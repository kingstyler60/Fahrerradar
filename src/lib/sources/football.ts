// Heimspiele von Jahn Regensburg über OpenLigaDB (kostenlos, ohne Key).
// Sucht die 3. Liga (bl3) und – falls Jahn aufgestiegen/abgestiegen ist –
// automatisch auch die 2. Bundesliga (bl2).

import type { FootballMatch, SourceStatus } from "./types";
import { cacheGet, cacheSet, cacheStale } from "./cache";
import { berlinParts } from "./time";

const TTL = 6 * 3600 * 1000; // 6 h
const CLUB = "Regensburg";

async function fetchTimeout(url: string, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "FahrerRadar/1.0", Accept: "application/json" },
      cache: "no-store",
    });
  } finally {
    clearTimeout(t);
  }
}

type OlTeam = { teamName: string };
type OlMatch = {
  matchDateTimeUTC: string | null;
  leagueName: string;
  leagueShortcut: string;
  team1: OlTeam;
  team2: OlTeam;
  location: { locationStadium?: string } | null;
};

function seasonForNow(): number {
  // Spielzeit 2026/27 => "2026" (ab Juli eines Jahres)
  const { dateKey } = berlinParts(new Date());
  const year = parseInt(dateKey.slice(0, 4), 10);
  const month = parseInt(dateKey.slice(5, 7), 10);
  return month >= 7 ? year : year - 1;
}

export async function getFootball(): Promise<{
  matches: FootballMatch[];
  status: SourceStatus;
}> {
  const cached = cacheGet<FootballMatch[]>("football:jahn");
  if (cached) {
    return {
      matches: cached,
      status: { key: "football", label: "Jahn-Heimspiele (OpenLigaDB)", ok: true, detail: "Cache", fetchedAt: null },
    };
  }

  const season = seasonForNow();
  const shortcuts = ["bl3", "bl2"];
  const matches: FootballMatch[] = [];
  let used = "";

  for (const sc of shortcuts) {
    try {
      const res = await fetchTimeout(`https://api.openligadb.de/getmatchdata/${sc}/${season}`);
      if (!res.ok) continue;
      const list = (await res.json()) as OlMatch[];
      if (!Array.isArray(list)) continue;
      for (const m of list) {
        const isJahnHome = (m.team1?.teamName ?? "").includes(CLUB);
        if (!isJahnHome || !m.matchDateTimeUTC) continue;
        const dt = new Date(m.matchDateTimeUTC);
        const p = berlinParts(dt);
        matches.push({
          dateKey: p.dateKey,
          hour: p.hour,
          home: m.team1.teamName,
          away: m.team2.teamName,
          league: m.leagueName,
          competition: sc === "bl3" ? "3. Liga" : "2. Bundesliga",
        });
      }
      if (matches.length > 0) {
        used = sc === "bl3" ? `3. Liga, Saison ${season}/${(season + 1) % 100}` : `2. Bundesliga, Saison ${season}/${(season + 1) % 100}`;
        break;
      }
    } catch {
      // nächste Liga probieren
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => (a.dateKey + String(a.hour)).localeCompare(b.dateKey + String(b.hour)));
    cacheSet("football:jahn", matches, TTL);
    return {
      matches,
      status: { key: "football", label: "Jahn-Heimspiele (OpenLigaDB)", ok: true, detail: `Live · ${used} · ${matches.length} Spiele`, fetchedAt: new Date().toISOString() },
    };
  }

  const stale = cacheStale<FootballMatch[]>("football:jahn");
  if (stale) {
    return {
      matches: stale,
      status: { key: "football", label: "Jahn-Heimspiele (OpenLigaDB)", ok: true, detail: "Älterer Cache (Quelle gestört)", fetchedAt: null },
    };
  }
  return {
    matches: [],
    status: { key: "football", label: "Jahn-Heimspiele (OpenLigaDB)", ok: false, detail: "Nicht erreichbar", fetchedAt: null },
  };
}
