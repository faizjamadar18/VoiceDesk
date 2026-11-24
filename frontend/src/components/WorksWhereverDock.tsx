/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

interface AppItem {
  name: string;
  logo: string;
  icon: string;
  hasSep?: boolean;
}

const APPS: AppItem[] = [
  { name: "Slack", logo: "slack", icon: "/logos/color/apps/slack-tile.webp" },
  { name: "Gmail", logo: "gmail", icon: "/logos/color/apps/gmail-tile.webp" },
  { name: "Notion", logo: "notion", icon: "/logos/color/apps/notion-tile.webp" },
  { name: "Cursor", logo: "cursor", icon: "/logos/color/apps/cursor-tile.webp" },
  { name: "VS Code", logo: "vscode", icon: "/logos/color/apps/vscode-tile.webp" },
  { name: "Claude", logo: "claude", icon: "/logos/color/apps/claude-tile.webp" },
  { name: "ChatGPT", logo: "chatgpt", icon: "/logos/color/apps/chatgpt-tile.webp" },
  { name: "Zoom", logo: "zoom", icon: "/logos/color/meetings/zoom-tile.webp", hasSep: true },
  { name: "Microsoft Teams", logo: "teams", icon: "/logos/color/meetings/teams-tile.webp" },
  { name: "Google Meet", logo: "meet", icon: "/logos/color/meetings/google-meet-tile.webp" },
  { name: "Word", logo: "word", icon: "/logos/color/apps/word-tile.webp" },
  { name: "Outlook", logo: "outlook", icon: "/logos/color/apps/outlook-tile.webp" },
  { name: "Google Docs", logo: "docs", icon: "/logos/color/apps/google-docs-tile.webp" },
  { name: "Mail", logo: "mail", icon: "/logos/color/apps/apple-mail-tile.webp" },
  { name: "Obsidian", logo: "obsidian", icon: "/logos/color/apps/obsidian-tile.webp" },
  { name: "Linear", logo: "linear", icon: "/logos/color/apps/linear-tile.webp" },
  { name: "Figma", logo: "figma", icon: "/logos/color/apps/figma-tile.webp" },
  { name: "Discord", logo: "discord", icon: "/logos/color/meetings/discord-tile.webp" },
  { name: "WhatsApp", logo: "whatsapp", icon: "/logos/color/apps/whatsapp-tile.webp" },
];

const QUOTES: Record<string, string> = {
  slack: "Running five minutes late, start without me.",
  gmail: "Thanks, Sam. Tuesday at ten works for me.",
  notion: "Ship the onboarding checklist before Friday.",
  cursor: "Add a retry with backoff to the upload call.",
  claude: "Turn these notes into a short project update.",
  chatgpt: "Explain this error like I am new to Rust.",
  vscode: "Write a test for the empty cart case.",
  zoom: "Can everyone see my screen now?",
  teams: "I will send the deck right after this call.",
  meet: "Dropping the doc link in the chat now.",
  word: "The pilot cut onboarding time by a third.",
  outlook: "Moving our sync to Thursday at two.",
  docs: "Next steps: confirm the budget, then book the venue.",
  mail: "The signed forms are attached. Tell me if anything is missing.",
  obsidian: "Idea: a weekly review on Fridays, thirty minutes, no meetings.",
  linear: "Search results flicker when the filter changes.",
  figma: "Can we try the header with more space above it?",
  discord: "Starting the playtest in ten, jump into voice.",
  whatsapp: "On my way. Grab us a table by the window.",
};

const RUNNING_APPS = new Set([
  "slack",
  "gmail",
  "notion",
  "cursor",
  "claude",
  "chatgpt",
  "zoom",
  "mail",
  "whatsapp",
]);

// Set of app indices for auto-rotation across responsive viewports
const AUTO_ROTATE_INDICES = [0, 1, 2, 3, 5, 6]; // Slack, Gmail, Notion, Cursor, Claude, ChatGPT

/**
 * Detects the effective CSS zoom factor applied to an element or root document,
 * supporting `currentCSSZoom` properties as well as custom `--page-zoom` CSS variables.
 *
 * @param el - The target HTMLElement to evaluate, or null to inspect document root.
 * @returns Numeric zoom factor (defaults to 1).
 */
function getZoom(el: HTMLElement | null): number {
  if (typeof window === "undefined") return 1;
  const currentZoom = (el ?? document.documentElement) as HTMLElement & { currentCSSZoom?: number };
  if (typeof currentZoom.currentCSSZoom === "number" && currentZoom.currentCSSZoom > 0) {
    return currentZoom.currentCSSZoom;
  }
  const pageZoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--page-zoom"));
  return pageZoom > 0 ? pageZoom : 1;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}

export default function WorksWhereverDock() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const glassRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  const reducedMotion = usePrefersReducedMotion();

  const [rotateIndex, setRotateIndex] = useState(0);
  const [isInView, setIsInView] = useState(false);
  const [canMagnify, setCanMagnify] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [clickedIndex, setClickedIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const autoIndex = AUTO_ROTATE_INDICES.length ? AUTO_ROTATE_INDICES[rotateIndex % AUTO_ROTATE_INDICES.length] : 0;
  const activeIndex = hoveredIndex ?? clickedIndex ?? autoIndex;
  const activeApp = APPS[activeIndex] ?? APPS[0];
  const activeQuote = QUOTES[activeApp.logo] ?? "";
  const currentTipIdx = hoveredIndex ?? clickedIndex ?? activeIndex;
  const currentTipApp = APPS[currentTipIdx] ?? APPS[0];

  const stateRef = useRef({
    at: activeIndex,
    px: null as number | null,
    magnify: false,
    reduced: reducedMotion,
    tip: currentTipIdx,
  });

  useEffect(() => {
    stateRef.current.at = activeIndex;
    stateRef.current.magnify = canMagnify && !reducedMotion;
    stateRef.current.reduced = reducedMotion;
    stateRef.current.tip = currentTipIdx;
  }, [activeIndex, canMagnify, reducedMotion, currentTipIdx]);

  const geomRef = useRef<{
    c: number[];
    shown: boolean[];
    tile: number;
    pad: number;
  }>({
    c: [],
    shown: [],
    tile: 48,
    pad: 9,
  });

  const physRef = useRef<{
    s: number[];
    v: number[];
    px: number;
    pv: number;
    init: boolean;
  }>({
    s: [],
    v: [],
    px: 0,
    pv: 0,
    init: false,
  });

  const rafIdRef = useRef(0);
  const lastTimeRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const tickRef = useRef<(timestamp: number) => void>(() => {});

  // In-view & pointer capabilities observation
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    let isIntersecting = false;
    const updateVisibility = () => {
      setIsInView(isIntersecting && document.visibilityState === "visible");
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isIntersecting = entry.isIntersecting && entry.intersectionRatio >= 0.4;
        updateVisibility();
      },
      { threshold: [0, 0.4, 1] }
    );
    observer.observe(el);
    document.addEventListener("visibilitychange", updateVisibility);

    const pointerMq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const updatePointer = () => setCanMagnify(pointerMq.matches);
    updatePointer();
    pointerMq.addEventListener?.("change", updatePointer);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
      pointerMq.removeEventListener?.("change", updatePointer);
    };
  }, []);

  // Physics animation loop
  const tick = useCallback(
    (timestamp: number) => {
      rafIdRef.current = 0;
      const listEl = listRef.current;
      if (!listEl) return;

      const children = listEl.children;
      const geom = geomRef.current;
      const phys = physRef.current;
      const state = stateRef.current;
      const count = geom.c.length;

      if (phys.s.length !== count) {
        phys.s = Array(count).fill(1);
        phys.v = Array(count).fill(0);
      }

      const dt = Math.min(0.05, lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 1 / 60);
      lastTimeRef.current = timestamp;

      const isHoverMagnify = state.px !== null && state.magnify;
      const targetCenter = isHoverMagnify && state.px !== null ? state.px : (geom.c[state.at] ?? 0);
      const peakScale = state.reduced ? 0 : isHoverMagnify ? 0.7 : 0.22;
      const radius = (isHoverMagnify ? 3.1 : 1.6) * geom.tile;

      const getTargetScale = (i: number) => {
        if (!geom.shown[i] || peakScale === 0) return 1;
        const dist = Math.abs(geom.c[i] - targetCenter) / radius;
        return dist >= 1 ? 1 : 1 + peakScale * (0.5 + 0.5 * Math.cos(Math.PI * dist));
      };

      const pillTargetX = geom.c[state.at] ?? 0;
      let hasActiveMotion = false;
      const isInstant = state.reduced || !phys.init;
      const subDt = dt / 4;

      for (let i = 0; i < count; i++) {
        const target = getTargetScale(i);
        if (isInstant) {
          phys.s[i] = target;
          phys.v[i] = 0;
          continue;
        }
        for (let step = 0; step < 4; step++) {
          phys.v[i] += (900 * (target - phys.s[i]) - 60 * phys.v[i]) * subDt;
          phys.s[i] += phys.v[i] * subDt;
        }
        if (Math.abs(target - phys.s[i]) > 0.0005 || Math.abs(phys.v[i]) > 0.005) {
          hasActiveMotion = true;
        } else {
          phys.s[i] = target;
          phys.v[i] = 0;
        }
      }

      if (isInstant) {
        phys.px = pillTargetX;
        phys.pv = 0;
      } else {
        for (let step = 0; step < 4; step++) {
          phys.pv += (630 * (pillTargetX - phys.px) - 51 * phys.pv) * subDt;
          phys.px += phys.pv * subDt;
        }
        if (Math.abs(pillTargetX - phys.px) > 0.1 || Math.abs(phys.pv) > 0.5) {
          hasActiveMotion = true;
        } else {
          phys.px = pillTargetX;
          phys.pv = 0;
        }
      }

      phys.init = true;

      const expansions = phys.s.map((scale) => (scale - 1) * geom.tile);
      const totalExpansion = expansions.reduce((sum, e) => sum + e, 0);
      let cumulative = 0;
      const offsets = Array(count);
      for (let i = 0; i < count; i++) {
        offsets[i] = (cumulative - (totalExpansion - cumulative - expansions[i])) / 2;
        cumulative += expansions[i];
      }

      for (let i = 0; i < count; i++) {
        const child = children[i] as HTMLElement | undefined;
        if (!child || !geom.shown[i]) continue;
        const scale = phys.s[i];
        const a = ((scale - 1) / 0.7) * 6;
        child.style.setProperty("--tx", `${offsets[i].toFixed(2)}px`);
        child.style.setProperty("--e", `${expansions[i].toFixed(2)}px`);
        child.style.setProperty("--ty", `${(-a).toFixed(2)}px`);
        child.style.setProperty("--s", scale.toFixed(4));
      }

      const glassEl = glassRef.current;
      if (glassEl) {
        glassEl.style.width = `calc(100% + ${totalExpansion.toFixed(2)}px)`;
        glassEl.style.transform = `translateX(${(-totalExpansion / 2).toFixed(2)}px)`;
      }

      const M = (idx: number) =>
        geom.shown[idx] ? (phys.s[idx] - 1) * geom.tile + ((phys.s[idx] - 1) / 0.7) * 6 : 0;

      let pillOffsetX = 0;
      let leftIdx = -1;
      let rightIdx = -1;
      for (let i = 0; i < count; i++) {
        if (geom.shown[i]) {
          if (geom.c[i] <= phys.px) leftIdx = i;
          if (geom.c[i] >= phys.px && rightIdx < 0) rightIdx = i;
        }
      }
      if (leftIdx < 0) leftIdx = rightIdx;
      if (rightIdx < 0) rightIdx = leftIdx;
      if (leftIdx >= 0 && rightIdx >= 0) {
        const span = geom.c[rightIdx] - geom.c[leftIdx];
        const frac = span > 0 ? (phys.px - geom.c[leftIdx]) / span : 0;
        pillOffsetX = offsets[leftIdx] + (offsets[rightIdx] - offsets[leftIdx]) * frac;
      }

      const R = -M(state.at) - 30;
      const pillX = phys.px + pillOffsetX;

      const pillEl = pillRef.current;
      if (pillEl) {
        pillEl.style.transform = `translate(${pillX.toFixed(2)}px, ${R.toFixed(2)}px)`;
        pillEl.style.opacity = "1";
      }

      const tipEl = tipRef.current;
      if (tipEl && state.tip !== null) {
        const tIdx = state.tip;
        const tipX = tIdx === state.at ? pillX : (geom.c[tIdx] ?? 0) + (offsets[tIdx] ?? 0);
        const tipY = (tIdx === state.at ? R : -M(tIdx) - 2) - 34;
        tipEl.style.transform = `translate(${tipX.toFixed(2)}px, ${tipY.toFixed(2)}px)`;
        tipEl.style.opacity = "1";
      }

      if (hasActiveMotion) {
        rafIdRef.current = requestAnimationFrame((ts) => tickRef.current(ts));
      } else {
        lastTimeRef.current = 0;
      }
    },
    []
  );

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const requestTick = useCallback(() => {
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame((ts) => tickRef.current(ts));
    }
  }, []);

  // Measure geometry
  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;

    const measure = () => {
      const items = Array.from(listEl.children) as HTMLElement[];
      if (!items.length) return;
      geomRef.current.c = items.map((el) => el.offsetLeft + el.offsetWidth / 2);
      geomRef.current.shown = items.map((el) => el.offsetParent !== null);
      geomRef.current.tile = items[0]?.offsetWidth || 48;
      geomRef.current.pad = parseFloat(getComputedStyle(listEl).paddingLeft) || 9;
      requestTick();
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(listEl);

    return () => {
      ro.disconnect();
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
    };
  }, [requestTick]);

  useEffect(() => {
    requestTick();
  }, [activeIndex, canMagnify, reducedMotion, requestTick]);

  // Auto-rotation timer (2800ms)
  useEffect(() => {
    if (!isInView || reducedMotion || hoveredIndex !== null || AUTO_ROTATE_INDICES.length < 2) return;
    const timer = window.setTimeout(() => {
      if (clickedIndex !== null) {
        const idxInAuto = AUTO_ROTATE_INDICES.indexOf(clickedIndex);
        setClickedIndex(null);
        setRotateIndex((prev) => (idxInAuto >= 0 ? idxInAuto + 1 : prev + 1));
      } else {
        setRotateIndex((prev) => prev + 1);
      }
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [isInView, reducedMotion, hoveredIndex, clickedIndex, rotateIndex]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div ref={sectionRef} className="l-works w-full py-6 text-center flex flex-col items-center">
      <h2 className="l-works__title text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-2 text-center">
        Works wherever you can type
      </h2>

      <div
        className="l-dock"
        data-run={isInView && !reducedMotion ? "1" : "0"}
        data-fine={canMagnify && !reducedMotion ? "1" : "0"}
      >
        <div
          className="l-dock__shelf"
          onPointerMove={(e) => {
            if (e.pointerType === "touch") return;
            const listEl = listRef.current;
            if (!listEl) return;
            const zoom = getZoom(listEl);
            const pointerX = (e.clientX - listEl.getBoundingClientRect().left) / zoom;
            stateRef.current.px = pointerX;

            let nearest = -1;
            let minDist = Infinity;
            const geom = geomRef.current;
            geom.c.forEach((center, idx) => {
              if (!geom.shown[idx]) return;
              const d = Math.abs(center - pointerX);
              if (d < minDist) {
                minDist = d;
                nearest = idx;
              }
            });

            if (nearest >= 0 && nearest !== hoveredIndex) {
              setHoveredIndex(nearest);
            }
            requestTick();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") {
              stateRef.current.px = null;
              if (hoveredIndex !== null) {
                setClickedIndex(hoveredIndex);
              }
              setHoveredIndex(null);
              requestTick();
            }
          }}
        >
          {/* Desk background with blobs and clouds */}
          <div className="l-dock__desk" aria-hidden="true">
            <i className="l-dock__blob l-dock__blob--a" />
            <i className="l-dock__blob l-dock__blob--b" />
            <i className="l-dock__blob l-dock__blob--c" />
            <i className="l-dock__clouds" />
          </div>

          {/* Frosted Glass Dock Shelf */}
          <div ref={glassRef} className="l-dock__glass" aria-hidden="true" />

          {/* Floating Audio Pill with equalizer bars */}
          <span ref={pillRef} className="l-dock__pill" aria-hidden="true">
            <span key={activeIndex} className="l-dock__hop">
              <span className="l-dock__bars">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
            </span>
          </span>

          {/* Tooltip locked directly above audio pill */}
          <span
            ref={tipRef}
            className="l-dock__tip"
            aria-hidden="true"
            data-on=""
          >
            <span>{currentTipApp.name}</span>
          </span>

          {/* Apps List */}
          <ul
            ref={listRef}
            className="l-dock__apps flex flex-row flex-nowrap items-end justify-center list-none m-0 p-0"
            aria-label="Works wherever you can type"
            onKeyDown={(e) => {
              const shownIndices = geomRef.current.shown
                .map((shown, idx) => (shown ? idx : -1))
                .filter((idx) => idx >= 0);
              const curPos = shownIndices.indexOf(focusedIndex);
              let nextIdx = -1;
              if (e.key === "ArrowRight") {
                nextIdx = shownIndices[Math.min(shownIndices.length - 1, curPos + 1)];
              } else if (e.key === "ArrowLeft") {
                nextIdx = shownIndices[Math.max(0, curPos - 1)];
              } else if (e.key === "Home") {
                nextIdx = shownIndices[0];
              } else if (e.key === "End") {
                nextIdx = shownIndices[shownIndices.length - 1];
              }
              if (nextIdx === undefined || nextIdx < 0) return;
              e.preventDefault();
              const nextBtn = listRef.current?.children[nextIdx]?.querySelector("button");
              nextBtn?.focus();
            }}
            onBlur={(e) => {
              const currentTarget = e.currentTarget;
              const related = e.relatedTarget;
              if (!(related instanceof Node && currentTarget.contains(related))) {
                stateRef.current.px = null;
                if (hoveredIndex !== null) {
                  setClickedIndex(hoveredIndex);
                }
                setHoveredIndex(null);
                requestTick();
              }
            }}
          >
            {APPS.map((app, idx) => {
              const isRunning = RUNNING_APPS.has(app.logo) || idx === activeIndex;
              const isActive = idx === activeIndex;

              return (
                <li
                  key={app.logo}
                  className="l-dock__app"
                  data-on={isActive ? "" : undefined}
                  data-run={isRunning ? "" : undefined}
                  data-sep={app.hasSep ? "" : undefined}
                >
                  {app.hasSep && <span className="l-dock__sep" aria-hidden="true" />}
                  <button
                    type="button"
                    className="l-dock__tile relative block w-full h-full p-0 border-0 bg-transparent cursor-default focus:outline-none"
                    aria-label={app.name}
                    tabIndex={idx === focusedIndex ? 0 : -1}
                    onFocus={() => {
                      setFocusedIndex(idx);
                      setHoveredIndex(idx);
                      stateRef.current.px = canMagnify ? (geomRef.current.c[idx] ?? null) : null;
                      requestTick();
                    }}
                    onClick={(e) => {
                      if (!canMagnify || !(e.detail > 0)) {
                        setHoveredIndex(idx);
                        window.clearTimeout(timerRef.current);
                        timerRef.current = window.setTimeout(() => {
                          setClickedIndex(idx);
                          setHoveredIndex(null);
                        }, 2800);
                      } else {
                        setClickedIndex(idx);
                      }
                    }}
                  >
                    <img
                      src={app.icon}
                      alt={app.name}
                      width={48}
                      height={48}
                      loading={idx < 7 ? "eager" : "lazy"}
                      decoding="async"
                      className="ch-icon block w-full h-full object-contain pointer-events-none select-none"
                      draggable={false}
                    />
                  </button>
                  <span className="l-dock__dot" aria-hidden="true" />
                </li>
              );
            })}
          </ul>
        </div>

        {/* Dictate quote line */}
        <p className="l-dock__line" aria-hidden="true">
          {activeQuote && (
            <span key={activeIndex} className="l-dock__say">
              <b>{activeApp.name}</b>
              <span>{activeQuote}</span>
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
