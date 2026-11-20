"use client";

import React, { useEffect, useRef, useState } from "react";

export default function PrivacySection() {
  const [isLocked, setIsLocked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = containerRef.current?.querySelector("#privacy-section");
    if (section) {
      section.setAttribute("data-load-photos", "true");
      section.setAttribute("data-locked", isLocked ? "true" : "false");
    }
  }, [isLocked]);

  return (
    <div ref={containerRef} className="contents">
      <section
        id="privacy-section"
        data-locked={isLocked ? "true" : "false"}
        data-load-photos="true"
        className="relative pt-12 pb-0 md:pt-20 md:pb-0 overflow-hidden bg-transparent"
      >
        <div className="pv-card relative w-full overflow-hidden rounded-[90px] md:rounded-[180px] px-4 sm:px-10 md:px-14 lg:px-16 pt-[84px] md:pt-[87px] pb-0">
          <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
            <div className="pv-sky pv-sky--day" />
            <div className="pv-sky pv-sky--night" />
            <div className="pv-scrim" />
            <div className="pv-stars">
              <span className="pv-stars-layer pv-stars-layer--1" />
              <span className="pv-stars-layer pv-stars-layer--2" />
              <span className="pv-stars-layer pv-stars-layer--3" />
              <span className="pv-stars-layer pv-stars-layer--4" />
            </div>
          </div>

          <div className="pv-copy relative z-10 max-w-3xl mx-auto flex flex-col items-center mb-14 sm:mb-16 md:mb-20">
            <div className="mb-7">
              <div className="pv-holder">
                <span className="pv-holder-label">Privacy</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isLocked}
                  aria-label="Privacy mode"
                  className="pv-toggle"
                  onClick={() => setIsLocked(!isLocked)}
                >
                  <span className="pv-knob" aria-hidden="true">
                    <svg className="pv-lock pv-lock--open" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="5" y="10" width="14" height="10" rx="2.5" fill="currentColor" />
                      <path d="M8.5 10V7.5a3.5 3.5 0 0 1 6.9-.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <svg className="pv-lock pv-lock--closed" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <rect x="5" y="10" width="14" height="10" rx="2.5" fill="currentColor" />
                      <path d="M8.5 10V7.5a3.5 3.5 0 1 1 7 0V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                </button>
              </div>
            </div>

            <h2 className="text-center text-3xl md:text-[2.75rem] lg:text-5xl leading-[1.15] tracking-tight font-semibold mb-5">
              Nothing leaves<br />unless you choose
            </h2>
            <p className="pv-copy-lede text-center text-base md:text-lg leading-relaxed max-w-xl font-medium">
              Your audio never touches a VoiceDesk server and is never used to train models. Local by default, cloud only with your own key.
            </p>
          </div>

          <div className="relative z-10">
            <div className="pv-window w-full max-w-xl mx-auto overflow-hidden">
              <div className="pv-titlebar">
                <span className="pv-dot pv-dot--red" />
                <span className="pv-dot pv-dot--amber" />
                <span className="pv-dot pv-dot--green" />
                <span className="pv-titlebar-name">Privacy</span>
              </div>
              <div className="pv-body">
                <p className="pv-group">On your device</p>
                <div className="pv-rows">
                  <div className="pv-row">
                    <span className="pv-row-label">Save transcripts on this device</span>
                    <span className="pv-val">Always local</span>
                  </div>
                  <div className="pv-row">
                    <span className="pv-row-label">Keep audio on this PC by default</span>
                    <span className="pv-val">On this PC</span>
                  </div>
                  <div className="pv-row">
                    <span className="pv-row-label">Never use my dictation to train AI models</span>
                    <span className="pv-val">No training</span>
                  </div>
                </div>
                <p className="pv-group">Cloud, your key</p>
                <div className="pv-rows">
                  <div className="pv-row">
                    <span className="pv-row-label">Send audio to the provider I choose</span>
                    <span className="pv-val">Your key only</span>
                  </div>
                </div>
                <p className="pv-note">The request goes straight there. There is no VoiceDesk cloud in between.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
