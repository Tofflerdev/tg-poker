---
status: partial
phase: 03-gameplay-additions
source: [03-VERIFICATION.md]
started: 2026-04-22T08:07:00Z
updated: 2026-04-22T08:07:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Play-through visual verification of ActionBubble overlays
expected: Seat each account at a real table, trigger fold/check/call/bet/raise/all-in actions. Each action produces a Neon-Strip pill over the acting seat — red (fold), cyan (check/call), amber (bet/raise), orange (all-in) — with pop-scale+fade enter (~120ms), 900ms hold, opacity+6px y-drift exit (~200ms). Five near-simultaneous folds on five seats render in parallel, not serialized. Second action at the same seat queues and appears after first's 900ms. Mobile and desktop both position bubbles above the seat avatar without overlapping hole cards or the stack/name strip.
result: [pending]

### 2. prefers-reduced-motion honor check
expected: Enable OS-level 'prefers-reduced-motion: reduce' (macOS: System Settings → Accessibility → Display → Reduce motion; Windows: Settings → Ease of Access → Display → Show animations). Trigger a player action. Bubble snaps in instantly (no scale, no fade), stays for exactly 900ms, snaps out instantly (no opacity fade, no y-drift). Bubbles are NEVER suppressed — the action signal must remain.
result: [pending]

### 3. Profile → Hand History end-to-end smoke
expected: Play ≥3 hands (at least one non-showdown fold by opponents, at least one showdown), then open Profile → History tab. List shows up to 50 hands ordered newest-first, each with relative time / table name / signed delta / WIN-LOST-CHOP badge. Tap a row to expand; BOARD section shows 5 community cards, YOUR CARDS always shows your hole cards, SHOWN AT SHOWDOWN section appears ONLY when opponent hands shown down (folded opponents' cards never appear). Empty state renders for a fresh account. Kill the socket mid-load → error state with 'Try closing and reopening your profile.' after 5s.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
