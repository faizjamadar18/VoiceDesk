"use client";

import React, { useEffect, useRef } from "react";

const FAQ_HTML = `<section id="faq" class="jsx-2ae46a08699e61e9 relative px-4 py-24 md:px-8 md:py-32 overflow-hidden bg-transparent"><div class="jsx-2ae46a08699e61e9 relative max-w-4xl mx-auto"><div class="jsx-2ae46a08699e61e9 text-center mb-16"><h2 class="jsx-2ae46a08699e61e9 section-title text-5xl md:text-6xl font-normal text-gray-900 mb-6 tracking-tight">Questions?</h2></div><div class="jsx-2ae46a08699e61e9 liquid-glass-card rounded-3xl overflow-hidden p-3"><div class="jsx-2ae46a08699e61e9"><button style="-webkit-tap-highlight-color:transparent;outline:none" aria-expanded="false" class="jsx-2ae46a08699e61e9 w-full text-left px-8 py-5 flex justify-between items-center outline-none focus:outline-none focus-visible:outline-none border-none focus:border-none transition-all duration-200 hover:bg-white/30 rounded-xl"><span class="jsx-2ae46a08699e61e9 text-base md:text-lg font-normal text-gray-900 pr-6">How is VoiceDesk different from traditional speech recognition?</span><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" class="jsx-2ae46a08699e61e9 w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 "><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" class="jsx-2ae46a08699e61e9"></path></svg></button><div class="jsx-2ae46a08699e61e9 overflow-hidden transition-all duration-200 max-h-0"><div class="jsx-2ae46a08699e61e9 px-8 pb-5 text-gray-600 leading-relaxed font-light [&amp;_strong]:font-medium [&amp;_strong]:text-gray-800">VoiceDesk uses advanced AI to go beyond basic speech-to-text. While Windows Dictation transcribes exactly what you say (including 'um' and 'uh'), VoiceDesk <strong>automatically removes filler words</strong>, fixes grammar, and formats your text professionally. It's like having an <strong>editor built in</strong>, perfect for emails, documents, and messaging.</div></div><div class="jsx-2ae46a08699e61e9 border-b border-gray-100/50 mx-8"></div></div><div class="jsx-2ae46a08699e61e9"><button style="-webkit-tap-highlight-color:transparent;outline:none" aria-expanded="false" class="jsx-2ae46a08699e61e9 w-full text-left px-8 py-5 flex justify-between items-center outline-none focus:outline-none focus-visible:outline-none border-none focus:border-none transition-all duration-200 hover:bg-white/30 rounded-xl"><span class="jsx-2ae46a08699e61e9 text-base md:text-lg font-normal text-gray-900 pr-6">Is my data private and secure with VoiceDesk?</span><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" class="jsx-2ae46a08699e61e9 w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 "><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" class="jsx-2ae46a08699e61e9"></path></svg></button><div class="jsx-2ae46a08699e61e9 overflow-hidden transition-all duration-200 max-h-0"><div class="jsx-2ae46a08699e61e9 px-8 pb-5 text-gray-600 leading-relaxed font-light [&amp;_strong]:font-medium [&amp;_strong]:text-gray-800">Absolutely. VoiceDesk processes your audio in real time and <strong>never stores it</strong> unless you give permission to help improve the product. Your transcripts are <strong>saved locally on your device</strong>, giving you full control over them. None of your data is used for training or shared with anyone. Privacy and security are built into everything we do.</div></div><div class="jsx-2ae46a08699e61e9 border-b border-gray-100/50 mx-8"></div></div><div class="jsx-2ae46a08699e61e9"><button style="-webkit-tap-highlight-color:transparent;outline:none" aria-expanded="false" class="jsx-2ae46a08699e61e9 w-full text-left px-8 py-5 flex justify-between items-center outline-none focus:outline-none focus-visible:outline-none border-none focus:border-none transition-all duration-200 hover:bg-white/30 rounded-xl"><span class="jsx-2ae46a08699e61e9 text-base md:text-lg font-normal text-gray-900 pr-6">What apps does VoiceDesk work with?</span><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" class="jsx-2ae46a08699e61e9 w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-200 "><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" class="jsx-2ae46a08699e61e9"></path></svg></button><div class="jsx-2ae46a08699e61e9 overflow-hidden transition-all duration-200 max-h-0"><div class="jsx-2ae46a08699e61e9 px-8 pb-5 text-gray-600 leading-relaxed font-light [&amp;_strong]:font-medium [&amp;_strong]:text-gray-800">VoiceDesk works seamlessly across <strong>your favorite apps</strong> like Gmail, Slack, Notion, Google Docs, iMessage, WhatsApp, and more. Whether you're writing code in Cursor, chatting in Messenger, or drafting in Obsidian, VoiceDesk is there to help you <strong>communicate faster</strong>.</div></div></div></div></div></section>`;

export default function FaqSection() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const buttons = containerRef.current?.querySelectorAll("button");
    if (!buttons) return;

    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        const answer = btn.nextElementSibling as HTMLElement | null;
        if (answer) {
          const isOpen = answer.style.maxHeight && answer.style.maxHeight !== "0px";
          if (isOpen) {
            answer.style.maxHeight = "0px";
            answer.style.opacity = "0";
          } else {
            answer.style.maxHeight = answer.scrollHeight + "px";
            answer.style.opacity = "1";
          }
        }
      });
    });
  }, []);

  return <div ref={containerRef} className="contents" dangerouslySetInnerHTML={{ __html: FAQ_HTML }} />;
}
