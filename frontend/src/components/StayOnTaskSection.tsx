"use client";

import React, { useEffect, useRef } from "react";

const SOT_HTML = `<section id="stay-on-task" class="jsx-81ce0aeed2761d16 relative px-4 py-16 md:px-8 md:py-24 bg-transparent overflow-hidden"><div class="jsx-81ce0aeed2761d16 relative max-w-6xl mx-auto"><div class="jsx-81ce0aeed2761d16 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center"><div class="jsx-81ce0aeed2761d16 flex justify-center order-2 lg:order-1"><div class="jsx-81ce0aeed2761d16 w-full max-w-lg aspect-video rounded-2xl overflow-hidden shadow-lg bg-gray-100"><div class="jsx-603730fb00e01a9f relative w-full h-full"><video src="/stayOnTaskDemo.mp4" poster="/stayOnTaskDemo-poster.webp" aria-label="A VoiceDesk reminder card on a Mac desktop, with the notch listening above it" muted="" loop="" playsInline="" preload="none" class="jsx-603730fb00e01a9f w-full h-full object-cover cursor-pointer "></video><button type="button" aria-label="Unmute videos" aria-pressed="false" class="jsx-603730fb00e01a9f absolute bottom-3 right-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/25 text-white/80 opacity-40 backdrop-blur-sm transition-opacity duration-200 hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/80"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M23 9l-6 6"></path><path d="M17 9l6 6"></path></svg></button><div class="jsx-603730fb00e01a9f dv-caption-slot pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3 pl-3 pr-14"><p class="jsx-603730fb00e01a9f dv-caption"><span aria-hidden="true" class="jsx-603730fb00e01a9f dv-quote">“</span><span style="--delay:0ms" class="jsx-603730fb00e01a9f dv-word">Remind</span> <span style="--delay:90ms" class="jsx-603730fb00e01a9f dv-word">me</span> <span style="--delay:180ms" class="jsx-603730fb00e01a9f dv-word">to</span> <span style="--delay:270ms" class="jsx-603730fb00e01a9f dv-word">send</span> <span style="--delay:360ms" class="jsx-603730fb00e01a9f dv-word">Maya</span> <span style="--delay:450ms" class="jsx-603730fb00e01a9f dv-word">the</span> <span style="--delay:540ms" class="jsx-603730fb00e01a9f dv-word">deck</span><span aria-hidden="true" class="jsx-603730fb00e01a9f dv-quote">”</span></p></div></div></div></div><div class="jsx-81ce0aeed2761d16 flex flex-col justify-center order-1 lg:order-2 text-center lg:text-left"><h2 class="jsx-81ce0aeed2761d16 section-title text-4xl md:text-5xl lg:text-6xl font-normal text-gray-900 mb-6 tracking-tight">Agent <span class="sot-word">keeps you<span class="sot-shake-stage" aria-hidden="true"><span class="sot-shake"><span class="sot-shake-glyph">🤝</span></span></span></span> <br class="jsx-81ce0aeed2761d16"/>on <span class="jsx-81ce0aeed2761d16 sot-tick-anchor">task.<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="jsx-81ce0aeed2761d16 sot-tick"><g class="jsx-81ce0aeed2761d16 sot-tick-mark"><rect x="3.4" y="4.6" width="15.8" height="15.8" class="jsx-81ce0aeed2761d16 sot-tick-box"></rect><path d="M6.8 13 L10.6 17.2 L22.4 3.2" class="jsx-81ce0aeed2761d16 sot-tick-check"></path></g><g class="jsx-81ce0aeed2761d16 sot-tick-bits"><circle style="--dx:1;--dy:-1;--i:0" r="0.9" class="jsx-81ce0aeed2761d16"></circle><circle style="--dx:1.35;--dy:-0.1;--i:2" r="0.7" class="jsx-81ce0aeed2761d16"></circle><circle style="--dx:0.3;--dy:-1.3;--i:1" r="0.8" class="jsx-81ce0aeed2761d16"></circle><circle style="--dx:1.2;--dy:-0.72;--i:3" r="0.58" class="jsx-81ce0aeed2761d16"></circle><circle style="--dx:-0.25;--dy:-1.1;--i:2" r="0.62" class="jsx-81ce0aeed2761d16"></circle><circle style="--dx:0.72;--dy:-1.45;--i:4" r="0.5" class="jsx-81ce0aeed2761d16"></circle></g></svg></span></h2><p class="jsx-81ce0aeed2761d16 text-lg md:text-xl text-gray-500 leading-relaxed max-w-xl mx-auto lg:mx-0 font-light md:mt-6">Say it once and let it go. VoiceDesk keeps track of the task and brings it back at the right time, so nothing sits in your head.</p></div></div></div></section>`;

export default function StayOnTaskSection() {
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

  return <div ref={containerRef} className="contents" dangerouslySetInnerHTML={{ __html: SOT_HTML }} />;
}
