"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import Image from "next/image";

// SVG Clip Paths for macOS Liquid Notch
// V_CLIP: Collapsed listening state (shoulderOverhang: 9, shoulderHeight: 11, bottomRadius: 19, cornerExponent: 2.4)
const V_CLIP =
  "polygon(0.000px 0.000px, calc(100% - 0.000px) 0.000px, calc(100% - 1.085px) 2.066px, calc(100% - 2.154px) 2.262px, calc(100% - 3.191px) 2.585px, calc(100% - 4.183px) 3.031px, calc(100% - 5.113px) 3.593px, calc(100% - 5.968px) 4.263px, calc(100% - 6.737px) 5.032px, calc(100% - 7.407px) 5.887px, calc(100% - 7.969px) 6.817px, calc(100% - 8.415px) 7.809px, calc(100% - 8.738px) 8.846px, calc(100% - 8.934px) 9.915px, calc(100% - 9.000px) 11.000px, calc(100% - 9.000px) calc(100% - 19.000px), calc(100% - 9.116px) calc(100% - 15.741px), calc(100% - 9.461px) calc(100% - 13.229px), calc(100% - 10.035px) calc(100% - 10.992px), calc(100% - 10.832px) calc(100% - 8.967px), calc(100% - 11.847px) calc(100% - 7.140px), calc(100% - 13.075px) calc(100% - 5.508px), calc(100% - 14.508px) calc(100% - 4.075px), calc(100% - 16.140px) calc(100% - 2.847px), calc(100% - 17.967px) calc(100% - 1.832px), calc(100% - 19.992px) calc(100% - 1.035px), calc(100% - 22.229px) calc(100% - 0.461px), calc(100% - 24.741px) calc(100% - 0.116px), calc(100% - 28.000px) calc(100% - 0.000px), 28.000px calc(100% - 0.000px), 24.741px calc(100% - 0.116px), 22.229px calc(100% - 0.461px), 19.992px calc(100% - 1.035px), 17.967px calc(100% - 1.832px), 16.140px calc(100% - 2.847px), 14.508px calc(100% - 4.075px), 13.075px calc(100% - 5.508px), 11.847px calc(100% - 7.140px), 10.832px calc(100% - 8.967px), 10.035px calc(100% - 10.992px), 9.461px calc(100% - 13.229px), 9.116px calc(100% - 15.741px), 9.000px calc(100% - 19.000px), 9.000px 11.000px, 8.934px 9.915px, 8.738px 8.846px, 8.415px 7.809px, 7.969px 6.817px, 7.407px 5.887px, 6.737px 5.032px, 5.968px 4.263px, 5.113px 3.593px, 4.183px 3.031px, 3.191px 2.585px, 2.154px 2.262px, 1.085px 2.066px)";

// Y_CLIP: Expanded card state (shoulderOverhang: 20, shoulderHeight: 22, bottomRadius: 35, cornerExponent: 2.4)
const Y_CLIP =
  "polygon(0.000px 0.000px, calc(100% - 0.000px) 0.000px, calc(100% - 2.411px) 2.146px, calc(100% - 4.786px) 2.581px, calc(100% - 7.092px) 3.300px, calc(100% - 9.294px) 4.291px, calc(100% - 11.361px) 5.540px, calc(100% - 13.262px) 7.030px, calc(100% - 14.970px) 8.738px, calc(100% - 16.460px) 10.639px, calc(100% - 17.709px) 12.706px, calc(100% - 18.700px) 14.908px, calc(100% - 19.419px) 17.214px, calc(100% - 19.854px) 19.589px, calc(100% - 20.000px) 22.000px, calc(100% - 20.000px) calc(100% - 35.000px), calc(100% - 20.213px) calc(100% - 28.997px), calc(100% - 20.850px) calc(100% - 24.370px), calc(100% - 21.906px) calc(100% - 20.248px), calc(100% - 23.374px) calc(100% - 16.519px), calc(100% - 25.245px) calc(100% - 13.153px), calc(100% - 27.506px) calc(100% - 10.146px), calc(100% - 30.146px) calc(100% - 7.506px), calc(100% - 33.153px) calc(100% - 5.245px), calc(100% - 36.519px) calc(100% - 3.374px), calc(100% - 40.248px) calc(100% - 1.906px), calc(100% - 44.370px) calc(100% - 0.850px), calc(100% - 48.997px) calc(100% - 0.213px), calc(100% - 55.000px) calc(100% - 0.000px), 55.000px calc(100% - 0.000px), 48.997px calc(100% - 0.213px), 44.370px calc(100% - 0.850px), 40.248px calc(100% - 1.906px), 36.519px calc(100% - 3.374px), 33.153px calc(100% - 5.245px), 30.146px calc(100% - 7.506px), 27.506px calc(100% - 10.146px), 25.245px calc(100% - 13.153px), 23.374px calc(100% - 16.519px), 21.906px calc(100% - 20.248px), 20.850px calc(100% - 24.370px), 20.213px calc(100% - 28.997px), 20.000px calc(100% - 35.000px), 20.000px 22.000px, 19.854px 19.589px, 19.419px 17.214px, 18.700px 14.908px, 17.709px 12.706px, 16.460px 10.639px, 14.970px 8.738px, 13.262px 7.030px, 11.361px 5.540px, 9.294px 4.291px, 7.092px 3.300px, 4.786px 2.581px, 2.411px 2.146px)";

// Blinking typewriter caret component
function Caret() {
  return (
    <span
      style={{
        display: "inline-block",
        width: "2px",
        height: "0.9em",
        marginLeft: "1px",
        background: "#E8EAED",
        verticalAlign: "text-bottom",
        animation: "hero-screen-caret 0.8s step-end infinite",
      }}
    />
  );
}

// App icon trails displayed on wallpaper mouse interaction
const TRAIL_ICONS = [
  "/icons/gmailApp.webp",
  "/icons/claudeApp.webp",
  "/icons/googlecalendarApp.png",
  "/icons/linearApp.webp",
  "/icons/slackApp.webp",
  "/icons/chatgptApp.webp",
  "/icons/googleDriveApp.webp",
  "/icons/imessageApp.webp",
  "/icons/notionApp.webp",
  "/icons/applemapsApp.webp",
  "/icons/cursorApp.webp",
  "/icons/googleDocsApp.webp",
  "/icons/obsedian.webp",
  "/icons/finderApp.webp",
];

function HeroTrailLayer() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = layerRef.current;
    if (!el || typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const spritePool: { el: HTMLDivElement; anim: Animation | null }[] = [];
    const poolSize = 36;

    for (let i = 0; i < poolSize; i++) {
      const sprite = document.createElement("div");
      sprite.className = "hero-trail-sprite";
      sprite.style.setProperty("--size", `${i % 2 === 0 ? 30 : 24}px`);
      const img = document.createElement("img");
      img.alt = "";
      img.src = TRAIL_ICONS[i % TRAIL_ICONS.length];
      sprite.appendChild(img);
      el.appendChild(sprite);
      spritePool.push({ el: sprite, anim: null });
    }

    let spriteIndex = 0;
    let lastTime = 0;
    let lastPos: { x: number; y: number } | null = null;

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const now = performance.now();
      if (now - lastTime < 45) return;
      if (lastPos && Math.hypot(x - lastPos.x, y - lastPos.y) < 25) return;

      lastTime = now;
      lastPos = { x, y };

      const item = spritePool[spriteIndex % poolSize];
      spriteIndex++;

      item.anim?.cancel();
      item.anim = item.el.animate(
        [
          { transform: `translate3d(${x}px, ${y}px, 0) scale(0.4) rotate(-5deg)`, opacity: 0 },
          { transform: `translate3d(${x + 6}px, ${y - 12}px, 0) scale(1) rotate(2deg)`, opacity: 0.95, offset: 0.2 },
          { transform: `translate3d(${x + 18}px, ${y - 32}px, 0) scale(0.9) rotate(8deg)`, opacity: 0, offset: 1.0 },
        ],
        { duration: 1200, easing: "cubic-bezier(0.22, 0.68, 0.3, 1)", fill: "forwards" }
      );
    };

    el.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      el.removeEventListener("pointermove", onPointerMove);
      spritePool.forEach((item) => {
        item.anim?.cancel();
        item.el.remove();
      });
    };
  }, []);

  return <div className="hero-trail-layer" ref={layerRef} aria-hidden="true" />;
}

// Sound wave equalizer / VoiceOS Orb component in the MacBook notch
interface NotchOrbProps {
  mode: "waveform" | "loading" | "orb";
  size?: number;
}

function NotchOrb({ mode, size = 18 }: NotchOrbProps) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isOrb = mode === "orb";

  useEffect(() => {
    if (isOrb && videoRef.current) {
      videoRef.current.play()?.catch(() => {});
    }
  }, [isOrb]);

  useEffect(() => {
    let animId: number;
    const startTime = performance.now();

    const animate = (time: number) => {
      const elapsed = (time - startTime) / 1000;

      barsRef.current.forEach((bar, index) => {
        if (!bar) return;
        if (mode === "waveform") {
          // Dynamic oscillatory audio wave heights in pure white
          const wave =
            Math.sin(elapsed * 9 + index * 1.5) * 4.5 +
            Math.sin(elapsed * 16 - index * 2.2) * 2.5 +
            Math.cos(elapsed * 5.2 + index) * 3;
          const h = Math.max(3, Math.min(16, 9 + wave));
          bar.style.height = `${h.toFixed(1)}px`;
          bar.style.background = "#ffffff";
          bar.style.boxShadow = "0 0 3px rgba(255, 255, 255, 0.45)";
          bar.style.borderRadius = h <= 3 ? "50%" : "1.25px";
        } else if (mode === "loading") {
          // Smooth pulsating white dots
          const pulse = Math.sin(elapsed * 7 - index * 0.8);
          const h = Math.max(3, Math.min(8, 5 + pulse * 2.5));
          bar.style.height = `${h.toFixed(1)}px`;
          bar.style.background = "rgba(255, 255, 255, 0.85)";
          bar.style.boxShadow = "0 0 2px rgba(255, 255, 255, 0.3)";
          bar.style.borderRadius = "50%";
        }
      });

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [mode]);

  return (
    <div
      style={{
        position: "relative",
        width: `${Math.max(22, size)}px`,
        height: `${size}px`,
        flexShrink: 0,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      {/* 4 Oscillating audio equalizer bars in white */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          willChange: "opacity, transform",
          opacity: isOrb ? 0 : 1,
          transform: isOrb ? "scale(0.85)" : "scale(1)",
          transition: "opacity 280ms cubic-bezier(0.4, 0, 0.2, 1), transform 280ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            ref={(el) => {
              barsRef.current[i] = el;
            }}
            style={{
              width: "2.5px",
              height: "4px",
              margin: "0 1.5px",
              borderRadius: "50%",
              background: "#ffffff",
              boxShadow: "0 0 2px rgba(255, 255, 255, 0.35)",
              flexShrink: 0,
              willChange: "height, background",
            }}
          />
        ))}
      </div>

      {/* Incredible Voice Orb (video-backed from our notch codebase) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          willChange: "opacity, transform",
          opacity: isOrb ? 1 : 0,
          transform: isOrb ? "scale(1)" : "scale(0.75)",
          transition: "opacity 280ms cubic-bezier(0.4, 0, 0.2, 1), transform 280ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          data-testid="voice-orb"
          data-renderer="video"
          role="img"
          aria-label="Incredible voice orb"
          style={{
            position: "relative",
            width: `${size}px`,
            height: `${size}px`,
            flexShrink: 0,
            borderRadius: "50%",
            overflow: "hidden",
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.35), 0 0 2px rgba(0, 0, 0, 0.2)",
          }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            loop
            autoPlay
            preload="auto"
            src="/voice-orb-small.mp4"
            aria-hidden="true"
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              borderRadius: "50%",
              objectFit: "cover",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// Confirmation Pill ("Email sent" / "Scheduled")
interface HeroSentPillProps {
  appIcon: string;
  sentText: string;
}

function HeroSentPill({ appIcon, sentText }: HeroSentPillProps) {
  return (
    <div className="hero-screen-sky-sent">
      <span className="hero-screen-sky-sent-inner">
        <Image
          className="hero-screen-sky-sent-app"
          src={appIcon}
          alt=""
          width={16}
          height={16}
          unoptimized
        />
        <span>{sentText}</span>
        <svg className="hero-screen-sky-sent-check" viewBox="0 0 12 11" fill="none">
          <path d="M1.5 5.9 L4.6 9 L10.5 1.9" pathLength="1" />
        </svg>
      </span>
    </div>
  );
}

// Content data for cards
interface GmailCardData {
  type: "gmail";
  app: string;
  header: string;
  to: string;
  recipient: string;
  subject: string;
  body: string;
  send: string;
  sent: string;
}

interface CalendarCardData {
  type: "calendar";
  app: string;
  header: string;
  title: string;
  when: string;
  guest: string;
  meet: string;
  save: string;
  sent: string;
}

interface SlackCardData {
  type: "slack";
  app: string;
  recipientName: string;
  recipientInitial: string;
  avatarColor: string;
  recentContextName: string;
  recentContextTime: string;
  recentContextText: string;
  placeholder: string;
  message: string;
  sent: string;
}

type CardData = GmailCardData | CalendarCardData | SlackCardData;

const CARDS_DATA: CardData[] = [
  {
    type: "gmail",
    app: "/icons/gmailApp.webp",
    header: "New Message",
    to: "To",
    recipient: "faiz@company.com",
    subject: "Project update and Thursday sync",
    body: "Hi Faiz,\n\nThe designs look great. Let's sync Thursday.\n\nBest",
    send: "Send",
    sent: "Email sent",
  },
  {
    type: "calendar",
    app: "/icons/googlecalendarApp.png",
    header: "New Event",
    title: "Design review with Faiz",
    when: "Thursday · 2:00 – 2:30 PM",
    guest: "faiz@company.com",
    meet: "Google Meet",
    save: "Save",
    sent: "Scheduled",
  },
  {
    type: "slack",
    app: "/icons/slackApp.webp",
    recipientName: "Faiz",
    recipientInitial: "F",
    avatarColor: "#1264A3",
    recentContextName: "Faiz",
    recentContextTime: "9:14 AM",
    recentContextText: "Faiz joined Slack — take a second to say hello.",
    placeholder: "Message Faiz",
    message: "Hi Faiz, the v2 release build is ready for review. Let's sync on the deployment checklist today.",
    sent: "Message sent",
  },
];

export default function HeroSection() {
  const [isMac] = useState(() => {
    if (typeof window !== "undefined") {
      return !window.navigator.userAgent.toLowerCase().includes("win");
    }
    return true;
  });

  // Timeline States:
  // 0: waveform listening (notch collapsed, sound waves oscillating, 620ms)
  // 1: loading processing (notch collapsed, loading pulse, 400ms)
  // 2: orb + card open (notch expands, typewriter types text, cursor clicks send/save, 3200ms)
  // 3: orb + card closed + sent pill (notch collapses, confirmation pill animates in sky, 1400ms)
  // 4: buffer gap before next card (240ms)
  const [timelineStep, setTimelineStep] = useState<number>(0);
  const [cardIndex, setCardIndex] = useState<number>(0);
  const [charCount, setCharCount] = useState<number>(0);
  const [cursorTarget, setCursorTarget] = useState<"wander" | "send" | "click">("wander");
  const [isSendPressed, setIsSendPressed] = useState<boolean>(false);

  const activeCard = CARDS_DATA[cardIndex];

  // Helper calculation for typewriter offsets
  const isGmail = activeCard.type === "gmail";
  const isCalendar = activeCard.type === "calendar";
  const isSlack = activeCard.type === "slack";

  const subjectTotalLen = isGmail
    ? activeCard.subject.length
    : isCalendar
    ? activeCard.title.length
    : 0;
  const bodyTotalLen = isGmail ? activeCard.body.length : 0;
  const slackTotalLen = isSlack ? activeCard.message.length : 0;

  const typedSubjectLen = isSlack ? 0 : Math.min(charCount, subjectTotalLen);
  const typedBodyLen = isGmail ? Math.max(0, Math.min(charCount - subjectTotalLen, bodyTotalLen)) : 0;
  const typedSlackLen = isSlack ? Math.min(charCount, slackTotalLen) : 0;

  const isSubjectFinished = isSlack ? true : typedSubjectLen >= subjectTotalLen;
  const isTypingComplete = isGmail
    ? isSubjectFinished && typedBodyLen >= bodyTotalLen
    : isCalendar
    ? isSubjectFinished
    : typedSlackLen >= slackTotalLen;

  // Step advancement timer loop: smoothly cycles timelineStep 0..4 and advances cardIndex
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const durations = [620, 400, 3200, 1400, 240];
    const duration = durations[timelineStep];

    const timer = setTimeout(() => {
      const next = (timelineStep + 1) % 5;
      setTimelineStep(next);
      if (next === 0) {
        setCardIndex((prev) => (prev + 1) % CARDS_DATA.length);
      }
    }, duration);

    return () => clearTimeout(timer);
  }, [timelineStep]);

  // Reset typewriter & cursor states when card is closed or when card index changes
  useEffect(() => {
    if (timelineStep !== 2) {
      const resetTimer = setTimeout(() => {
        setCharCount(0);
        setCursorTarget("wander");
        setIsSendPressed(false);
      }, 200);
      return () => clearTimeout(resetTimer);
    }
  }, [timelineStep, cardIndex]);

  // Typewriter effect during Step 2
  useEffect(() => {
    if (timelineStep !== 2) return;

    if (isTypingComplete) return;

    // Fast typing: subject/title at 16ms, body at 8ms, Slack message at 10ms
    const delay = isSlack ? 10 : !isSubjectFinished ? 16 : 8;
    const typeTimer = setTimeout(() => {
      setCharCount((prev) => prev + 1);
    }, delay);

    return () => clearTimeout(typeTimer);
  }, [timelineStep, charCount, isTypingComplete, isSubjectFinished, isSlack]);

  // Animate cursor hint to Send/Save button and click it once typing completes
  useEffect(() => {
    if (timelineStep !== 2) return;

    // When typing is done, glide cursor to the Send/Save button
    const glideTimer = setTimeout(() => {
      setCursorTarget("send");
    }, 1200);

    // Click Send/Save button
    const clickTimer = setTimeout(() => {
      setCursorTarget("click");
      setIsSendPressed(true);
    }, 1900);

    // Release Send/Save button click
    const releaseTimer = setTimeout(() => {
      setIsSendPressed(false);
      setCursorTarget("wander");
    }, 2350);

    return () => {
      clearTimeout(glideTimer);
      clearTimeout(clickTimer);
      clearTimeout(releaseTimer);
    };
  }, [timelineStep]);

  // Derived flags
  const isNotchOpen = timelineStep === 2;
  const showSentPill = timelineStep === 3;
  const currentMode = timelineStep === 0 ? "waveform" : timelineStep === 1 ? "loading" : "orb";

  // Cursor hint position styles with high z-index to stay above the notch
  const cursorStyle = useMemo((): React.CSSProperties => {
    if (cursorTarget === "send" || cursorTarget === "click") {
      return {
        top: "calc(18px + 233px - 34px)",
        left: "calc(50% + min(23%, 215px) - 52px)",
        zIndex: 60,
        transform: cursorTarget === "click" ? "scale(0.85)" : "scale(1)",
        transition:
          "top 0.65s cubic-bezier(0.25, 1, 0.5, 1), left 0.65s cubic-bezier(0.25, 1, 0.5, 1), transform 0.15s ease",
      };
    }
    return {
      top: "55%",
      left: "17%",
      zIndex: 60,
      transition: "top 0.65s cubic-bezier(0.25, 1, 0.5, 1), left 0.65s cubic-bezier(0.25, 1, 0.5, 1)",
    };
  }, [cursorTarget]);

  return (
    <div className="contents">
      <section id="hero">
        <div
          className="relative overflow-hidden"
          style={{ minHeight: "min(100vh, 1200px)", backgroundColor: "transparent" }}
        >
          {/* Corner blurred borders */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              width: "220px",
              height: "220px",
              zIndex: 4,
              pointerEvents: "none",
              top: "28px",
              left: "28px",
              borderTop: "3px solid #ebebeb",
              borderBottom: "none",
              borderLeft: "3px solid #ebebeb",
              borderRight: "none",
              borderTopLeftRadius: "30px",
              filter: "blur(12px)",
              boxShadow: "-2px 0 0 0 white, 0 -2px 0 0 white",
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              width: "220px",
              height: "220px",
              zIndex: 4,
              pointerEvents: "none",
              top: "28px",
              right: "28px",
              borderTop: "3px solid #ebebeb",
              borderBottom: "none",
              borderLeft: "none",
              borderRight: "3px solid #ebebeb",
              borderTopRightRadius: "30px",
              filter: "blur(12px)",
              boxShadow: "2px 0 0 0 white, 0 -2px 0 0 white",
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              width: "220px",
              height: "220px",
              zIndex: 4,
              pointerEvents: "none",
              bottom: "28px",
              left: "28px",
              borderTop: "none",
              borderBottom: "3px solid #ebebeb",
              borderLeft: "3px solid #ebebeb",
              borderRight: "none",
              borderBottomLeftRadius: "30px",
              filter: "blur(12px)",
              boxShadow: "-2px 0 0 0 white, 0 2px 0 0 white",
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              width: "220px",
              height: "220px",
              zIndex: 4,
              pointerEvents: "none",
              bottom: "28px",
              right: "28px",
              borderTop: "none",
              borderBottom: "3px solid #ebebeb",
              borderLeft: "none",
              borderRight: "3px solid #ebebeb",
              borderBottomRightRadius: "30px",
              filter: "blur(12px)",
              boxShadow: "2px 0 0 0 white, 0 2px 0 0 white",
            }}
          />

          <div
            className="relative z-[5] flex flex-col items-center justify-center px-4 md:px-6 pt-24 pb-10"
            style={{ minHeight: "min(100vh, 1200px)" }}
          >
            <div className="relative text-center max-w-4xl" style={{ zIndex: 3 }}>
              {/* Title */}
              <h1
                className="section-title mb-6 leading-tight"
                style={{
                  fontSize: "clamp(2.1rem, 10.2vw, 4.75rem)",
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  whiteSpace: "pre-line",
                }}
              >
                <span
                  className="chroma-text"
                  style={{
                    fontWeight: 600,
                    backgroundImage:
                      "linear-gradient(90deg, #0a0a0a 0%, #0a0a0a 33.33%, #1e3a8a 40%, #2563eb 45%, #c9a84c 50%, #dbeafe 55%, #0358f7 60%, #0a0a0a 66.67%, #0a0a0a)",
                  }}
                >
                  Voice assistant{"\n"}at your fingertips
                </span>
              </h1>

              {/* CTA Button */}
              <div className="relative z-[4] flex items-center justify-center">
                <div className="glassmorphic-button-wrap w-full md:w-auto">
                  <a
                    href={
                      isMac
                        ? "https://api.voiceos.com/delivery/releases/primary/VoiceOS-Installer.dmg"
                        : "#download"
                    }
                    title="Download VoiceOS"
                    className="glassmorphic-button w-full md:w-auto"
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        position: "relative",
                        zIndex: 4,
                      }}
                    >
                      {isMac ? (
                        <svg
                          className="w-6 h-6"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                        </svg>
                      ) : (
                        <svg
                          className="w-5 h-5"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.401H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                        </svg>
                      )}
                      {isMac ? "Download for Mac" : "Download for Windows"}
                    </span>
                  </a>
                  <div className="glassmorphic-button-shadow" />
                </div>
              </div>

              <p className="mt-4 text-sm text-gray-500">7-day free trial · Cancel anytime</p>
            </div>

            {/* Desktop Screen Mock */}
            <div className="flex justify-center w-full mt-8 md:mt-10" style={{ zIndex: 3 }}>
              <div aria-hidden="true" className="jsx-1573246498 hero-screen">
                <picture className="jsx-1573246498">
                  <source
                    media="(max-width: 767px)"
                    srcSet="/skyCloudsHero-mobile.webp"
                    className="jsx-1573246498"
                  />
                  <img
                    src="/skyCloudsHero.webp"
                    alt="Blue sky and clouds behind the VoiceOS desktop preview"
                    fetchPriority="high"
                    loading="eager"
                    width={3344}
                    height={1882}
                    className="jsx-1573246498 hero-screen-wallpaper"
                  />
                </picture>

                {/* Interactive cursor trail of app icons */}
                <HeroTrailLayer />

                {/* Animated macOS cursor hint */}
                <div
                  aria-hidden="true"
                  className="jsx-ab60216bc43f7d98 hero-cursor-hint"
                  style={{ ...cursorStyle, zIndex: 60 }}
                >
                  <div className={cursorTarget === "wander" ? "jsx-ab60216bc43f7d98 hero-cursor-hint-wander" : ""}>
                    <div className={cursorTarget === "wander" ? "jsx-ab60216bc43f7d98 hero-cursor-hint-jiggle" : ""}>
                      <svg viewBox="0 0 20 28" fill="none" className="jsx-ab60216bc43f7d98">
                        <path
                          d="M2 1.5 L2 22 L7.1 17 L10.3 25 L14 23.4 L10.8 15.7 L17.4 15.3 Z"
                          className="jsx-ab60216bc43f7d98"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Sent notification pill ("Email sent" / "Scheduled") */}
                {showSentPill && (
                  <HeroSentPill appIcon={activeCard.app} sentText={activeCard.sent} />
                )}

                {/* macOS Menubar */}
                <div className="jsx-1573246498 hero-screen-menubar" />

                {/* MacBook Notch with Liquid Glass and Live Animated Card */}
                <div
                  className={`jsx-1861366530 lns hero-screen-notch${isNotchOpen ? " is-open" : ""}`}
                >
                  <div aria-hidden="true" className="jsx-1861366530 lns-glass" />
                  <div
                    style={{
                      clipPath: isNotchOpen ? Y_CLIP : V_CLIP,
                      WebkitClipPath: isNotchOpen ? Y_CLIP : V_CLIP,
                      transition: "clip-path 300ms cubic-bezier(0.5, 0, 0.75, 0)",
                    }}
                    aria-hidden="true"
                    className="jsx-1861366530 lns-tint"
                  />
                  <div
                    style={{
                      clipPath: isNotchOpen ? Y_CLIP : V_CLIP,
                      WebkitClipPath: isNotchOpen ? Y_CLIP : V_CLIP,
                      transition: "clip-path 300ms cubic-bezier(0.5, 0, 0.75, 0)",
                    }}
                    aria-hidden="true"
                    className="jsx-1861366530 lns-shade"
                  />

                  {/* Notch Band: Equalizer audio bars oscillating / VoiceOS Orb */}
                  <div className="lns-band ph-no-capture">
                    <NotchOrb mode={currentMode} size={18} />
                  </div>

                  {/* Notch Card: Live preview card */}
                  <div className="lns-card">
                    {activeCard.type === "gmail" ? (
                      <div className="hero-screen-card-inner">
                        <div className="hero-screen-card-header">
                          <Image
                            src={activeCard.app}
                            alt="Gmail app icon"
                            width={12}
                            height={12}
                          />
                          <span>{activeCard.header}</span>
                        </div>
                        <div className="hero-screen-card-row">
                          <span className="hero-screen-card-label">{activeCard.to}</span>
                          <span className="hero-screen-card-chip">{activeCard.recipient}</span>
                        </div>
                        <div className="hero-screen-card-row hero-screen-card-row--subject">
                          <span className="hero-screen-card-subject">
                            {activeCard.subject.slice(0, typedSubjectLen)}
                            {!isSubjectFinished && <Caret />}
                          </span>
                        </div>
                        <div className="hero-screen-card-body">
                          {isSubjectFinished && (
                            <>
                              {activeCard.body.slice(0, typedBodyLen)}
                              {typedBodyLen < activeCard.body.length && <Caret />}
                            </>
                          )}
                          <span
                            className="hero-screen-card-send"
                            style={{
                              opacity: isSubjectFinished ? 1 : 0,
                              transform: isSendPressed ? "scale(0.92)" : "scale(1)",
                              filter: isSendPressed ? "brightness(0.88)" : "brightness(1)",
                            }}
                          >
                            {activeCard.send}
                          </span>
                        </div>
                      </div>
                    ) : activeCard.type === "calendar" ? (
                      <div className="hero-screen-card-inner hero-screen-card-inner--cal">
                        <div className="hero-screen-card-header hero-screen-card-header--cal">
                          <Image
                            src={activeCard.app}
                            alt="Google Calendar app icon"
                            width={12}
                            height={12}
                          />
                          <span>{activeCard.header}</span>
                        </div>
                        <div className="hero-screen-cal-body">
                          <div className="hero-screen-cal-title">
                            {activeCard.title.slice(0, typedSubjectLen)}
                            {!isSubjectFinished && <Caret />}
                          </div>
                          <div className="hero-screen-cal-field">
                            <svg className="hero-screen-cal-mark" viewBox="0 0 16 16" fill="none">
                              <path d="M8 4.2v4l2.6 1.6M8 1.9a6.1 6.1 0 1 1 0 12.2A6.1 6.1 0 0 1 8 1.9Z" />
                            </svg>
                            <span>{activeCard.when}</span>
                          </div>
                          <div className="hero-screen-cal-field">
                            <svg className="hero-screen-cal-mark" viewBox="0 0 16 16" fill="none">
                              <path d="M8 8.1a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4ZM2.9 13.6c0-2.3 2.3-3.5 5.1-3.5s5.1 1.2 5.1 3.5" />
                            </svg>
                            <span className="hero-screen-card-chip">{activeCard.guest}</span>
                          </div>
                          <div className="hero-screen-cal-field hero-screen-cal-field--meet">
                            <svg className="hero-screen-cal-mark" viewBox="0 0 16 16" fill="none">
                              <path d="M2.4 4.8h6.8v6.4H2.4zM9.2 7.3l4.4-2.3v6l-4.4-2.3z" />
                            </svg>
                            <span>{activeCard.meet}</span>
                          </div>
                          <span
                            className="hero-screen-card-send hero-screen-card-send--cal"
                            style={{
                              opacity: isSubjectFinished ? 1 : 0,
                              transform: isSendPressed ? "scale(0.92)" : "scale(1)",
                              filter: isSendPressed ? "brightness(0.88)" : "brightness(1)",
                            }}
                          >
                            {activeCard.save}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="hero-screen-card-inner hero-screen-card-inner--slack">
                        <div className="hero-screen-card-header--slack">
                          <div className="hero-screen-slack-target">
                            <Image
                              src={activeCard.app}
                              alt="Slack app icon"
                              width={14}
                              height={14}
                              style={{ borderRadius: "3px", flexShrink: 0 }}
                            />
                            <div
                              className="hero-screen-slack-avatar-sm"
                              style={{ background: activeCard.avatarColor }}
                            >
                              {activeCard.recipientInitial}
                            </div>
                            <span className="hero-screen-slack-name">{activeCard.recipientName}</span>
                            <svg
                              width="8"
                              height="5"
                              viewBox="0 0 10 6"
                              fill="none"
                              style={{ flexShrink: 0, opacity: 0.7 }}
                              aria-hidden="true"
                            >
                              <path
                                d="M1 1L5 5L9 1"
                                stroke="#ABABAD"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                          <div className="hero-screen-slack-close" aria-hidden="true">
                            <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
                              <path
                                d="M1 1l8 8M9 1L1 9"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                          </div>
                        </div>

                        {/* Recent context section */}
                        <div className="hero-screen-slack-context">
                          <div
                            className="hero-screen-slack-avatar-md"
                            style={{ background: activeCard.avatarColor }}
                          >
                            {activeCard.recipientInitial}
                          </div>
                          <div className="hero-screen-slack-context-info">
                            <div className="hero-screen-slack-context-top">
                              <span className="hero-screen-slack-context-name">{activeCard.recentContextName}</span>
                              <span className="hero-screen-slack-context-time">{activeCard.recentContextTime}</span>
                            </div>
                            <div className="hero-screen-slack-context-text">
                              {activeCard.recentContextText}
                            </div>
                          </div>
                        </div>

                        {/* Composer box */}
                        <div className="hero-screen-slack-composer-wrap">
                          <div className="hero-screen-slack-composer">
                            <div className="hero-screen-slack-input-text">
                              {typedSlackLen > 0 ? (
                                <>
                                  {activeCard.message.slice(0, typedSlackLen)}
                                  {!isTypingComplete && <Caret />}
                                </>
                              ) : (
                                <span className="hero-screen-slack-placeholder">{activeCard.placeholder}</span>
                              )}
                            </div>
                            <button
                              type="button"
                              aria-label="Send message"
                              tabIndex={-1}
                              className={`hero-screen-slack-send-btn${isSendPressed ? " is-pressed" : ""}`}
                              style={{
                                opacity: isTypingComplete ? 1 : 0.45,
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="white" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
