/*
 * VoiceOS notch agent-voice personas + orb textures - VERBATIM PORT.
 *
 * Source: VoiceOS 0.1.40 `out/renderer/assets/index-BKi3REhQ.js`
 *   - AGENT_VOICE_OPTIONS         @ 38516-38621
 *   - getAgentVoiceOptionById     @ 38649-38650
 *   - cloud texture URLs          @ 48846, 72211-72213, 201198
 *   - getAgentVoiceCloudImage     @ 72215-72220
 *   - AGENT_VOICE_CUSTOM_ICONS    @ 72221-72230
 *
 * Only the fields the notch UI reads are kept (name, glow colour, cloud tone,
 * optional custom icon). The TTS/provider fields are intentionally dropped -
 * this module drives the orb's look, not any voice synthesis.
 */

import cloudsDarkBlue from "./assets/darkBlueClouds.png";
import cloudsOrange from "./assets/orangeClouds.png";
import cloudsPink from "./assets/pinkClouds.png";
import cloudsBlue from "./assets/cloudsBlue.png";
import jarvisReactor from "./assets/jarvisReactor.png";

/** The four cloud textures the orb can wear (48846, 72211-72213). */
const CLOUD_TEXTURE_BY_TONE: Record<string, string> = {
  blue: cloudsBlue,
  darkBlue: cloudsDarkBlue,
  orange: cloudsOrange,
  pink: cloudsPink
};

export type CloudTone = "blue" | "darkBlue" | "orange" | "pink";

export interface AgentVoiceOption {
  id: string;
  name: string;
  description: string;
  /** Halo colour behind the orb - exact values from AGENT_VOICE_OPTIONS. */
  glowColor: string;
  cloudTone: CloudTone;
}

/** AGENT_VOICE_OPTIONS - 38516-38621 (persona fields only). */
export const AGENT_VOICE_OPTIONS: AgentVoiceOption[] = [
  {
    id: "gemini-live-zephyr",
    name: "Sky",
    description: "Warm and friendly",
    glowColor: "rgba(56, 189, 248, 0.5)",
    cloudTone: "blue"
  },
  {
    id: "gemini-live-umbriel",
    name: "Dawn",
    description: "Energetic and upbeat",
    glowColor: "rgba(251, 146, 60, 0.5)",
    cloudTone: "orange"
  },
  {
    id: "gemini-live-laomedeia",
    name: "Dusk",
    description: "Smooth and balanced",
    glowColor: "rgba(168, 85, 247, 0.45)",
    cloudTone: "pink"
  },
  {
    id: "gemini-live-midnight",
    name: "Midnight",
    description: "Deep and steady",
    glowColor: "rgba(147, 197, 253, 0.55)",
    cloudTone: "darkBlue"
  },
  {
    id: "xai-leo",
    name: "Jarvis",
    description: "Authoritative and strong",
    glowColor: "rgba(147, 197, 253, 0.55)",
    cloudTone: "darkBlue"
  }
];

export const DEFAULT_AGENT_VOICE_ID = AGENT_VOICE_OPTIONS[0].id;

/** getAgentVoiceOptionById(id) - 38649-38650. */
export function getAgentVoiceOptionById(
  id: string | null | undefined
): AgentVoiceOption {
  return (
    AGENT_VOICE_OPTIONS.find((option) => option.id === id) ??
    AGENT_VOICE_OPTIONS[0]
  );
}

/** getAgentVoiceCloudImage(tone) - 72215-72220. */
export function getAgentVoiceCloudImage(tone: string): string {
  return CLOUD_TEXTURE_BY_TONE[tone] ?? cloudsBlue;
}

/** AGENT_VOICE_CUSTOM_ICONS - 72221-72227. */
const AGENT_VOICE_CUSTOM_ICONS: Record<string, string> = {
  "xai-leo": jarvisReactor,
  "fish-jarvis": jarvisReactor
};

/** getAgentVoiceCustomIcon(voiceId) - 72228-72230. */
export function getAgentVoiceCustomIcon(voiceId: string): string | undefined {
  return AGENT_VOICE_CUSTOM_ICONS[voiceId];
}
