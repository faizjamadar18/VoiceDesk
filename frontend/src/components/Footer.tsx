"use client";

import { useEffect, useRef, useState } from "react";

interface LetterItem {
  char: string;
  triangle?: boolean;
  collapsed: number;
  final: number;
  appearAt: number;
}

const LETTERS: LetterItem[] = [
  { char: "v", triangle: true, collapsed: 560, final: 110, appearAt: 0 },
  { char: "o", collapsed: 650, final: 270, appearAt: 0.08 },
  { char: "i", collapsed: 675, final: 378, appearAt: 0.16 },
  { char: "c", collapsed: 690, final: 487, appearAt: 0.24 },
  { char: "e", collapsed: 700, final: 649, appearAt: 0.32 },
  { char: "d", collapsed: 710, final: 810, appearAt: 0.40 },
  { char: "e", collapsed: 720, final: 969, appearAt: 0.48 },
  { char: "s", collapsed: 730, final: 1128, appearAt: 0.56 },
  { char: "k", collapsed: 750, final: 1278, appearAt: 0.64 },
];

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

function getTrianglePath(cx: number) {
  const a = 138 / Math.sqrt(3);
  const pts = [
    { x: cx - a, y: 122 },
    { x: cx + a, y: 122 },
    { x: cx, y: 260 },
  ];
  const n = pts.length;
  const inPts: { x: number; y: number }[] = [];
  const outPts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const nxt = pts[(i + 1) % n];
    const prv = pts[(i + 2) % n];
    const distNext = Math.hypot(nxt.x - cur.x, nxt.y - cur.y);
    const distPrev = Math.hypot(prv.x - cur.x, prv.y - cur.y);
    const p = Math.min(20, distNext / 2, distPrev / 2);
    inPts[i] = { x: cur.x + ((nxt.x - cur.x) / distNext) * p, y: cur.y + ((nxt.y - cur.y) / distNext) * p };
    outPts[i] = { x: cur.x + ((prv.x - cur.x) / distPrev) * p, y: cur.y + ((prv.y - cur.y) / distPrev) * p };
  }
  let path = `M ${inPts[0].x.toFixed(2)} ${inPts[0].y.toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const nextIdx = (i + 1) % n;
    path += ` L ${outPts[nextIdx].x.toFixed(2)} ${outPts[nextIdx].y.toFixed(2)} Q ${pts[nextIdx].x.toFixed(2)} ${pts[nextIdx].y.toFixed(2)} ${inPts[nextIdx].x.toFixed(2)} ${inPts[nextIdx].y.toFixed(2)}`;
  }
  return `${path} Z`;
}

export default function Footer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(1); // Default to full expanded so it's always complete

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        let start: number | null = null;
        const duration = 750;
        const animate = (timestamp: number) => {
          if (!start) start = timestamp;
          const elapsed = timestamp - start;
          const p = clamp(elapsed / duration, 0, 1);
          setProgress(p);
          if (p < 1) {
            requestAnimationFrame(animate);
          }
        };
        requestAnimationFrame(animate);
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
  const stdDev = 1 + 10 * Math.exp(-Math.pow((progress - 0.45) / 0.24, 2));

  return (
    <footer className="w-full bg-white py-16">
      <div className="max-w-7xl mx-auto px-6">
        {/* Big animated VoiceDesk gooey SVG logo */}
        <div ref={containerRef} className="w-full select-none pointer-events-none text-neutral-300 my-8" aria-hidden="true">
          <svg viewBox="0 48 1400 240" fill="none" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", width: "100%", height: "auto", aspectRatio: "1400 / 240" }}>
            <defs>
              <filter id="voicedesk-goo" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur in="SourceGraphic" stdDeviation={stdDev} result="blur" />
                <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" />
              </filter>
            </defs>
            <g filter="url(#voicedesk-goo)" fill="currentColor">
              {LETTERS.map((item, idx) => {
                const currentX = item.collapsed + (item.final - item.collapsed) * ease;
                const opacity = item.appearAt === 0 ? 1 : clamp((progress - item.appearAt) / 0.22, 0, 1);
                if (item.triangle) {
                  return <path key={idx} d={getTrianglePath(currentX)} opacity={opacity} />;
                }
                return (
                  <text
                    key={idx}
                    x={currentX}
                    y={256}
                    textAnchor="middle"
                    opacity={opacity}
                    fontSize={250}
                    fontWeight={800}
                    fontFamily="'SF Pro Display', 'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif"
                  >
                    {item.char}
                  </text>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Footer bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-neutral-100 text-sm text-neutral-500">
          <p>© 2026 All Rights Reserved.</p>
          <div className="flex items-center gap-6">
            <a href="https://github.com/faizjamadar18/VoiceDesk" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-800 transition-colors">
              <span className="sr-only">GitHub</span>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
            </a>
            <a href="https://x.com/VoiceDesk" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-800 transition-colors">
              <span className="sr-only">X (Twitter)</span>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            </a>
            <a href="https://www.linkedin.com/company/voicedesk/" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-800 transition-colors">
              <span className="sr-only">LinkedIn</span>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
            </a>
            <a href="mailto:support@voicedesk.app" className="hover:text-neutral-800 transition-colors">
              <span className="sr-only">Email</span>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M0 3v18h24v-18h-24zm6.623 7.929l-4.623 5.712v-9.458l4.623 3.746zm-4.141-5.929h19.035l-9.517 7.713-9.518-7.713zm5.694 7.188l3.824 3.099 3.83-3.104 5.612 6.817h-18.779l5.513-6.812zm9.208-1.264l4.616-3.741v9.348l-4.616-5.607z" /></svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
