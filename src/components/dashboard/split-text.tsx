"use client";

// Split-Text im React-Bits-Stil: Headline wird in Wörter zerlegt und
// mit GSAP gestaffelt eingeblendet (sanftes Aufsteigen + Unschärfe).
// Respektiert prefers-reduced-motion.

import { useEffect, useRef } from "react";
import gsap from "gsap";

export function SplitText({
  text,
  className = "",
  delay = 0,
}: {
  text: string;
  className?: string; // z. B. "text-gradient" – landet auf jedem Wort (background-clip braucht dieselbe Ebene wie der Filter)
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const words = el.querySelectorAll<HTMLElement>("[data-word]");
    if (!words.length) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(words, { opacity: 1, y: 0, filter: "blur(0px)" });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        words,
        { opacity: 0, y: 22, filter: "blur(8px)" },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.85,
          delay,
          ease: "power3.out",
          stagger: 0.09,
        }
      );
    });
    return () => ctx.revert();
  }, [delay]);

  return (
    <span ref={ref} className="inline-block" aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom" aria-hidden>
          <span data-word className={`inline-block will-change-transform ${className}`}>
            {w}
            {i < text.split(" ").length - 1 ? "\u00A0" : ""}
          </span>
        </span>
      ))}
    </span>
  );
}
