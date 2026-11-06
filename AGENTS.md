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
6. Run the full test suite before calling the work complete.

Tests assert public behavior, not implementation details. If no test runner exists when the first core feature starts, add one as part of that work.

Use normal verification for cosmetic or low-risk changes — button colors, copy, layout polish, documentation, dependency bumps, throwaway spikes. Run the existing typecheck/build/manual checks; TDD is not required.

**Day 1 exception:** the completed global-hotkey spike is exempt and stays as-is. This policy applies from the next implementation onward.

If you are unsure whether a change is core, ask before writing code.
