"use client";

// Optionaler Standort: nur im Arbeitsspeicher der Sitzung, keine Speicherung,
// kein Versand, keine Hintergrund-Aktualisierung.

import { useCallback, useEffect, useState } from "react";
import type { LatLon } from "@/lib/geo";

export type LocationStatus = "idle" | "loading" | "active" | "error";

const OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 60000,
};

const UNAVAILABLE = "Standort nicht verfügbar – Entfernungen bleiben aus.";

export function useLocation() {
  const [coords, setCoords] = useState<LatLon | null>(null);
  const [status, setStatus] = useState<LocationStatus>("idle");

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lon: position.coords.longitude });
        setStatus("active");
      },
      () => setStatus("error"),
      OPTIONS
    );
  }, []);

  // Nur wenn die Berechtigung bereits erteilt ist, ohne Klick nutzen (kein Prompt).
  useEffect(() => {
    let cancelled = false;
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;

    navigator.permissions
      .query({ name: "geolocation" } as PermissionDescriptor)
      .then((result) => {
        if (!cancelled && result.state === "granted") request();
      })
      .catch(() => {
        // Permissions API nicht verfügbar: Standort bleibt ungenutzt.
      });

    return () => {
      cancelled = true;
    };
  }, [request]);

  return {
    coords,
    status,
    request,
    hint: status === "error" ? UNAVAILABLE : null,
  };
}
