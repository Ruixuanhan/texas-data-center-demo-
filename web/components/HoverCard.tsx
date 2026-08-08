"use client";
// Hover pop-up — replaces the wire rail as the ambient information surface.
import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { HoverInfo } from "./MapCanvas";
import { heatHex } from "@/lib/heat";
import { STAGE_LABELS, STAGE_LADDER } from "@/lib/types";
import { stageHex } from "@/lib/theme";

export function HoverCard({ info }: { info: HoverInfo | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (info) {
      const flip = info.x > window.innerWidth - 320;
      const rise = info.y > window.innerHeight - 220;
      gsap.set(el, { x: info.x + (flip ? -14 : 14), y: info.y + (rise ? -12 : 12), xPercent: flip ? -100 : 0, yPercent: rise ? -100 : 0 });
      if (info.project.id !== lastId.current) {
        lastId.current = info.project.id;
        gsap.fromTo(el, { autoAlpha: 0, scale: 0.92, transformOrigin: `${flip ? "right" : "left"} ${rise ? "bottom" : "top"}` },
          { autoAlpha: 1, scale: 1, duration: 0.28, ease: "back.out(2.2)" });
        gsap.fromTo(el.querySelectorAll("[data-hc]"), { y: 6, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.24, stagger: 0.035, delay: 0.05, ease: "power2.out" });
      } else {
        gsap.to(el, { autoAlpha: 1, duration: 0.12 });
      }
    } else {
      lastId.current = null;
      gsap.to(el, { autoAlpha: 0, scale: 0.96, duration: 0.16, ease: "power2.in" });
    }
  }, [info]);

  const p = info?.project;
  const onLadder = p ? STAGE_LADDER.indexOf(p.current_stage) : -1;

  return (
    <div ref={ref} className="pointer-events-none fixed left-0 top-0 z-30 w-[290px] opacity-0" aria-hidden={!info}>
      {p && (
        <div className="border border-[var(--border-subtle)] bg-[var(--surface-overlay)] px-4 py-3.5 shadow-[0_14px_40px_rgba(8,16,24,0.45)] backdrop-blur-md">
          <div data-hc className="mb-1 flex items-baseline justify-between gap-3">
            <span className="mono text-[8.5px] uppercase tracking-[0.24em] text-[var(--text-faint)]">
              {p.project_type === "gas_to_power" ? "gas-to-power" : "data center"}
            </span>
            <span style={{ fontFamily: "var(--font-display), Georgia, serif", color: heatHex(info!.heat) }} className="text-[17px] leading-none">
              {info!.heat.toFixed(2)}
            </span>
          </div>
          <p data-hc style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 600 }} className="text-[16px] leading-snug text-[var(--text)]">
            {p.name}
          </p>
          <p data-hc className="mono mt-0.5 text-[9.5px] uppercase tracking-[0.16em] text-[var(--text-dim)]">
            {[p.developer, p.county && `${p.county} Co`, p.capacity_mw ? `${Math.round(p.capacity_mw)} MW` : null].filter(Boolean).join(" · ")}
          </p>
          <div data-hc className="mt-2.5 flex items-center gap-1">
            {STAGE_LADDER.map((s, i) => (
              <span key={s} className="h-[3px] flex-1 rounded-full"
                style={{ background: i <= onLadder ? stageHex(s) : "var(--line)", boxShadow: i === onLadder ? `0 0 6px ${stageHex(s)}` : undefined }} />
            ))}
          </div>
          <p data-hc className="mono mt-1.5 text-[9.5px] text-[var(--text-dim)]">
            {STAGE_LABELS[p.current_stage]}{p.stage_confidence != null ? ` · conf ${p.stage_confidence.toFixed(2)}` : ""}
          </p>
          {p.headline && <p data-hc className="mt-2 border-t border-[var(--line)] pt-2 text-[11.5px] italic leading-snug text-[var(--text-dim)]">{p.headline}</p>}
          <p data-hc className="mono mt-2 text-[8.5px] uppercase tracking-[0.22em] text-[var(--text-faint)]">click to open dossier</p>
        </div>
      )}
    </div>
  );
}
