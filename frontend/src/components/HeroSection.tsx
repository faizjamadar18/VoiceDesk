"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";

export default function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMac] = useState(() => {
    if (typeof window !== "undefined") {
      return !window.navigator.userAgent.toLowerCase().includes("win");
    }
    return true;
  });

  useEffect(() => {
    // Auto-open notch after a short delay
    const timer = setTimeout(() => {
      const notch = containerRef.current?.querySelector(".hero-screen-notch");
      if (notch) {
        notch.classList.add("is-open");
      }
    }, 600);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={containerRef} className="contents">
      <section id="hero">
        <div className="relative overflow-hidden" style={{ minHeight: "min(100vh, 1200px)", backgroundColor: "transparent" }}>
          {/* Corner blurred borders */}
          <div aria-hidden="true" style={{ position: "absolute", width: "220px", height: "220px", zIndex: 4, pointerEvents: "none", top: "28px", left: "28px", borderTop: "3px solid #ebebeb", borderBottom: "none", borderLeft: "3px solid #ebebeb", borderRight: "none", borderTopLeftRadius: "30px", filter: "blur(12px)", boxShadow: "-2px 0 0 0 white, 0 -2px 0 0 white" }} />
          <div aria-hidden="true" style={{ position: "absolute", width: "220px", height: "220px", zIndex: 4, pointerEvents: "none", top: "28px", right: "28px", borderTop: "3px solid #ebebeb", borderBottom: "none", borderLeft: "none", borderRight: "3px solid #ebebeb", borderTopRightRadius: "30px", filter: "blur(12px)", boxShadow: "2px 0 0 0 white, 0 -2px 0 0 white" }} />
          <div aria-hidden="true" style={{ position: "absolute", width: "220px", height: "220px", zIndex: 4, pointerEvents: "none", bottom: "28px", left: "28px", borderTop: "none", borderBottom: "3px solid #ebebeb", borderLeft: "3px solid #ebebeb", borderRight: "none", borderBottomLeftRadius: "30px", filter: "blur(12px)", boxShadow: "-2px 0 0 0 white, 0 2px 0 0 white" }} />
          <div aria-hidden="true" style={{ position: "absolute", width: "220px", height: "220px", zIndex: 4, pointerEvents: "none", bottom: "28px", right: "28px", borderTop: "none", borderBottom: "3px solid #ebebeb", borderLeft: "none", borderRight: "3px solid #ebebeb", borderBottomRightRadius: "30px", filter: "blur(12px)", boxShadow: "2px 0 0 0 white, 0 2px 0 0 white" }} />

          <div className="relative z-[5] flex flex-col items-center justify-center px-4 md:px-6 pt-24 pb-10" style={{ minHeight: "min(100vh, 1200px)" }}>
            <div className="relative text-center max-w-4xl" style={{ zIndex: 3 }}>
              {/* Backed by Y Combinator */}
              <div className="inline-flex items-center gap-2 mb-4">
                <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "#767676", letterSpacing: "-0.01em" }}>Backed by</span>
                <Image src="/YCombinatorIcon.svg" alt="Y" width={18} height={18} style={{ display: "block" }} />
                <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "#767676", letterSpacing: "-0.01em" }}>Combinator</span>
              </div>

              {/* Title */}
              <h1 className="section-title mb-6 leading-tight" style={{ fontSize: "clamp(2.1rem, 10.2vw, 4.75rem)", fontWeight: 600, letterSpacing: "-0.03em", whiteSpace: "pre-line" }}>
                <span className="chroma-text" style={{ fontWeight: 600, backgroundImage: "linear-gradient(90deg, #0a0a0a 0%, #0a0a0a 33.33%, #1e3a8a 40%, #2563eb 45%, #c9a84c 50%, #dbeafe 55%, #0358f7 60%, #0a0a0a 66.67%, #0a0a0a)" }}>
                  Voice assistant{"\n"}at your fingertips
                </span>
              </h1>

              {/* CTA Button */}
              <div className="relative z-[4] flex items-center justify-center">
                <div className="glassmorphic-button-wrap w-full md:w-auto">
                  <a
                    href={isMac ? "https://api.voiceos.com/delivery/releases/primary/VoiceOS-Installer.dmg" : "#download"}
                    title="Download VoiceOS"
                    className="glassmorphic-button w-full md:w-auto"
                  >
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", position: "relative", zIndex: 4 }}>
                      {isMac ? (
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
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
                  <source media="(max-width: 767px)" srcSet="/skyCloudsHero-mobile.webp" className="jsx-1573246498" />
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

                <div className="hero-trail-layer" aria-hidden="true" />

                {/* Animated cursor hint */}
                <div aria-hidden="true" className="jsx-ab60216bc43f7d98 hero-cursor-hint">
                  <div className="jsx-ab60216bc43f7d98 hero-cursor-hint-wander">
                    <div className="jsx-ab60216bc43f7d98 hero-cursor-hint-jiggle">
                      <svg viewBox="0 0 20 28" fill="none" className="jsx-ab60216bc43f7d98">
                        <path d="M2 1.5 L2 22 L7.1 17 L10.3 25 L14 23.4 L10.8 15.7 L17.4 15.3 Z" className="jsx-ab60216bc43f7d98" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="jsx-1573246498 hero-screen-menubar" />

                {/* MacBook Notch with Liquid Glass and Gmail preview */}
                <div className="jsx-1861366530 lns hero-screen-notch is-open">
                  <div aria-hidden="true" className="jsx-1861366530 lns-glass" />
                  <div
                    style={{
                      clipPath:
                        "polygon(0.000px 0.000px, calc(100% - 0.000px) 0.000px, calc(100% - 1.085px) 2.066px, calc(100% - 2.154px) 2.262px, calc(100% - 3.191px) 2.585px, calc(100% - 4.183px) 3.031px, calc(100% - 5.113px) 3.593px, calc(100% - 5.968px) 4.263px, calc(100% - 6.737px) 5.032px, calc(100% - 7.407px) 5.887px, calc(100% - 7.969px) 6.817px, calc(100% - 8.415px) 7.809px, calc(100% - 8.738px) 8.846px, calc(100% - 8.934px) 9.915px, calc(100% - 9.000px) 11.000px, calc(100% - 9.000px) calc(100% - 19.000px), calc(100% - 9.116px) calc(100% - 15.741px), calc(100% - 9.461px) calc(100% - 13.229px), calc(100% - 10.035px) calc(100% - 10.992px), calc(100% - 10.832px) calc(100% - 8.967px), calc(100% - 11.847px) calc(100% - 7.140px), calc(100% - 13.075px) calc(100% - 5.508px), calc(100% - 14.508px) calc(100% - 4.075px), calc(100% - 16.140px) calc(100% - 2.847px), calc(100% - 17.967px) calc(100% - 1.832px), calc(100% - 19.992px) calc(100% - 1.035px), calc(100% - 22.229px) calc(100% - 0.461px), calc(100% - 24.741px) calc(100% - 0.116px), calc(100% - 28.000px) calc(100% - 0.000px), 28.000px calc(100% - 0.000px), 24.741px calc(100% - 0.116px), 22.229px calc(100% - 0.461px), 19.992px calc(100% - 1.035px), 17.967px calc(100% - 1.832px), 16.140px calc(100% - 2.847px), 14.508px calc(100% - 4.075px), 13.075px calc(100% - 5.508px), 11.847px calc(100% - 7.140px), 10.832px calc(100% - 8.967px), 10.035px calc(100% - 10.992px), 9.461px calc(100% - 13.229px), 9.116px calc(100% - 15.741px), 9.000px calc(100% - 19.000px), 9.000px 11.000px, 8.934px 9.915px, 8.738px 8.846px, 8.415px 7.809px, 7.969px 6.817px, 7.407px 5.887px, 6.737px 5.032px, 5.968px 4.263px, 5.113px 3.593px, 4.183px 3.031px, 3.191px 2.585px, 2.154px 2.262px, 1.085px 2.066px)",
                    }}
                    aria-hidden="true"
                    className="jsx-1861366530 lns-tint"
                  />
                  <div className="lns-band ph-no-capture">
                    <div style={{ position: "relative", width: "22px", height: "18px", flexShrink: 0, pointerEvents: "none" }} aria-hidden="true">
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                        <div style={{ width: "2.5px", height: "8px", margin: "0 1.5px", borderRadius: "50%", background: "#3b82f6" }} />
                        <div style={{ width: "2.5px", height: "14px", margin: "0 1.5px", borderRadius: "50%", background: "#60a5fa" }} />
                        <div style={{ width: "2.5px", height: "10px", margin: "0 1.5px", borderRadius: "50%", background: "#3b82f6" }} />
                        <div style={{ width: "2.5px", height: "6px", margin: "0 1.5px", borderRadius: "50%", background: "#93c5fd" }} />
                      </div>
                    </div>
                  </div>

                  <div className="lns-card">
                    <div className="hero-screen-card-inner">
                      <div className="hero-screen-card-header">
                        <Image src="/icons/gmailApp.webp" alt="Gmail app icon" width={12} height={12} />
                        <span>New Message</span>
                      </div>
                      <div className="hero-screen-card-row">
                        <span className="hero-screen-card-label">To</span>
                        <span className="hero-screen-card-chip">david@company.com</span>
                      </div>
                      <div className="hero-screen-card-row hero-screen-card-row--subject">
                        <span className="hero-screen-card-subject">
                          VoiceOS demo update
                          <span style={{ display: "inline-block", width: "2px", height: "0.9em", marginLeft: "1px", background: "#E8EAED", verticalAlign: "text-bottom", animation: "hero-screen-caret 0.8s step-end infinite" }} />
                        </span>
                      </div>
                      <div className="hero-screen-card-body">
                        Hi David, here is the quick VoiceOS summary deck we discussed!
                        <span className="hero-screen-card-send" style={{ opacity: 1 }}>Send</span>
                      </div>
                    </div>
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
