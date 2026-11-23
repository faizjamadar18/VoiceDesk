"use client";

import React, { useEffect, useRef } from "react";

const TIME_HTML = `<section id="time-savings" class="relative px-4 py-10 md:px-8 md:py-16 bg-transparent overflow-hidden"><div class="relative max-w-6xl mx-auto"><div class="text-center mb-7 md:mb-10"><h2 class="jsx-64b64c55b940cc63 ptr-head is-pointing section-title text-4xl md:text-5xl lg:text-6xl font-normal text-gray-900 tracking-tight">Point <span class="ptr-target"><span class="ptr-wash" aria-hidden="true"></span><span class="ptr-word">anywhere</span><span class="ptr-comet" style="--i:0" aria-hidden="true"></span><span class="ptr-comet" style="--i:1" aria-hidden="true"></span><span class="ptr-comet" style="--i:2" aria-hidden="true"></span><span class="ptr-comet" style="--i:3" aria-hidden="true"></span><span class="ptr-comet" style="--i:4" aria-hidden="true"></span><span class="ptr-comet" style="--i:5" aria-hidden="true"></span><span class="ptr-comet" style="--i:6" aria-hidden="true"></span><span class="ptr-comet" style="--i:7" aria-hidden="true"></span><span class="ptr-comet" style="--i:8" aria-hidden="true"></span><span class="ptr-comet" style="--i:9" aria-hidden="true"></span><span class="ptr-cursor" aria-hidden="true"><svg class="ptr-arrow" viewBox="0 0 20 28" fill="none"><path d="M2 1.5 L2 22 L7.1 17 L10.3 25 L14 23.4 L10.8 15.7 L17.4 15.3 Z"></path></svg><svg class="ptr-click" viewBox="0 0 22 22" fill="none"><path class="ptr-click-mark" d="M11 9 Q11.2 5.2 11.6 2" pathLength="1"></path><path class="ptr-click-mark" d="M6.6 10.4 Q4.6 7.4 2.8 4.6" pathLength="1"></path><path class="ptr-click-mark" d="M15.4 10.6 Q17.6 7.8 19.6 5.2" pathLength="1"></path></svg></span></span> on your screen.</h2><p class="mt-4 text-lg md:text-xl text-gray-500 font-light max-w-2xl mx-auto [text-wrap:balance]">Your cursor is the context. No more explaining, just point and ask.</p></div><div class="flex justify-center"><div class="w-full max-w-4xl aspect-video rounded-2xl overflow-hidden shadow-lg bg-gray-100"><div class="jsx-603730fb00e01a9f relative w-full h-full"><video src="/stopScreenshotsDemo.mp4" poster="/stopScreenshotsDemo-poster.webp" aria-label="Pointing at the screen and asking VoiceDesk about it" muted="" loop="" playsInline="" preload="none" class="jsx-603730fb00e01a9f w-full h-full object-cover cursor-pointer "></video><button type="button" aria-label="Unmute videos" aria-pressed="false" class="jsx-603730fb00e01a9f absolute bottom-3 right-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/25 text-white/80 opacity-40 backdrop-blur-sm transition-opacity duration-200 hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/80"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M23 9l-6 6"></path><path d="M17 9l6 6"></path></svg></button><div class="jsx-603730fb00e01a9f dv-caption-slot pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3 pl-3 pr-14"><p class="jsx-603730fb00e01a9f dv-caption"><span aria-hidden="true" class="jsx-603730fb00e01a9f dv-quote">“</span><span style="--delay:0ms" class="jsx-603730fb00e01a9f dv-word">Can</span> <span style="--delay:90ms" class="jsx-603730fb00e01a9f dv-word">you</span> <span style="--delay:180ms" class="jsx-603730fb00e01a9f dv-word">find</span> <span style="--delay:270ms" class="jsx-603730fb00e01a9f dv-word">his</span> <span style="--delay:360ms" class="jsx-603730fb00e01a9f dv-word">LinkedIn</span><span aria-hidden="true" class="jsx-603730fb00e01a9f dv-quote">”</span></p></div></div></div></div></div></section>`;

export default function TimeSavingsSection() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const video = containerRef.current?.querySelector("video");
    if (video) {
      video.muted = true;
      video.playsInline = true;
      video.play().catch(() => {});
      video.addEventListener("click", () => {
        if (video.paused) video.play();
        else video.pause();
      });
    }
  }, []);

  return <div ref={containerRef} className="contents" dangerouslySetInnerHTML={{ __html: TIME_HTML }} />;
}
