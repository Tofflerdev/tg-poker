# Side Pots Implementation Plan

## Overview

This document outlines the implementation plan for adding proper side pot handling to the poker game. Side pots are essential for correct all-in scenarios where players have different stack sizes.

## Current State Analysis

### Existing Implementation in `server/Game.ts`

- Single `pot: number` field tracks all chips
- `awards()` method divides pot equally among winners
- `allIn()` method exists but doesn't create side pots
- No tracking of total player contributions across betting rounds

### Problem Scenarios Not Handled

1. Player A (100 chips) goes all-in, Player B (500 chips) calls → A can only win 200
2. Multiple all-ins at different levels create multiple side pots
3. Folded players' contributions should remain in appropriate pots

---

## Data Structure Changes

### New Types in `types/index.ts`

```typescript
// Represents a single pot (main or side)
export interface Pot {
  amount: number;              // Total chips in this pot
  eligiblePlayers: string[];   // Player IDs who can win this pot
  name: string;                // "Main Pot", "Side Pot 1", etc.
}

// Updated Player interface
export interface Player {
  id: string;
  seat: number;
  hand: string[];
  chips: number;
  bet: number;                 // Current betting round bet
  totalBet: number;            // NEW: Total contribution this hand
  folded: boolean;
  allIn: boolean;
  acted: boolean;
}

// Updated GameState interface
export interface GameState {
  seats: (Player | null)[];
  spectators: Spectator[];
  communityCards: string[];
  pots: Pot[];                 // CHANGED: Array instead of single number
  totalPot: number;            // NEW: Convenience sum of all pots
  currentBet: number;
  currentPlayer: number | null;
  dealerPosition: number;
  smallBlind: number;
  bigBlind: number;
  stage: GameStage;
}
```

---

## Algorithm: Pot Calculation

### When to Calculate Pots

Pots should be recalculated:
1. At the end of each betting round (before dealing next street)
2. When transitioning to showdown

### Pot Calculation Algorithm

```typescript
private calculatePots(): Pot[] {
  // 1. Get all players who contributed (including folded)
  const contributions = this.seats
    .filter((p): p is Player => p !== null && p.totalBet > 0)
    .map(p => ({
      playerId: p.id,
      amount: p.totalBet,
      folded: p.folded
    }))
    .sort((a, b) => a.amount - b.amount);

  const pots: Pot[] = [];
  let previousLevel = 0;

  // 2. Process each unique contribution level
  const uniqueLevels = [...new Set(contributions.map(c => c.amount))];
  
  for (const level of uniqueLevels) {
    const levelDiff = level - previousLevel;
    
    // Players who contributed at least this much
    const eligibleContributors = contributions.filter(c => c.amount >= level);
    
    // Only non-folded players can WIN (but folded players still contribute)
    const eligibleWinners = eligibleContributors
      .filter(c => !c.folded)
      .map(c => c.playerId);
    
    const potAmount = levelDiff * eligibleContributors.length;
    
    if (potAmount > 0 && eligibleWinners.length > 0) {
      pots.push({
        amount: potAmount,
        eligiblePlayers: eligibleWinners,
        name: pots.length === 0 ? "Main Pot" : `Side Pot ${pots.length}`
      });
    }
    
    previousLevel = level;
  }

  return pots;
}
```

### Example Walkthrough

**Scenario:**
- Player A: totalBet = 100 (all-in)
- Player B: totalBet = 250 (all-in)  
- Player C: totalBet = 500 (active)
- Player D: totalBet = 500 (active)

**Calculation:**

| Level | Diff | Contributors | Pot Amount | Eligible Winners |
|-------|------|--------------|------------|------------------|
| 100 | 100 | A,B,C,D (4) | 400 | A,B,C,D |
| 250 | 150 | B,C,D (3) | 450 | B,C,D |
| 500 | 250 | C,D (2) | 500 | C,D |

**Result:**
- Main Pot: 400 chips (A,B,C,D eligible)
- Side Pot 1: 450 chips (B,C,D eligible)
- Side Pot 2: 500 chips (C,D eligible)
- Total: 1350 chips

---

## Showdown Changes

### Updated Showdown Logic

```typescript
showdown(): ShowdownResult {
  const activePlayers = this.getActivePlayers(); // non-folded
  
  // Solve hands for all active players
  const playerHands = activePlayers.map(p => {
    const full = [...p.hand, ...this.communityCards];
    const solved = Hand.solve(full);
    return {
      player: p,
      hand: solved,
      descr: solved.descr,
      rank: solved.rank
    };
  });

  // Process each pot separately
  const potResults: PotResult[] = [];
  
  for (const pot of this.pots) {
    // Filter to only eligible players for this pot
    const eligibleHands = playerHands.filter(ph => 
      pot.eligiblePlayers.includes(ph.player.id)
    );
    
    if (eligibleHands.length === 0) continue;
    
    // Find winners for this pot
    const winnerHands = Hand.winners(eligibleHands.map(h => h.hand));
    const winners = eligibleHands.filter(h => winnerHands.includes(h.hand));
    
    // Distribute pot
    const share = Math.floor(pot.amount / winners.length);
    winners.forEach(w => {
      w.player.chips += share;
    });
    
    potResults.push({
      potName: pot.name,
      amount: pot.amount,
      winners: winners.map(w => ({
        id: w.player.id,
        descr: w.descr
      }))
    });
  }

  // Build showdown result
  this.lastShowdown = {
    results: playerHands.map(ph => ({
      id: ph.player.id,
      seat: ph.player.seat,
      hand: ph.player.hand,
      descr: ph.descr,
      rank: ph.rank
    })),
    potResults: potResults,
    winners: potResults.flatMap(pr => pr.winners)
  };

  this.stage = 'showdown';
  this.currentPlayer = null;
  
  return this.lastShowdown;
}
```

---

## Client UI Changes

### Pot Display Component

Create new component `client/src/components/PotDisplay.tsx`:

```tsx
interface PotDisplayProps {
  pots: Pot[];
  totalPot: number;
}

const PotDisplay: React.FC<PotDisplayProps> = ({ pots, totalPot }) => {
  return (
    <div className="pot-display">
      <div className="total-pot">
        Total: <strong>{totalPot}</strong>
      </div>
      {pots.length > 1 && (
        <div className="pot-breakdown">
          {pots.map((pot, i) => (
            <div key={i} className="pot-item">
              {pot.name}: {pot.amount}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

### Update Table.tsx

- Replace single pot display with `PotDisplay` component
- Position in center of table above community cards

### Update Showdown Display

- Show which pot each winner won
- Display pot breakdown in results

---

## Files to Modify

### Server Side

1. **`types/index.ts`**
   - Add `Pot` interface
   - Add `totalBet` to `Player`
   - Change `pot` to `pots` and add `totalPot` in `GameState`
   - Update `ShowdownResult` to include pot results

2. **`server/Game.ts`**
   - Replace `pot: number` with `pots: Pot[]`
   - Add `calculatePots()` method
   - Update `reset()` to clear pots array
   - Update `postBlinds()` to track totalBet
   - Update all betting actions to track totalBet
   - Update `nextStage()` to recalculate pots
   - Rewrite `showdown()` for multi-pot handling
   - Remove old `awards()` method (merged into showdown)
   - Update `getState()` to return pots array

3. **`server/index.ts`**
   - No changes needed (state broadcasting already handles full state)

### Client Side

4. **`client/src/components/PotDisplay.tsx`** (NEW)
   - Create pot display component

5. **`client/src/components/Table.tsx`**
   - Import and use PotDisplay
   - Pass pots data from state

6. **`client/src/App.tsx`**
   - Update initial state to use pots array
   - Update showdown display for pot results

---

## Testing Scenarios

### Test Case 1: Simple All-In
- Player A: 100 chips, goes all-in
- Player B: 500 chips, calls
- Expected: Main pot 200, no side pot

### Test Case 2: Multiple All-Ins
- Player A: 100 chips, all-in
- Player B: 300 chips, all-in
- Player C: 500 chips, calls
- Expected: Main pot 300, Side pot 1: 400, Side pot 2: 200

### Test Case 3: All-In with Fold
- Player A: 100 chips, all-in
- Player B: 500 chips, calls
- Player C: 500 chips, folds after betting 50
- Expected: Main pot 250 (A,B eligible), C's 50 goes to main pot

### Test Case 4: All Players All-In
- All players all-in at different levels
- Verify correct pot distribution

---

## Migration Notes

### Breaking Changes

1. `GameState.pot` → `GameState.pots` (array)
2. `Player` now requires `totalBet` field
3. `ShowdownResult` structure changes

### Backward Compatibility

- Add `totalPot` convenience field for simple display
- Client can fall back to `totalPot` if not handling multiple pots

---

## Implementation Order

1. ✅ Analyze current implementation
2. ✅ Design data structures
3. Update `types/index.ts` with new interfaces
4. Refactor `Game.ts` pot management
5. Implement `calculatePots()` algorithm
6. Update showdown logic
7. Create `PotDisplay` component
8. Update `Table.tsx` and `App.tsx`
9. Test all scenarios
10. Update state broadcasting

---

## Estimated Complexity

- **Types changes**: Low complexity
- **Pot calculation algorithm**: Medium complexity
- **Showdown refactor**: Medium-High complexity
- **UI updates**: Low complexity
- **Testing**: Medium complexity

Total: Medium-High complexity feature
