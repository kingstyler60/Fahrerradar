"use client";

// Spotlight-Karte im React-Bits-Stil: ein grüner Schein folgt der Maus
// über der Glas-Oberfläche. Respektiert prefers-reduced-motion (kein JS nötig,
// das Glühen liegt ohnehin nur als Hover-Effekt an).

import { useCallback, type ReactNode } from "react";

export function SpotlightCard({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  const onMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
  }, []);

  return (
    <Tag onMouseMove={onMove} className={`spotlight-card ${className}`}>
      <div className="relative z-10 h-full">{children}</div>
    </Tag>
  );
}
