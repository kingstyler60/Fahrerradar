import { NextResponse } from "next/server";
import { buildDemandResponse, PRESET_CITIES } from "@/lib/aggregator";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city") ?? "Regensburg";
  try {
    const data = await buildDemandResponse(city);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unbekannter Fehler", cities: PRESET_CITIES.map((c) => c.name) },
      { status: 500 }
    );
  }
}
