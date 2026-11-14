# AGENTS.md

## TDD

For behavior changes, work test-first:
1. Write one small failing test.
2. Run it and confirm it fails for the right reason.
3. Write the least code needed to pass.
4. Refactor with tests green.

Test public behavior, not internals. Run only the tests for your change.

Skip TDD for cosmetic work — colors, copy, layout, docs, dependency bumps. Run typecheck/build instead.

Delete throwaway tests after use; keep tests that describe behavior. Ask if unsure.

## Decisions

Ask before any product, UX, scope, or risk decision. Implementation details are yours.

## Plan mode

In plan mode, explain in as few words as possible, in plain and easy English, with little to no jargon. Keep every point that matters to the plan and cut everything else. Do not trade away meaning for brevity.

## Build mode

In build mode, do every task through subagents. The main session is a foreman: it plans, hands each task to a subagent, and reviews the result. Keep it from growing fat — let subagents do the reading, searching, and editing so the main context stays small.

**Checkpoints.** A subagent must stop and return a question — never a guess — at any point that needs the user: any product, UX, scope, or risk decision. The foreman relays that question, then resumes the same subagent with the answer, so no work is lost. No other task needs a stop.

**Tests run once.** The subagent that changes the code runs only the tests for its implementation (never the full suite) and reports the exact command and result. The foreman reviews that report and does not re-run tests; it re-runs only a specific affected test file if the evidence looks wrong.
