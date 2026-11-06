# Kestrel Skeleton — Product Behaviour Spec

**Purpose:** a small real build that proves Kestrel behaves the way we promise, before building the full product.
**Rule:** this document describes **behaviour and pass/fail only**. Implementation is intentionally unspecified — any agent may choose its own structure, libraries, and approach as long as the behaviour below holds.

**Cost rule:** no BYOK. One server-side key. Free tiers only.

---

## 1. The promise

One voice command does one of three things:

| Mode | User says | Agent does |
|---|---|---|
| **Dictate** | “Write this email…” | Speech → clean text at the cursor |
| **Ask** | “What’s this error?” · “Give me last year’s tax files from my PC” | Answers from screen, PC, Drive, Notion, or web — with sources |
| **Act** | “Move my 3 PM to Thursday” | Shows the exact change, waits for approval, performs it, offers undo |

Kestrel answers questions **and** takes actions. Writes are the differentiator, not the only feature.

---

## 2. Core behaviours

### 2.1 Dictation

- Press hotkey, speak, release. Polished text appears at the cursor in whatever app was focused.
- Works in Chrome, Notion, and Word.
- Audio is never stored.
- Local history of recent dictations, deletable by the user.

**Pass:** >95% accurate · p95 under 2s · works in 3 apps · no audio saved.

### 2.2 Screen question

- User asks about what they are looking at: “What does this error mean?”
- Agent captures only the active window, at that moment.
- Reads on-screen text locally first; sends an image only when the question is visual.
- Answers in plain English with a short “what I saw” line.
- Screen access is visible to the user while active.
- Image is discarded immediately after the answer.

**Pass:** 16/20 correct · p95 under 5s · no screenshot on disk, database, cloud storage, or logs.

### 2.3 Local PC files — the signature card

**User:** “Give me tax-related files from last year from my PC.”

- Agent searches indexed folders on the PC.
- If a matching folder exists (e.g. “2025 Tax Returns”), it lists that folder.
- Otherwise it returns ranked matches by name, content, folder, and date.
- The result is a **card**, not a paragraph.

```text
┌ 2025 Tax Returns — 10 items              ↗   ✕ ┐
│ Name                          Size    Modified │
│ 📄 2025 California...pdf      4.9 KB  8:02 PM  │
│ 📄 2025 Form 1040...pdf       6.1 KB  8:02 PM  │
│ 📄 2025 Form 1099...pdf       5.8 KB  8:02 PM  │
│ 📄 2025 Form W-2...pdf        4.4 KB  8:02 PM  │
│ ...                                             │
├─────────────────────────────────────────────────┤
│ I've displayed the 10 files in your 2025 Tax    │
│ Returns folder.                                 │
└─────────────────────────────────────────────────┘
```

Card behaviour:

- Header: title, item count, open-folder arrow, close.
- Columns: Name, Size, Date Modified.
- Click a row → opens the file.
- Click the arrow → opens the folder in Explorer.
- Footer: one short summary written by the model.
- More than 10 files → “10 of N”, arrow opens the folder for the rest.
- The card only shows real search results. The model never invents names, sizes, or dates.

From the card the user can also: open, show in Explorer, zip, move, copy, rename, delete to Recycle Bin (confirm), upload to Drive (confirm), or summarize one file — only then does its text go to the AI.

**Privacy:** the index and the search stay on the PC. Nothing is uploaded unless the user asks to summarize or upload.

**Pass:** correct card in under 2s · correct folder · row click opens the file · zero invented rows.

### 2.4 Cloud Q&A — Drive, Notion, web

| Source | User says | Agent shows |
|---|---|---|
| Drive | “What’s in my Drive?” · “Find last year’s tax returns” | Files with name, type, modified date, link |
| Drive | “Summarize this file” | Answer grounded in the file, with citation |
| Notion | “What’s on my roadmap?” | Answer with page links |
| Web | “Research this company” | Answer with numbered citations |

Every answer carries a working source. No source found → say so. Never invent.

**Pass:** 8/10 Drive · 8/10 Notion · every web claim sourced.

### 2.5 Writes

| User says | Agent shows | On approve | Undo |
|---|---|---|---|
| “Move my 3 PM to Thursday” | old time → new time | moves event | move back |
| “Schedule with David tomorrow at 2” | title, time, attendee | creates event | delete event |
| “Share this with David” | file, person, role | grants access | revoke access |
| “Create a folder called Invoices” | name, location | creates folder | delete folder |
| “Save this to Notion” | page/database, content preview | creates page | archive page |
| “Rename this to X” | old name → new name | renames | rename back |
| “Delete these files” | file list + second confirm | moves to Recycle Bin | restore |

Rules:

- Read actions never ask for confirmation.
- Every write shows the exact payload or diff **before** it runs.
- Destructive writes need a second confirm.
- Cancel means nothing happened.
- Every write appears in history with an undo option.
- Retries never create duplicates.

**Pass:** 10/10 calendar create/move/cancel · 10/10 Drive create/upload/copy/share · Notion create + undo · zero writes without confirmation · zero duplicates.

### 2.6 Answer format

Every factual answer is a short answer plus sources.

```text
You have 10 tax-related files from 2025 — 9 IRS forms and 1 California return.

Sources:
1. C:\Users\Faiz\Documents\Tax\2025 Tax Returns\2025 Form 1040...pdf
2. C:\Users\Faiz\Documents\Tax\2025 Tax Returns\2025 California...pdf
```

No source found → say so. Never invent.

---

## 3. Privacy and cost behaviour

- **Screenshots:** never written to disk, database, cloud storage, or request logs. Gone after the answer.
- **Audio:** never stored. Transcript only, kept locally.
- **Local files:** never uploaded unless the user asks for a summary or an upload.
- **Free tier:** Google may use content to improve its products — disclose this during onboarding.
- **Keys:** one server-side key; users never provide one; usage capped by daily limits.

**Pass:** privacy checks pass · spend stays inside the free tier.

---

## 4. What “done” looks like

One short demo, in this order:

1. Dictate into Chrome.
2. Ask about a screen error.
3. Ask for last year’s tax files → card → open one.
4. Ask what’s in Drive → answer with links.
5. Move a calendar event → confirm → undo.
6. Share a Drive file → confirm → revoke.
7. Save something to Notion → archive it.

---

## 5. Decision gate

| Result | Decision |
|---|---|
| 4–5 core areas pass | Start the production build |
| Vision is weak | Test a fallback vision model |
| Drive picker is clunky | Accept it or apply for the free metadata scope |
| OAuth is painful | Fix it before building more |
| Core fails | Stop. Do not build the full product |

---

## 6. Out of scope

No accounts, billing, or onboarding. No polished UI. No Postgres, Redis, or cloud deployment. No Gmail, Slack, Outlook, GitHub, Linear, or Jira. No mobile, app store, widgets, meeting transcription, local LLM, or BYOK.

---

## 7. Build order (behaviour milestones)

| Day | Behaviour that must work |
|---|---|
| 1 | App opens; global hotkey triggers it. **Stop and test before writing more.** |
| 2 | Dictation pastes into three real apps |
| 3 | “Tax files from last year” shows the card; rows and folder arrow work |
| 4 | Screen question gets a useful answer; nothing saved |
| 5 | Calendar create/move/cancel with confirmation and undo |
| 6 | Drive Q&A and Drive writes |
| 7 | Notion read and write; web answers with citations |
| 8–10 | Fix, measure, write `SPIKE_RESULTS.md`, decide |

If a day slips, cut polish — not the test. The goal is evidence, not a demo.
