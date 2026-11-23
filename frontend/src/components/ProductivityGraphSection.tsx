"use client";

import React from "react";
import WorksWhereverDock from "./WorksWhereverDock";

/*
// ============================================================================
// Previous Productivity Graph Wave & Chart Data (Keep for easy re-enabling)
// ============================================================================
import { useEffect, useRef } from "react";
import Image from "next/image";

const APPS = [
  { name: "Slack", icon: "/icons/slackApp.webp" },
  { name: "Linear", icon: "/icons/linearApp.webp" },
  { name: "Gmail", icon: "/icons/gmailApp.webp" },
  { name: "Cursor", icon: "/icons/cursorApp.webp" },
  { name: "Reminders", icon: "/icons/remindersApp.webp" },
  { name: "Messages", icon: "/icons/imessageApp.webp" },
  { name: "Google Docs", icon: "/icons/googleDocsApp.webp" },
  { name: "Obsidian", icon: "/icons/obsedian.webp" },
  { name: "Apple Maps", icon: "/icons/applemapsApp.webp" },
  { name: "Claude", icon: "/icons/claudeApp.webp" },
  { name: "Notion", icon: "/icons/notionApp.webp" },
  { name: "Telegram", icon: "/icons/telegramApp.webp" },
  { name: "Apple Calendar", icon: "/icons/applecalendarApp.webp" },
  { name: "Superhuman", icon: "/icons/superhumanApp.webp" },
  { name: "Chrome", icon: "/icons/chromeApp.svg" },
  { name: "Messenger", icon: "/icons/messengerApp.webp" },
  { name: "Google Calendar", icon: "/icons/googlecalendarApp.png" },
  { name: "VS Code", icon: "/icons/vscodeApp.webp" },
  { name: "ChatGPT", icon: "/icons/chatgptApp.webp" },
  { name: "Google Drive", icon: "/icons/googleDriveApp.webp" },
  { name: "WhatsApp", icon: "/icons/whatsApp.png" },
  { name: "Outlook", icon: "/icons/outlookApp.webp" },
  { name: "Dia", icon: "/icons/diaApp.webp" }
];

const smoothstep5 = (e: number) => e * e * e * (e * (6 * e - 15) + 10);
const triangle = (e: number) => {
  const t = ((e % 2) + 2) % 2;
  return t <= 1 ? t : 2 - t;
};

function computeWavePath(w: number, h: number, config: { amp: number; crestY: number }, iconSize: number, customW = w) {
  const r = 0.09 * customW;
  const n = (w - customW) / 2;
  const o = h * (1 - config.crestY) - iconSize / 2 - 56;
  const d = Math.min(customW * config.amp, Math.max(0, o / 2));
  const p = h * config.crestY + d;
  const m = n - r;
  const x = n + customW + r;
  const curveFactor = 0.685;
  const points: string[] = [];
  let totalLength = 0;
  let prev: [number, number] | null = null;

  for (let i = 0; i <= 140; i += 1) {
    const t = m + ((x - m) * i) / 140;
    const a = p + d * (1 - 2 * smoothstep5(triangle(((t - n) / customW - 0.15) / curveFactor)));
    if (prev) {
      totalLength += Math.hypot(t - prev[0], a - prev[1]);
    }
    prev = [t, a];
    points.push(`${t.toFixed(1)},${a.toFixed(1)}`);
  }

  return {
    path: `path("M${points.join("L")}")`,
    length: totalLength,
    from: m,
    to: x
  };
}
*/

export default function ProductivityGraphSection() {
  return (
    <section
      id="productivity-graph"
      className="jsx-ca39cb8ef7861e9f relative bg-transparent pt-10 md:pt-16 pb-14 md:pb-20 pg--visible"
    >
      <div className="jsx-ca39cb8ef7861e9f pg-card">
        {/* Interactive 'Works wherever you can type' macOS Dock */}
        <WorksWhereverDock />

        {/*
        ========================================================================
        PREVIOUS COMPONENT CONTENT (Commented out for easy re-enabling)
        ========================================================================
        */}
        {/*
        <div
          aria-hidden="true"
          className="jsx-1390364078 aw-band aw--ready aw--run"
          style={
            {
              "--aw-path": 'path("M0,0")',
              "--aw-fade-a": "0px",
              "--aw-fade-b": "0px",
              "--aw-fade-c": "100%",
              "--aw-fade-d": "1200px",
            } as React.CSSProperties
          }
        >
          {APPS.map((app, i) => (
            <span
              key={app.name}
              style={{ "--aw-delay": `${(-(i / APPS.length) * 24).toFixed(3)}s` } as React.CSSProperties}
              className="jsx-1390364078 aw-slot"
            >
              <Image
                src={app.icon}
                alt={`${app.name} app icon`}
                width={96}
                height={96}
                className="jsx-1390364078 aw-icon"
              />
            </span>
          ))}
        </div>

        <div className="jsx-ca39cb8ef7861e9f pg-inner">
          <div className="jsx-ca39cb8ef7861e9f pg-copy">
            <h2 className="jsx-ca39cb8ef7861e9f section-title pg-title">Not just another dictation app</h2>
            <p className="jsx-ca39cb8ef7861e9f pg-sub">
              Dictation only speeds up your typing. VoiceDesk multiplies your productivity.
            </p>
          </div>

          <div
            role="img"
            aria-label="Relative productivity of typing, dictation, and VoiceDesk"
            className="jsx-ca39cb8ef7861e9f pg-chart"
          >
            <div className="jsx-ca39cb8ef7861e9f pg-cols">
              <div className="jsx-ca39cb8ef7861e9f pg-col">
                <div style={{ "--pg-d": "0.55s" } as React.CSSProperties} className="jsx-ca39cb8ef7861e9f pg-figure pg-figure--typing">
                  <span className="jsx-ca39cb8ef7861e9f pg-num">1×</span>
                </div>
                <div
                  style={
                    {
                      "--pg-h": "7.4%",
                      "--pg-d": "0.1s",
                      "--pg-t": "0.55s",
                    } as React.CSSProperties
                  }
                  className="jsx-ca39cb8ef7861e9f pg-bar pg-bar--typing"
                />
              </div>

              <div className="jsx-ca39cb8ef7861e9f pg-col">
                <div style={{ "--pg-d": "0.85s" } as React.CSSProperties} className="jsx-ca39cb8ef7861e9f pg-figure pg-figure--dictation">
                  <span className="jsx-ca39cb8ef7861e9f pg-num">4×</span>
                </div>
                <div
                  style={
                    {
                      "--pg-h": "29.6%",
                      "--pg-d": "0.3s",
                      "--pg-t": "0.7s",
                    } as React.CSSProperties
                  }
                  className="jsx-ca39cb8ef7861e9f pg-bar pg-bar--dictation"
                />
              </div>

              <div className="jsx-ca39cb8ef7861e9f pg-col">
                <div style={{ "--pg-d": "1.35s" } as React.CSSProperties} className="jsx-ca39cb8ef7861e9f pg-figure pg-figure--voiceos">
                  <span className="jsx-ca39cb8ef7861e9f pg-num">10×</span>
                  <span className="jsx-ca39cb8ef7861e9f pg-payoff">your productivity</span>
                </div>
                <div
                  style={
                    {
                      "--pg-h": "74%",
                      "--pg-d": "0.55s",
                      "--pg-t": "1s",
                    } as React.CSSProperties
                  }
                  className="jsx-ca39cb8ef7861e9f pg-bar pg-bar--voiceos"
                >
                  <span className="jsx-ca39cb8ef7861e9f pg-sky" />
                  <Image
                    alt="VoiceDesk logo"
                    width={240}
                    height={80}
                    className="pg-marklogo"
                    style={{ color: "transparent", "--pg-d": "1.55s" } as React.CSSProperties}
                    src="/voiceOsLogo.png"
                  />
                </div>
              </div>
            </div>

            <div className="jsx-ca39cb8ef7861e9f pg-names">
              <span style={{ "--pg-d": "0.4s" } as React.CSSProperties} className="jsx-ca39cb8ef7861e9f pg-name">
                Typing
              </span>
              <span
                style={{ "--pg-d": "0.6s" } as React.CSSProperties}
                className="jsx-ca39cb8ef7861e9f pg-name"
              >
                Dictation
              </span>
              <span
                style={{ "--pg-d": "0.85s" } as React.CSSProperties}
                className="jsx-ca39cb8ef7861e9f pg-name"
              >
                VoiceDesk
              </span>
            </div>
          </div>
        </div>
        */}
      </div>
    </section>
  );
}
