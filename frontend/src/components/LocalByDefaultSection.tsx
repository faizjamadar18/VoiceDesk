"use client";

import React, { useState } from "react";
import Image from "next/image";

interface ProviderItem {
  name: string;
  by?: string;
  logo: string;
}

interface ProviderGroup {
  title: string;
  items: ProviderItem[];
}

const GROUPS: ProviderGroup[] = [
  {
    title: "On your device",
    items: [
      { name: "Parakeet", by: "NVIDIA", logo: "nvidia" },
      { name: "Nemotron", by: "NVIDIA", logo: "nvidia" },
      { name: "Whisper", by: "OpenAI", logo: "openai" },
    ],
  },
  {
    title: "Cloud speech, your key",
    items: [
      { name: "Mistral", logo: "mistral" },
      { name: "Groq", logo: "groq" },
      { name: "Deepgram", logo: "deepgram" },
      { name: "ElevenLabs", logo: "elevenlabs" },
      { name: "AssemblyAI", logo: "assemblyai" },
      { name: "Soniox", logo: "soniox" },
      { name: "Speechmatics", logo: "speechmatics" },
      { name: "Cartesia", logo: "cartesia" },
      { name: "Sarvam", logo: "sarvam" },
      { name: "xAI", logo: "xai" },
      { name: "OpenAI", logo: "openai" },
      { name: "Gemini", logo: "gemini" },
    ],
  },
  {
    title: "AI, your key",
    items: [
      { name: "OpenAI", logo: "openai" },
      { name: "Anthropic", logo: "anthropic" },
      { name: "Gemini", logo: "gemini" },
      { name: "Groq", logo: "groq" },
      { name: "DeepSeek", logo: "deepseek" },
      { name: "OpenRouter", logo: "openrouter" },
      { name: "Azure OpenAI", logo: "azure" },
      { name: "Cerebras", logo: "cerebras" },
      { name: "AWS Bedrock", logo: "bedrock" },
      { name: "Ollama", logo: "ollama" },
      { name: "LM Studio", logo: "lmstudio" },
    ],
  },
];

export default function LocalByDefaultSection() {
  const [isNetOn, setIsNetOn] = useState(true);

  return (
    <section id="private" className="v-section l-sec l-priv" aria-labelledby="priv-title">
      <div className="v-container">
        <header className="l-head">
          <h2 id="priv-title" className="t-d2 m-0">
            Local by default. Your own keys for the rest.
          </h2>
          <p className="t-subtitle l-head__sub">
            Parakeet, Nemotron and Whisper run on your Mac or PC with no network at all. Cloud speech and AI only run when you add your own key, and the request goes straight to that provider.{" "}
            <strong className="l-priv__strong">There is no VoiceOS cloud in between.</strong>
          </p>
        </header>

        <div className="l-grid" data-net={isNetOn ? "on" : "off"}>
          {GROUPS.map((group, groupIndex) => (
            <div key={group.title} className={`l-grid__group l-grid__group--${groupIndex}`}>
              <div className="l-grid__side">
                <h3 className="l-grid__title">{group.title}</h3>
                {groupIndex === 0 && (
                  <div className="l-net">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isNetOn}
                      className="l-net__sw"
                      onClick={() => setIsNetOn((prev) => !prev)}
                    >
                      <span className="l-net__wifi" aria-hidden="true">
                        <svg
                          viewBox="0 0 20 16"
                          width="16"
                          height="13"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        >
                          <path d="M1.5 5.5a12 12 0 0 1 17 0M4.5 8.6a7.6 7.6 0 0 1 11 0M7.6 11.6a3.2 3.2 0 0 1 4.8 0" />
                          <circle cx="10" cy="14.2" r="0.9" fill="currentColor" stroke="none" />
                          {!isNetOn && <path d="M3 1.5l14 13" />}
                        </svg>
                      </span>
                      <span>Wi-Fi</span>
                      <span className="l-net__track" aria-hidden="true">
                        <span className="l-net__knob" />
                      </span>
                      <span className="l-net__state">{isNetOn ? "On" : "Off"}</span>
                    </button>
                    <p className="l-net__msg">
                      <span className="l-net__hint" aria-hidden="true">
                        Try it: turn Wi-Fi off.
                      </span>
                      <span className="l-net__note" aria-hidden="true">
                        Nothing changed. That is the point.
                      </span>
                      <span className="sr-only" aria-live="polite">
                        {isNetOn ? "Try it: turn Wi-Fi off." : "Nothing changed. That is the point."}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              <ul className="l-grid__list">
                {group.items.map((item) => {
                  const size = groupIndex === 0 ? 36 : 28;
                  return (
                    <li key={`${group.title}-${item.name}`} className="l-grid__cell">
                      <Image
                        className="l-grid__logo"
                        src={`/logos/color/providers/${item.logo}-tile.webp`}
                        alt=""
                        width={size}
                        height={size}
                        unoptimized
                        loading="lazy"
                        decoding="async"
                      />
                      <span>
                        {item.name}
                        {item.by && <small>{item.by}</small>}
                      </span>
                      {groupIndex === 0 && (
                        <span className="l-grid__ok" aria-hidden={isNetOn}>
                          <svg
                            viewBox="0 0 12 12"
                            width="10"
                            height="10"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M2.5 6.3l2.3 2.2 4.7-5" />
                          </svg>
                          Works offline
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
