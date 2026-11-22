"use client";

import React, { useState } from "react";

interface FaqItem {
  question: string;
  answerHtml: string;
  plainAnswer: string;
}

const FAQS: FaqItem[] = [
  {
    question: "Is my voice data private?",
    answerHtml:
      "Yes. VoiceDesk transcribes <strong>on your PC</strong>, and your audio stays in memory — it is <strong>never uploaded or stored</strong>. Transcripts are saved on your device, and nothing is used to train models. Cloud speech and AI only run if you <strong>add your own key</strong>, and the request goes straight to that provider. There is <strong>no VoiceDesk cloud in between</strong>.",
    plainAnswer:
      "Yes. VoiceDesk transcribes on your PC, and your audio stays in memory — it is never uploaded or stored. Transcripts are saved on your device, and nothing is used to train models. Cloud speech and AI only run if you add your own key, and the request goes straight to that provider. There is no VoiceDesk cloud in between.",
  },
  {
    question: "Which apps does VoiceDesk work with?",
    answerHtml:
      "The ones you already use. Hold <strong>Ctrl+Space</strong> and speak while Gmail, Slack, Notion, Google Docs, Outlook, Cursor, VS Code, WhatsApp, Messages or any other app is in front of you — VoiceDesk types and acts right there, <strong>without pulling you out of it</strong>.",
    plainAnswer:
      "The ones you already use. Hold Ctrl+Space and speak while Gmail, Slack, Notion, Google Docs, Outlook, Cursor, VS Code, WhatsApp, Messages or any other app is in front of you — VoiceDesk types and acts right there, without pulling you out of it.",
  },
  {
    question: "What do I need to run it?",
    answerHtml:
      "A <strong>Windows 10 or 11</strong> PC and a microphone. During setup you allow three things — your microphone, accessibility (so it can type for you) and screen recording (so it can answer questions about your screen). Speech runs <strong>on your machine</strong>, so it starts fast and stays private.",
    plainAnswer:
      "A Windows 10 or 11 PC and a microphone. During setup you allow three things — your microphone, accessibility (so it can type for you) and screen recording (so it can answer questions about your screen). Speech runs on your machine, so it starts fast and stays private.",
  },
];

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.plainAnswer,
    },
  })),
};

/**
 * Frequently Asked Questions (FAQ) accordion section with structured metadata.
 *
 * Renders localized security, app compatibility, and architecture answers while
 * injecting `schema.org/FAQPage` JSON-LD markup into the document tree for search
 * engine rich snippet optimization.
 */
export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }}
      />
      <section
        id="faq"
        className="jsx-2ae46a08699e61e9 relative px-4 py-24 md:px-8 md:py-32 overflow-hidden bg-transparent"
      >
        <div className="jsx-2ae46a08699e61e9 relative max-w-4xl mx-auto">
          <div className="jsx-2ae46a08699e61e9 text-center mb-16">
            <h2 className="jsx-2ae46a08699e61e9 section-title text-5xl md:text-6xl font-normal text-gray-900 mb-6 tracking-tight">
              Questions?
            </h2>
          </div>
          <div className="jsx-2ae46a08699e61e9 liquid-glass-card rounded-3xl overflow-hidden p-3">
            {FAQS.map((item, index) => {
              const isOpen = openIndex === index;
              return (
                <div key={item.question} className="jsx-2ae46a08699e61e9">
                  <button
                    type="button"
                    onClick={() => toggleFaq(index)}
                    style={{ WebkitTapHighlightColor: "transparent", outline: "none" }}
                    aria-expanded={isOpen}
                    className="jsx-2ae46a08699e61e9 w-full text-left px-8 py-5 flex justify-between items-center outline-none focus:outline-none focus-visible:outline-none border-none focus:border-none transition-all duration-200 hover:bg-white/30 rounded-xl cursor-pointer"
                  >
                    <span className="jsx-2ae46a08699e61e9 text-base md:text-lg font-normal text-gray-900 pr-6">
                      {item.question}
                    </span>
                    <svg
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      className={`jsx-2ae46a08699e61e9 w-5 h-5 text-gray-400 shrink-0 transition-transform duration-200 ${
                        isOpen ? "transform rotate-180" : ""
                      }`}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                        className="jsx-2ae46a08699e61e9"
                      />
                    </svg>
                  </button>
                  <div
                    className={`jsx-2ae46a08699e61e9 overflow-hidden transition-all duration-200 ${
                      isOpen ? "max-h-96" : "max-h-0"
                    }`}
                  >
                    <div
                      dangerouslySetInnerHTML={{ __html: item.answerHtml }}
                      className="jsx-2ae46a08699e61e9 px-8 pb-5 text-gray-600 leading-relaxed font-light [&_strong]:font-medium [&_strong]:text-gray-800"
                    />
                  </div>
                  {index < FAQS.length - 1 && (
                    <div className="jsx-2ae46a08699e61e9 border-b border-gray-100/50 mx-8" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
