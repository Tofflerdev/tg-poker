# Dealer Button Mobile Fix Plan

## Problem

The dealer button is invisible on mobile devices because its hardcoded percentage positions (`DEALER_BUTTON_ON_TABLE` in `DealerButton.tsx`) place it outside the visible screen area. The positions were designed independently of the seat layout and don't account for the table felt inset or small mobile viewports.

## Root Cause

In `DealerButton.tsx`, the button uses a static position map with values like `left: 16%` and `left: 84%`. These coordinates are relative to the **outer container**, but the table felt ellipse is inset by 10% horizontally and 15% vertically. On narrow mobile screens, these positions can fall outside the visible area or overlap with seat elements that are positioned at the container edges (4%, 96%).

The button is also a fixed 30px regardless of screen size.

## Solution

Recalculate dealer button positions so each one is:
1. **Derived from the corresponding seat position** — shifted toward the table center
2. **Inside the table felt ellipse** (10%-90% horizontal, 15%-85% vertical)
3. **Away from the community cards area** (center ~35%-65% horizontal, ~40%-60% vertical)
4. **Not overlapping the seat's player cards or name**

### Coordinate Layout

```
Outer container coordinate system - percentages

         10%                50%               90%
    ┌─────┬─────────────────┬─────────────────┬─────┐ 0%
    │     │                 │                 │     │
    │     │    Seat 3       │                 │     │ 4%
    │     │   ┌─────────────┼─────────────┐   │     │ 15% (felt top)
    │     │   │  DB3        │          DB4│   │     │ 22%
    │ S2  │   │             │             │   │ S4  │ 28%
    │     │   │DB2          │          DB5│   │     │ 35%
    │     │   │      ┌──────┼──────┐      │   │     │ 40%
    │     │   │      │ POT + CARDS │      │   │     │ 50%
    │     │   │      └──────┼──────┘      │   │     │ 60%
    │     │   │DB1          │          DB6│   │     │ 65%
    │ S1  │   │             │             │   │ S5  │ 72%
    │     │   │             │             │   │     │
    │     │   │  DB0        │             │   │     │ 78%
    │     │   └─────────────┼─────────────┘   │     │ 85% (felt bottom)
    │     │                 │                 │     │
    │     │    Seat 0       │                 │     │ 96%
    └─────┴─────────────────┴─────────────────┴─────┘ 100%
   0%    10%               50%              90%   100%
```

### New Position Map

| Visual Index | Seat Position | New Dealer Button | Direction from Seat |
|---|---|---|---|
| 0 - Bottom Center | 50%, 96% | 38%, 78% | Up-left, inside felt bottom |
| 1 - Bottom Left | 4%, 72% | 20%, 65% | Right-up, inside felt left-bottom |
| 2 - Top Left | 4%, 28% | 20%, 35% | Right-down, inside felt left-top |
| 3 - Top Center | 50%, 4% | 38%, 22% | Down-left, inside felt top |
| 4 - Top Right | 96%, 28% | 80%, 35% | Left-down, inside felt right-top |
| 5 - Bottom Right | 96%, 72% | 80%, 65% | Left-up, inside felt right-bottom |

All positions are safely inside the felt ellipse and away from the community cards center zone.

### Button Size

Make the button size responsive instead of fixed 30px:
- Use `clamp(20px, 4vw, 30px)` or calculate from container width
- This ensures the button is visible but not oversized on any device

## Files Changed

### `client/src/components/DealerButton.tsx`

**Changes:**
1. Replace `DEALER_BUTTON_ON_TABLE` array with new positions derived from seat layout
2. Make `BUTTON_SIZE` responsive — either via CSS `clamp()` or by accepting container width as a prop
3. Keep the same rotation logic (visualIndex calculation) — it's correct
4. Keep the smooth transition animation

## Visual Verification

After implementation, verify on mobile viewport (375px wide) that:
- [ ] Dealer button is visible for all 6 seat positions
- [ ] Button stays inside the green felt area
- [ ] Button doesn't overlap community cards in the center
- [ ] Button doesn't overlap player name/cards/chips
- [ ] Smooth transition animation still works when dealer changes
