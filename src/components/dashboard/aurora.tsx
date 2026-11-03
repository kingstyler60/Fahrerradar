"use client";

// Aurora-Hintergrund: große Farbwolken ("Hintergrundbeleuchtung"), die langsam
// driften und beim Scrollen leicht mitziehen (GSAP ScrollTrigger).
// Respektiert prefers-reduced-motion.

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export function Aurora() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const blobs = gsap.utils.toArray<HTMLElement>(".js-parallax-blob");
      for (const [i, b] of blobs.entries()) {
        gsap.to(b, {
          yPercent: i % 2 === 0 ? 18 : -14,
          ease: "none",
          scrollTrigger: { trigger: document.body, start: "top top", end: "max", scrub: 1.2 + i * 0.4 },
        });
      }
    }, ref);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Farbwolken */}
      <div
        className="aurora-blob aurora-a js-parallax-blob left-[-14%] top-[-14%] h-[58vmax] w-[58vmax]"
        style={{ background: "radial-gradient(circle at 32% 32%, rgba(6,193,103,0.38), transparent 62%)" }}
      />
      <div
        className="aurora-blob aurora-b js-parallax-blob right-[-18%] top-[4%] h-[52vmax] w-[52vmax]"
        style={{ background: "radial-gradient(circle at 60% 40%, rgba(34,211,238,0.20), transparent 62%)" }}
      />
      <div
        className="aurora-blob aurora-c js-parallax-blob bottom-[-24%] left-[14%] h-[54vmax] w-[54vmax]"
        style={{ background: "radial-gradient(circle at 50% 50%, rgba(16,185,129,0.24), transparent 62%)" }}
      />
      <div
        className="aurora-blob aurora-b bottom-[-12%] right-[6%] h-[40vmax] w-[40vmax]"
        style={{ background: "radial-gradient(circle at 50% 50%, rgba(139,92,246,0.17), transparent 62%)" }}
      />
      {/* Feines Korn + dunkle Vignette für Tiefe */}
      <div className="noise-overlay" />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(130% 100% at 50% 0%, transparent 46%, rgba(0,0,0,0.38) 100%)" }}
      />
    </div>
  );
}
