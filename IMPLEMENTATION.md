# Project Kestrel — Implementation Plan

**Working codename:** Kestrel (final brand and domain TBD)
**One line:** A Windows voice agent that looks at your screen, takes action in your apps, and asks before changing anything.
**Wedge:** Windows users who live in Google Workspace + Notion — students, operators, founders.
**Positioning:** “Point. Speak. Done.” Not “VoiceOS but free.”
**Target:** free beta in 10–12 weeks, part-time.
**Build order:** prove the core first with `SKELETON.md` (8–10 day walking skeleton), then start Phase 0.

---

## 1. Product Scope

### Three modes

| Mode | What it does | Example |
|---|---|---|
| **Dictate** | Speech → polished text at the cursor | “Write this email…” |
| **Ask** | Screen-aware answer | “What does this error mean?” |
| **Act** | Plan → confirm → execute | “Move my 3 PM to Thursday” |

### Launch scope

- **7 integrations:** Google Calendar, Google Tasks, Google Drive, Google Docs/Sheets, Notion, Obsidian/local files, Web/LinkedIn.
- **15 commands** (see §8).
- **Write actions first.** Read-only is only used to find the right file, event, or page.
- Every write shows a **confirmation card**; destructive actions need a second confirm; undo where possible.
- Windows-first. Mac later.

### Non-goals for v1

- No Gmail API — restricted scopes require paid CASA.
- No Slack — not used by the founder.
- No mobile app, app store, custom widgets, meeting transcription, or real-time voice conversation.
- No long-running autonomous background agents.
- No local LLM / Ollama bundle.
- No BYOK — one server-side key, capped free beta, paid plan later.
- No read-only-only product. Kestrel **answers** questions from local files, Drive, Notion, screen, and web, **and** takes actions. Writes are the differentiator, not the only feature.
- No full Google Drive scope.
- No copied VoiceOS code, assets, copy, or branding. Feature parity only.

---

## 2. Architecture

### High level

```text
┌────────────────────────── Windows PC ──────────────────────────┐
│  Electron + React + TypeScript                                 │
│  global hotkey · mic · screen capture · clipboard · local SQLite│
│  confirmation cards · settings · auto-update                   │
└───────────────────────────┬────────────────────────────────────┘
                            │ HTTPS / SSE
                            ▼
┌──────────────────────── FastAPI (Docker) ──────────────────────┐
│  Google OAuth + JWT                                            │
│  quota · rate limit · daily budget guard                       │
│  ASR router · LLM router · tool registry · action executor      │
│  OAuth broker · reminder scheduler · audit log                 │
└──────┬───────────────────┬───────────────────┬─────────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
  Supabase           Gemini 3.8 Flash     Google / Microsoft /
  Postgres           (text + vision)      Notion APIs
```

### Screen question flow

```text
hotkey
  → capture active window/region (memory only)
  → UI Automation / OCR for text
  → text question? send text only
  → visual question? downscale image, send through backend
  → Gemini 3.8 Flash
  → answer
  → image discarded
```

**No screenshot storage.** No disk write, no database row, no R2 object, no request-body logs.
Free tier means Google may use data to improve its products — disclose this.
Paid tier is not used for training.

### Action flow

```text
voice → ASR → intent
  ├─ dictate → polish → paste at cursor
  ├─ ask     → screen context → answer
  └─ act     → planner → tool call(s)
                 → confirmation card
                 → execute
                 → result + audit + undo window
```

### Key decisions

| Decision | Choice | Why |
|---|---|---|
| Desktop | Electron + React + TypeScript | No Rust; mature hotkeys, paste, screen capture, updater |
| API | FastAPI + Python | Best AI/tooling ecosystem; typed; OpenAPI for the TS client |
| Database | Supabase Postgres | Familiar; standard Postgres; free tier |
| Cache/queue | None initially | APScheduler + Postgres; add Redis only when scaling |
| Hosting | Render → Oracle Always Free | Ship fast, then always-on for reminders |
| AI | Gemini 3.8 Flash free | Strongest free vision model; one server key |
| Auth | Google OAuth + own JWT | Familiar; no Supabase Auth |
| BYOK | No | Simpler UX; founder pays through caps + paid plan |
| Screenshots | Transient only | Cloud quality without storage risk |
| Local model | None | Keeps installer small and quality high |

---

## 3. Stack

| Layer | Choice |
|---|---|
| Desktop shell | Electron |
| UI | React + TypeScript + Vite + Tailwind + Zustand + TanStack Query |
| Native | `uiohook-napi`, `nut.js`, `desktopCapturer`, `tesseract.js`, `better-sqlite3`, `keytar` |
| API | FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, httpx, SSE |
| Auth | Google OAuth via Authlib + PyJWT; refresh tokens hashed |
| Database | Supabase Postgres (pooled connection) |
| Jobs | APScheduler + Postgres job store |
| AI | Gemini 3.8 Flash (free → paid); Gemini 3.5 Flash-Lite fallback |
| ASR | NVIDIA Nemotron streaming via NeMo-Speech.cpp (local, free) |
| TTS | Web Speech API first; Kokoro later |
| Storage | None for screenshots/audio; R2 optional later with short TTL |
| Hosting | Render (MVP) → Oracle Always Free ARM + Docker + Cloudflare Tunnel |
| Observability | Sentry + PostHog free tiers |
| CI/CD | GitHub Actions + electron-builder + electron-updater |
| Monorepo | pnpm + Turborepo; shared OpenAPI types |

---

## 4. Repo Layout

```text
kestrel/
├─ apps/
│  ├─ desktop/          # Electron + React + TypeScript
│  └─ api/              # FastAPI
├─ packages/
│  └─ shared/           # generated API types, constants
├─ infra/
│  ├─ docker/
│  └─ scripts/
├─ docs/
│  ├─ IMPLEMENTATION.md
│  ├─ ADR/
│  └─ runbooks/
├─ .github/workflows/
└─ turbo.json
```

---

## 5. Data Model

| Table | Key fields |
|---|---|
| `users` | id, email, name, google_sub, created_at |
| `refresh_tokens` | id, user_id, token_hash, expires_at, revoked_at |
| `oauth_connections` | id, user_id, provider, encrypted_access, encrypted_refresh, scopes, expires_at |
| `conversations` | id, user_id, mode, created_at |
| `messages` | id, conversation_id, role, content, model, tokens_in, tokens_out |
| `actions` | id, user_id, tool, args_json, status, risk, idempotency_key, result_json |
| `confirmations` | id, action_id, payload_json, status, approved_at |
| `audit_log` | id, user_id, action_id, event, metadata_json, created_at |
| `quotas` | user_id, period, words_used, actions_used, screen_questions_used |
| `reminders` | id, user_id, title, due_at, timezone, source, external_id, status |
| `usage_events` | id, user_id, kind, model, tokens_in, tokens_out, cost_usd, created_at |

**Indexes:** `(user_id, created_at)` on messages/actions/audit; unique `actions.idempotency_key`; unique `(user_id, provider)` on oauth_connections; `(status, due_at)` on reminders.

---

## 6. Auth & Scopes

### Login flow

1. Electron opens the **system browser** — never an embedded webview.
2. Browser → `GET /auth/google/start` with PKCE + state.
3. Google → `GET /auth/google/callback`.
4. FastAPI verifies the ID token and upserts the user.
5. FastAPI creates a one-time code and redirects to `kestrel://auth?code=...`.
6. Electron exchanges the code for a **15-minute access JWT** and a **30-day rotating refresh token**.
7. Integration scopes are requested **separately** when the user connects an app.

### Scopes

| Provider | Scope | Cost |
|---|---|---|
| Google login | `openid email profile` | Free, no verification |
| Google Calendar | `calendar.events`, `calendar.readonly` | Sensitive; free verification |
| Google Tasks | `tasks` | Sensitive; free verification |
| Google Drive / Docs / Sheets | `drive.file` + Picker | Avoids restricted-scope CASA |
| Gmail | — | Avoid: restricted, paid CASA |
| Notion | OAuth integration | Free |
| Outlook / Microsoft Graph | `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite` | Free app registration |
| GitHub | GitHub App | Free |
| Linear / Jira | OAuth | Free |

**Token security:** AES-256-GCM at rest; tokens never sent to the desktop; revoke on disconnect; refresh rotation; no tokens in `localStorage`.

**Google verification:** start early. Testing mode caps at 100 users. Needs homepage, privacy policy, demo video.

---

## 7. Action Engine

### Tool contract

```json
{
  "name": "calendar.create_event",
  "risk": "write",
  "requires_confirmation": true,
  "undo": "calendar.delete_event",
  "input_schema": { "...": "..." }
}
```

### Rules

- Planner returns **tool calls**, not prose.
- Read-only tools run immediately.
- Write tools show a confirmation card with the exact payload or diff.
- Destructive actions need a second confirm.
- **Idempotency key** per action; unique index prevents duplicates.
- **Undo:** create → delete; move → move back; rename → rename back; share → revoke; update → restore old values.
- **Audit log** for every action.
- Copy the original file before modifying it.
- Untrusted web/doc content cannot trigger actions; only the user’s voice or confirmation can.

### Flow

```text
plan → validate → confirm → execute → result → audit → undo window
```

---

## 8. Commands & Integrations

### 15 launch commands

| # | Command | Integration |
|---|---|---|
| 1 | Dictate anywhere | Desktop |
| 2 | Polish selected text | Desktop |
| 3 | What’s on my screen? | Screen |
| 4 | Search this name on LinkedIn | Web |
| 5 | Research this company with sources | Web |
| 6 | Remind me 30 min before tomorrow’s meeting | Calendar |
| 7 | Schedule with David tomorrow at 2 | Calendar |
| 8 | What’s my day look like? | Calendar |
| 9 | Move my 3 PM to Thursday | Calendar |
| 10 | Find last year’s tax returns | Drive |
| 11 | Summarize this PDF/doc | Drive/Docs |
| 12 | Create a doc from this | Docs |
| 13 | Save this to Notion | Notion |
| 14 | Add a task | Tasks |
| 15 | Merge / rename / move / share these PDFs | Drive + local |

### Google Drive actions

- Create folder, upload, copy, rename, move, star, trash/restore, delete forever.
- Share/revoke access, copy link, change link access.
- Export Doc/Sheet/Slides; convert PDF → Google Doc; replace content; restore version.
- **PDF toolkit:** merge, split, extract, compress, rotate, watermark, sign, OCR, password, fill forms, PDF ↔ images.
- **Limit:** no true PDF text reflow. For text edits, convert to Google Doc, edit, export back.

### Other apps

| App | Write actions |
|---|---|
| Calendar | Create/move/cancel events, attendees, reminders, Meet link, RSVP, recurring, free slot |
| Tasks | Create, complete, reschedule, delete |
| Docs | Create, append, replace text, format, insert table/image, export, share |
| Sheets | Append row, update cells, format, chart, create tab |
| Notion | Create page/DB entry, update properties, append blocks, comment, archive |
| Obsidian/local | Create/append note, rename, move, delete to recycle bin, zip/unzip, bulk rename |
| Outlook | Draft, send, reply, create event, add task, save attachment |
| GitHub | Create issue, comment, label, assign, close, create PR — no auto-merge |
| Linear/Jira | Create/update issue, transition, comment, assign |
| Web | Open LinkedIn search, maps, search results — no auto-submit on unknown sites |

---

## 9. Free Tier, Quotas, Cost

### No BYOK

- One server-side Gemini key.
- Users never see a key.
- Free beta is capped. Paid plan later.
- Same code path for free and paid — only the key and limits change.

### Initial caps

| Feature | Free | Paid |
|---|---|---|
| Screen questions | 10/day | Fair use |
| Agent actions | 20/day | Fair use |
| Dictation | 2,000 words/week | Fair use |

Global daily request cap and a hard budget stop.

### Model routing

1. Text on screen → UI Automation / OCR → text model.
2. Visual question → Gemini 3.8 Flash.
3. Rate-limited → Gemini 3.5 Flash-Lite or queue.
4. Paid phase → paid key, better model only for hard cases.

Do not build a “cheap model extracts, second model answers” pipeline at launch. One vision model plus an OCR path is simpler and better.

### Cost estimate

- Gemini 3.8 Flash paid: roughly **$2–5 per 1,000 screenshot questions**.
- Paid plan: **$4.99/month**, fair use.
- Free tier: $0, low limits, and data-training disclosure.

### Privacy

- Screenshots are transient; no disk, DB, R2, or body logs.
- Audio is not stored; transcripts stay local.
- Free tier: Google may use data to improve products — disclose.
- Paid tier: not used for training.

---

## 10. Build Phases

| Phase | Time | Deliverables | Exit criteria |
|---|---|---|---|
| **0. Setup** | 3–4 days | Monorepo, CI, Electron shell, FastAPI, Postgres, auth skeleton | `pnpm dev` runs; health check; login works |
| **1. Voice core** | 2 weeks | Hotkey, mic, ASR, dictation, paste, history, screen Q&A (OCR/UIA + Gemini) | Dictate in 5 apps; screenshot answer < 4s |
| **2. Actions + reminders** | 2 weeks | Tool registry, confirmation cards, Calendar + Tasks, APScheduler, quotas | Create/move/cancel event; reminder fires |
| **3. Drive/Docs/Sheets + PDF** | 2–3 weeks | Picker + `drive.file`, create/upload/copy/move/share/export, PDF toolkit, local files | 10 Drive commands work end-to-end |
| **4. Notion + web/LinkedIn** | 2 weeks | Notion OAuth, create/update/append, web search with sources, LinkedIn open | Save to Notion; research with citations |
| **5. Outlook + dev tools** | 2 weeks | Outlook mail/calendar, GitHub/Linear issues | Draft/send Outlook; create issue |
| **6. Hardening + launch** | 2 weeks | Google verification, installer, auto-update, Sentry/PostHog, landing page, beta | 20 beta users; crash-free > 99.5% |

**Total:** 10–12 weeks part-time. Start Google verification in Phase 1 — it runs in parallel.

---

## 11. Testing & Metrics

### Tests

- 50 golden commands per integration.
- Unit: tool schemas, validation, confirmation, undo, idempotency.
- Integration: mocked Google/Notion/Outlook APIs.
- E2E: Playwright for Electron.
- Security: prompt injection, scope checks, token encryption, **no-image-retention assertion**.
- Load: `/ask` and `/agent/turn` at expected beta volume.

### Metrics

| Metric | Target |
|---|---|
| p95 dictation latency | < 1.5s |
| p95 screen answer | < 4s |
| Tool success rate | > 90% |
| Crash-free sessions | > 99.5% |
| Week-4 retention | > 35% |
| Cost per active user | < $0.02 free; covered by paid |

---

## 12. Deployment & CI/CD

- Dockerize the API from day one.
- **Render** for Phase 1 demo.
- **Oracle Always Free ARM + Docker + Cloudflare Tunnel** before reminders and public beta.
- Supabase pooled connection; Alembic migrations on deploy.
- GitHub Actions: lint, test, build, deploy, electron-builder, release.
- Env vars: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GROQ_API_KEY`, `SENTRY_DSN`, `POSTHOG_KEY`.
- `electron-updater` + GitHub Releases.
- Code signing: SignPath free for open source; otherwise accept SmartScreen warning at first.

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Google verification delay | Start early; testing mode 100 users; privacy page + demo video |
| Free tier rate limits | Caps, waitlist, fallback model, paid plan |
| Free tier data training | Disclose clearly; paid tier for no-training |
| Render cold starts | Move to Oracle before beta |
| PDF text editing | Limit promise; convert to Doc for text edits |
| Windows SmartScreen | SignPath or accept warning |
| AI cost at scale | OCR-first, caps, caching, paid plan |
| Brand/trademark | Check name before domain, logo, and launch |

---

## 14. First 10 Tasks

1. Create the monorepo and CI.
2. Scaffold FastAPI + Docker + `/health`.
3. Scaffold Electron + React + TypeScript + Tailwind.
4. Create Supabase Postgres and Alembic migrations.
5. Implement Google OAuth + JWT + deep link.
6. Implement hotkey + mic + ASR + paste.
7. Implement screen capture + OCR/UIA + Gemini proxy.
8. Add quota middleware and usage tables.
9. Build the tool registry and confirmation card.
10. Ship Calendar “create event” + reminder.

---

## 15. Brand & Launch

- Working name **Kestrel**; final brand, domain, and logo TBD.
- Tagline: **“Point. Speak. Done.”**
- Landing page: 30-second demo, privacy note, Windows download, waitlist.
- Beta: 20 users, weekly feedback, measure first successful action under 5 minutes.
- Launch story: “A Windows voice agent that finishes the task — not another chatbot.”
