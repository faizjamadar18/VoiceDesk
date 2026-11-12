/*
 * VoiceOS notch answer + prompt typography - VERBATIM PORT.
 *
 * Source: VoiceOS 0.1.40 `out/renderer/assets/index-BKi3REhQ.js`
 *   - markdownComponents$1   @ 171781-172155  (the shared markdown component set)
 *   - NOTCH_MARKDOWN_COMPONENTS @ 186082-186085 (same set + NotchMarkdownTable)
 *   - NotchAnswerReveal      @ 186086-186108
 *   - ResponseScroll inline style @ 259090-259125
 *   - .agent-notch-prompt-markdown CSS @ 265415-265540 (in voiceos-notch-styles.ts)
 *
 * Every inline style below is copied from `markdownComponents$1` so the answer
 * renders with the exact same type scale, spacing and code/table chrome as the
 * VoiceOS notch. VoiceOS renders through `react-markdown` + `remark-gfm`; Kestrel
 * has no markdown dependency, so this module provides a small, self-contained
 * Markdown renderer that targets the same component surface (headings,
 * paragraphs, lists, blockquotes, fenced/inline code, links, rules, tables)
 * and drives it with those identical styles.
 *
 * It is presentation only: no IPC, no network, no state.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DependencyList,
  type ReactNode,
  type RefObject
} from "react";

/* ---- Exact inline styles from markdownComponents$1 (171781-172155). ---- */

const P_STYLE: CSSProperties = { margin: "0 0 0.75em 0", lineHeight: 1.6 };
const H1_STYLE: CSSProperties = {
  fontSize: "1.3em",
  fontWeight: 700,
  margin: "1em 0 0.5em 0",
  color: "rgba(255, 255, 255, 0.95)",
  lineHeight: 1.35
};
const H2_STYLE: CSSProperties = {
  fontSize: "1.2em",
  fontWeight: 650,
  margin: "0.9em 0 0.4em 0",
  color: "rgba(255, 255, 255, 0.93)",
  lineHeight: 1.35
};
const H3_STYLE: CSSProperties = {
  fontSize: "1.1em",
  fontWeight: 600,
  margin: "0.8em 0 0.35em 0",
  color: "rgba(255, 255, 255, 0.9)",
  lineHeight: 1.4
};
const UL_STYLE: CSSProperties = {
  margin: "0.5em 0",
  paddingLeft: "1.4em",
  listStyleType: "disc"
};
const OL_STYLE: CSSProperties = {
  margin: "0.5em 0",
  paddingLeft: "1.4em",
  listStyleType: "decimal"
};
const LI_STYLE: CSSProperties = {
  margin: "0.5em 0",
  lineHeight: 1.7,
  color: "rgba(255, 255, 255, 0.85)"
};
const STRONG_STYLE: CSSProperties = {
  fontWeight: 650,
  color: "rgba(255, 255, 255, 0.95)"
};
const EM_STYLE: CSSProperties = {
  fontStyle: "italic",
  color: "rgba(255, 255, 255, 0.8)"
};
const BLOCKQUOTE_STYLE: CSSProperties = {
  margin: "0.8em 0",
  paddingLeft: "0.9em",
  borderLeft: "2px solid rgba(255, 255, 255, 0.22)",
  color: "rgba(255, 255, 255, 0.65)",
  fontStyle: "normal"
};
const CODE_INLINE_STYLE: CSSProperties = {
  padding: "1px 5px",
  borderRadius: "4px",
  background: "rgba(255, 255, 255, 0.1)",
  fontSize: "0.88em",
  fontFamily: "'SF Mono', 'Fira Code', 'Menlo', monospace",
  color: "rgba(255, 255, 255, 0.9)"
};
const CODE_BLOCK_STYLE: CSSProperties = {
  display: "block",
  padding: "14px 16px",
  borderRadius: "8px",
  background: "rgba(0, 0, 0, 0.4)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  fontSize: "0.85em",
  lineHeight: 1.55,
  fontFamily: "'SF Mono', 'Fira Code', 'Menlo', monospace",
  color: "rgba(255, 255, 255, 0.85)",
  overflowX: "auto",
  whiteSpace: "pre",
  margin: "0 0 0.75em 0"
};
const HR_STYLE: CSSProperties = {
  border: "none",
  borderTop: "1px solid rgba(255, 255, 255, 0.15)",
  margin: "0.8em 0"
};
const TABLE_WRAP_STYLE: CSSProperties = {
  overflowX: "auto",
  margin: "0.6em 0",
  borderRadius: "8px"
};
const TABLE_STYLE: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.88em",
  lineHeight: 1.45
};
const TH_STYLE: CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontWeight: 600,
  color: "rgba(255, 255, 255, 0.9)",
  borderBottom: "1px solid rgba(255, 255, 255, 0.18)",
  background: "rgba(255, 255, 255, 0.05)",
  whiteSpace: "nowrap"
};
const TD_STYLE: CSSProperties = {
  padding: "9px 14px",
  borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
  color: "rgba(255, 255, 255, 0.8)"
};
const LINK_STYLE: CSSProperties = {
  color: "#1f70f7",
  textDecoration: "underline",
  cursor: "pointer"
};

/* ---- Inline parsing: code spans, links, bold, italic. ---- */

const INLINE_TOKEN_RE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  INLINE_TOKEN_RE.lastIndex = 0;
  while ((match = INLINE_TOKEN_RE.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const token = match[0];
    const key = `${keyBase}-${index++}`;
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} style={CODE_INLINE_STYLE}>
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} style={STRONG_STYLE}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const label = linkMatch?.[1] ?? token;
      const href = linkMatch?.[2] ?? "";
      nodes.push(
        <a
          key={key}
          href={href}
          style={LINK_STYLE}
          onClick={(event) => event.preventDefault()}
        >
          {label}
        </a>
      );
    } else {
      nodes.push(
        <em key={key} style={EM_STYLE}>
          {token.slice(1, -1)}
        </em>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/* ---- Block parsing. ---- */

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UL_RE = /^\s*[-*+]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE_RE = /^\s*```(.*)$/;

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

export function VoiceOsMarkdown({ text }: { text: string }): ReactNode {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let blockKey = 0;

  const nextKey = (): string => `b-${blockKey++}`;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block.
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume closing fence
      blocks.push(
        <pre key={nextKey()} style={CODE_BLOCK_STYLE}>
          <code>{body.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // Horizontal rule.
    if (HR_RE.test(line)) {
      blocks.push(<hr key={nextKey()} style={HR_STYLE} />);
      i++;
      continue;
    }

    // Heading.
    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length;
      const style =
        level === 1 ? H1_STYLE : level === 2 ? H2_STYLE : H3_STYLE;
      const content = renderInline(heading[2], nextKey());
      if (level === 1) blocks.push(<h1 key={nextKey()} style={style}>{content}</h1>);
      else if (level === 2) blocks.push(<h2 key={nextKey()} style={style}>{content}</h2>);
      else if (level === 3) blocks.push(<h3 key={nextKey()} style={style}>{content}</h3>);
      else blocks.push(<h4 key={nextKey()} style={style}>{content}</h4>);
      i++;
      continue;
    }

    // Table.
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      TABLE_SEP_RE.test(lines[i + 1])
    ) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        lines[i].includes("|")
      ) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push(
        <div key={nextKey()} style={TABLE_WRAP_STYLE}>
          <table style={TABLE_STYLE}>
            <thead>
              <tr>
                {header.map((cell, ci) => (
                  <th key={ci} style={TH_STYLE}>
                    {renderInline(cell, `th-${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={TD_STYLE}>
                      {renderInline(cell, `td-${ri}-${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Blockquote.
    if (QUOTE_RE.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quote.push(QUOTE_RE.exec(lines[i])?.[1] ?? "");
        i++;
      }
      blocks.push(
        <blockquote key={nextKey()} style={BLOCKQUOTE_STYLE}>
          <VoiceOsMarkdown text={quote.join("\n")} />
        </blockquote>
      );
      continue;
    }

    // Unordered list.
    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(lines[i])) {
        items.push(UL_RE.exec(lines[i])?.[1] ?? "");
        i++;
      }
      blocks.push(
        <ul key={nextKey()} style={UL_STYLE}>
          {items.map((item, ii) => (
            <li key={ii} style={LI_STYLE}>
              {renderInline(item, `ul-${ii}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list.
    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(lines[i])) {
        items.push(OL_RE.exec(lines[i])?.[1] ?? "");
        i++;
      }
      blocks.push(
        <ol key={nextKey()} style={OL_STYLE}>
          {items.map((item, ii) => (
            <li key={ii} style={LI_STYLE}>
              {renderInline(item, `ol-${ii}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph: gather until a blank line or a new block starter.
    const paragraph: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !FENCE_RE.test(lines[i]) &&
      !HEADING_RE.test(lines[i]) &&
      !HR_RE.test(lines[i]) &&
      !UL_RE.test(lines[i]) &&
      !OL_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={nextKey()} style={P_STYLE}>
        {renderInline(paragraph.join(" "), nextKey())}
      </p>
    );
  }

  return <>{blocks}</>;
}

/* ---- Composed wrappers matching the VoiceOS notch render tree. ---- */

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Computes the edge-fade mask class for a scrollable response body so clipped
 * prose trails off with VoiceOS's 22px gradient ramp instead of a hard cut.
 */
export function computeScrollFadeClass(
  scrollHeight: number,
  clientHeight: number,
  scrollTop: number
): string {
  const overflowing = scrollHeight - 1 > clientHeight;
  const top = overflowing && scrollTop > 1;
  const bottom = overflowing && scrollTop + clientHeight < scrollHeight - 1;
  if (top && bottom) return " agent-notch-response-scroll-fade-both";
  if (top) return " agent-notch-response-scroll-fade-top";
  if (bottom) return " agent-notch-response-scroll-fade-bottom";
  return "";
}

/**
 * Tracks scroll position and container/content resizes to drive the top/bottom
 * edge-fade mask classes on `VoiceOsAnswer`.
 */
export function useScrollEdgeFade(deps: DependencyList = []): {
  scrollRef: RefObject<HTMLDivElement | null>;
  fadeClass: string;
} {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [fadeClass, setFadeClass] = useState("");

  useIsomorphicLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      setFadeClass((prev) => (prev === "" ? prev : ""));
      return;
    }

    const update = (): void => {
      const next = computeScrollFadeClass(
        el.scrollHeight,
        el.clientHeight,
        el.scrollTop
      );
      setFadeClass((prev) => (prev === next ? prev : next));
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);

    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, deps);

  return { scrollRef, fadeClass };
}

export interface VoiceOsAnswerProps {
  text: string;
  /** Max height of the scroll region, matching VoiceOS `answerMaxHeight`. */
  maxHeight?: number;
  isError?: boolean;
}

/**
 * ResponseScroll + NotchAnswerReveal (bundle 259004-259127 + 186086-186108).
 * Inline styles are the exact ones VoiceOS sets on the scroll container and the
 * markdown wrapper.
 */
export function VoiceOsAnswer({
  text,
  maxHeight = 360,
  isError = false
}: VoiceOsAnswerProps): ReactNode {
  const { scrollRef, fadeClass } = useScrollEdgeFade([text, maxHeight, isError]);

  return (
    <div
      ref={scrollRef}
      className={`agent-notch-response-scroll agent-notch-card-present${isError ? " agent-notch-response-error" : ""}${fadeClass}`}
      style={{
        padding: isError ? "10px 16px 12px" : "4px 14px 8px",
        fontSize: 15,
        lineHeight: 1.5,
        color: "rgba(255, 255, 255, 0.95)",
        overflowY: "auto",
        overflowX: "hidden",
        maxHeight: `${Math.max(0, maxHeight)}px`,
        boxSizing: "border-box"
      }}
    >
      <div
        className="ask-response-markdown vos-answer-reveal"
        style={{
          fontSize: 15,
          lineHeight: isError ? "22px" : 1.5,
          color: isError ? "rgba(255, 255, 255, 0.92)" : undefined
        }}
      >
        <VoiceOsMarkdown text={text} />
      </div>
    </div>
  );
}

/** Passive push-to-talk hint bar matching VoiceOS's bottom composer slot. */
export function VoiceOsBottomHint({ keys }: { keys: string[] }): ReactNode {
  return (
    <div
      className="agent-notch-composer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        height: 36,
        padding: "6px 14px 4px",
        fontSize: 15,
        fontWeight: 450,
        letterSpacing: "0.2px",
        color: "rgba(236, 239, 247, 0.62)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        pointerEvents: "none",
        boxSizing: "border-box"
      }}
    >
      <span>Hold</span>
      {keys.map((key, index) => (
        <kbd key={`${key}-${index}`} className="agent-notch-keycap">
          {key}
        </kbd>
      ))}
      <span>to speak</span>
    </div>
  );
}

/** The submitted prompt card (StagedPromptCard content, bundle 260512). */
export function VoiceOsPrompt({ text }: { text: string }): ReactNode {
  return (
    <div
      className="agent-notch-card-present"
      style={{
        background: "rgba(255, 255, 255, 0.08)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "14px",
        padding: "10px 16px",
        fontSize: 15,
        lineHeight: "22px",
        color: "rgba(255, 255, 255, 0.95)",
        boxSizing: "border-box",
        width: "100%",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word"
      }}
    >
      <VoiceOsMarkdown text={text} />
    </div>
  );
}
