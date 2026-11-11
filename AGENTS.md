# AGENTS.md

## Test-driven development

Use TDD for **core behavior** — the paths where a failure would break Kestrel or its trust boundary:

- global hotkey registration, window summoning, and focus
- audio capture, transcription, and text insertion/paste
- API/backend contracts, authentication, persistence, and data integrity
- state machines and security- or privacy-sensitive logic

For a core change, work in a **red → green → refactor** loop:

1. Agree the test seam with the user before writing code.
2. Write the smallest failing test that describes one behavior.
3. Run it and confirm it fails for the expected reason.
4. Implement the minimum needed to pass.
5. Refactor while the test stays green.
6. Run the full test suite (`npm test`, from `apps/desktop`) once, before calling the work complete.

Tests assert public behavior, not implementation details. If no test runner exists when the first core feature starts, add one as part of that work.

Use normal verification for cosmetic or low-risk changes — button colors, copy, layout polish, documentation, dependency bumps, throwaway spikes. Run the existing typecheck/build/manual checks; TDD is not required.

**Day 1 exception:** the completed global-hotkey spike is exempt and stays as-is. This policy applies from the next implementation onward.

If you are unsure whether a change is core, ask before writing code.

## Decisions

Ask before any product, UX, scope, or risk decision. Implementation details are yours.

## Plan mode

In plan mode, explain in as few words as possible, in plain and easy English, with little to no jargon. Keep every point that matters to the plan and cut everything else. Do not trade away meaning for brevity.

## Build mode

In build mode, do every task through subagents. The main session is a foreman: it plans, hands each task to a subagent, and reviews the result. Keep it from growing fat — let subagents do the reading, searching, and editing so the main context stays small.

**Checkpoints.** A subagent must stop and return a question — never a guess — at any point that needs the user: the TDD test seam, or any product, UX, scope, or risk decision. The foreman relays that question, then resumes the same subagent with the answer, so no work is lost. No other task needs a stop.

**Tests run once.** The subagent that changes the code runs the tests and reports the exact command and result. The foreman reviews that report and does not re-run the suite; it re-runs only a specific affected test file if the evidence looks wrong.
