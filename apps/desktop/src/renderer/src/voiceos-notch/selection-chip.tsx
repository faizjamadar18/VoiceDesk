/*
 * VoiceOS selected-text context UI - VERBATIM PORT.
 *
 * Source: VoiceOS 0.1.40 `out/renderer/assets/index-BKi3REhQ.js`
 *   - buildAgentNotchContextItems @ ~9952500 (selected-text item builder)
 *   - NotchContextStack            @ ~9951000 (inline context stack)
 *   - RemoveBadge                  @ ~9952850 (16px X inside a chip)
 *
 * A pinned selection is shown as ONE one-line frosted chip per selection: the
 * collapsed text with CSS ellipsis is the whole label (VoiceOS never appends
 * "..."), and the full collapsed text travels on the `title` tooltip. While the
 * hotkey is held the notch stays collapsed, so the same selection is signalled
 * by `SelectionBandBadge` in the top band instead of a chip.
 *
 * Presentation only: no IPC, no network, no state.
 */

import type { CSSProperties, ReactNode } from "react";

/** Longest a chip may grow before CSS ellipsis shortens the label. */
export const SELECTED_TEXT_CHIP_MAX_WIDTH_PX = 190;

/** Chip height - the notch's single-line attachment token. */
export const CONTEXT_TOKEN_HEIGHT_PX = 40;

/** Width budget of the inline context stack. */
export const CONTEXT_STACK_WIDTH_PX = 300;

/** Collapses every whitespace run to one space and trims the ends. */
export function collapseSelectedText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export interface NotchContextItem {
  kind: "selectedText";
  key: string;
  /** Chip label and `title` tooltip - the collapsed selection. */
  description: string;
  /** The untouched selection, sent to the agent. */
  text: string;
  selectedTextIndex: number;
}

/**
 * buildAgentNotchContextItems (bundle ~9952500). Blank selections (pure
 * whitespace) would render an empty chip, so they are dropped; the source index
 * is preserved so keys stay stable when one is filtered out.
 */
export function buildAgentNotchContextItems(input: {
  selectedText: readonly string[] | null | undefined;
}): NotchContextItem[] {
  const items: NotchContextItem[] = [];
  input.selectedText?.forEach((text, index) => {
    const collapsedText = collapseSelectedText(text);
    if (collapsedText.length === 0) return;
    items.push({
      kind: "selectedText",
      key: `selected-text-${index}-${collapsedText.slice(0, 32)}`,
      description: collapsedText,
      text,
      selectedTextIndex: index
    });
  });
  return items;
}

export type NotchContextPlacement = "hidden" | "before-turn" | "before-composer";

/**
 * getAgentNotchContextPlacement (bundle ~9952800): with a bottom composer the
 * chips sit between the answer and the composer, otherwise they sit above the
 * turn they belong to.
 */
export function getAgentNotchContextPlacement(input: {
  contextItems: readonly NotchContextItem[];
  hasBottomComposer: boolean;
}): NotchContextPlacement {
  if (input.contextItems.length === 0) return "hidden";
  return input.hasBottomComposer ? "before-composer" : "before-turn";
}

export interface SelectedTextChipProps {
  item: NotchContextItem;
  index: number;
  onRemove: (item: NotchContextItem, index: number) => void;
}

/** RemoveBadge (bundle ~9952850): the 16px X floating at the chip's right edge. */
function RemoveBadge({ onClick }: { onClick: () => void }): ReactNode {
  return (
    <button
      type="button"
      className="agent-notch-context-remove"
      aria-label="Remove attachment"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{
        position: "absolute",
        top: "50%",
        right: 7,
        transform: "translateY(-50%)",
        width: 16,
        height: 16,
        borderRadius: 999,
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: "rgba(255,255,255,0.55)",
        background: "rgba(255,255,255,0.1)",
        border: "none"
      }}
    >
      <svg
        width={8}
        height={8}
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M9 3L3 9M3 3l6 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * A single pinned selection. The 190px box plus `text-overflow: ellipsis` is
 * what shortens a long selection - the label is always the full collapsed text.
 */
export function SelectedTextChip({
  item,
  index,
  onRemove
}: SelectedTextChipProps): ReactNode {
  return (
    <div
      className="agent-notch-context-chip"
      title={item.description}
      style={{
        position: "relative",
        height: CONTEXT_TOKEN_HEIGHT_PX,
        minWidth: 0,
        maxWidth: SELECTED_TEXT_CHIP_MAX_WIDTH_PX,
        flexShrink: 1,
        display: "flex",
        alignItems: "center",
        padding: "0 28px 0 11px",
        boxSizing: "border-box",
        borderRadius: 11,
        background: "rgba(255,255,255,0.06)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        animation: `agent-notch-attachment-in 240ms cubic-bezier(0.16, 1, 0.3, 1) ${index * 40}ms both`
      }}
    >
      <span
        style={{
          minWidth: 0,
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.35,
          letterSpacing: "-0.01em",
          color: "rgba(255,255,255,0.9)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }}
      >
        {item.description}
      </span>
      <RemoveBadge onClick={() => onRemove(item, index)} />
    </div>
  );
}

export interface NotchContextStackProps {
  items: readonly NotchContextItem[];
  onRemove: (item: NotchContextItem, index: number) => void;
  /** Answer viewport budget; the stack never collapses below 120px. */
  maxHeight?: number;
}

/** NotchContextStack (bundle ~9951000): the wrapping row of context chips. */
export function NotchContextStack({
  items,
  onRemove,
  maxHeight
}: NotchContextStackProps): ReactNode {
  if (items.length === 0) return null;

  const stackStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    boxSizing: "border-box",
    paddingLeft: 11,
    maxHeight: Math.max(120, maxHeight ?? 0),
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    overflowX: "hidden",
    overflowY: "auto",
    pointerEvents: "auto"
  };

  return (
    <div className="agent-notch-context-stack" style={stackStyle}>
      {items.map((item, index) => (
        <SelectedTextChip
          key={item.key}
          item={item}
          index={index}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

/**
 * Collapsed-band attachment indicator (VoiceOS image 1): a paperclip plus a
 * light count pill, shown in the top band while the hotkey is held because no
 * chip can render in the collapsed notch. Passive chrome - never clickable.
 */
export function SelectionBandBadge({ count }: { count: number }): ReactNode {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        pointerEvents: "none"
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.62)"
        }}
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </span>
      <span
        style={{
          minWidth: 18,
          height: 18,
          padding: "0 5px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.92)",
          color: "#000",
          fontSize: 11,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {count}
      </span>
    </div>
  );
}
