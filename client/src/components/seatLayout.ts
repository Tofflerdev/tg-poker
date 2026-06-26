/* ════════════════════════════════════════════════════════════════════
   seatLayout — single source of truth for seat & overlay anchor positions.

   All values are percentages of the same outer table container (the
   `containerRef` div in Table.tsx), so seats, the dealer button and bet
   chips share one coordinate space. Consumed by:
     - SeatsDisplay   → SEAT_POSITIONS_*   (the seat cards themselves)
     - DealerButton   → DEALER_POSITIONS_* (dealer chip near each seat)
     - BetChipsDisplay→ BET_POSITIONS_*    (bet stacks on the betting line)

   Seat index 0 is "my seat" (the local player); seats rotate so index 0
   always renders at the bottom-centre. Tuning the table geometry happens
   here, in one place. ════════════════════════════════════════════════ */

/** Seat-card anchor: CSS left/top (%) + the translate() that offsets the card. */
export interface SeatAnchor {
  left: string;
  top: string;
  align: string;
}

/** Overlay anchor (dealer / bet): centre point as % of the container. */
export interface OverlayPos {
  left: number;
  top: number;
}

// Desktop: horizontal table
export const SEAT_POSITIONS_DESKTOP: SeatAnchor[] = [
  { left: '50%', top: '94%', align: 'translate(-50%, -100%)' },
  { left: '4%',  top: '70%', align: 'translate(-15%, -50%)' },
  { left: '4%',  top: '30%', align: 'translate(-15%, -50%)' },
  { left: '50%', top: '6%',  align: 'translate(-50%, 0%)' },
  { left: '96%', top: '30%', align: 'translate(-85%, -50%)' },
  { left: '96%', top: '70%', align: 'translate(-85%, -50%)' },
];

// Mobile: vertical table
export const SEAT_POSITIONS_MOBILE: SeatAnchor[] = [
  { left: '50%', top: '95%', align: 'translate(-50%, -100%)' },
  { left: '4%',  top: '73%', align: 'translate(-5%, -50%)' },
  { left: '4%',  top: '37%', align: 'translate(-5%, -50%)' },
  { left: '50%', top: '5%',  align: 'translate(-50%, 0%)' },
  { left: '96%', top: '37%', align: 'translate(-95%, -50%)' },
  { left: '96%', top: '73%', align: 'translate(-95%, -50%)' },
];

/* Dealer button — tucked just inside each seat, on the felt.
   Retuned for the larger avatar + wider name/stack pill geometry. */
export const DEALER_POSITIONS_DESKTOP: OverlayPos[] = [
  { left: 40, top: 80 },  // 0: bottom centre (me)
  { left: 22, top: 64 },  // 1: bottom left
  { left: 22, top: 36 },  // 2: top left
  { left: 40, top: 24 },  // 3: top centre
  { left: 78, top: 36 },  // 4: top right
  { left: 78, top: 64 },  // 5: bottom right
];

export const DEALER_POSITIONS_MOBILE: OverlayPos[] = [
  { left: 63, top: 84 },  // 0: bottom centre (me)
  { left: 31, top: 67 },  // 1: bottom left
  { left: 31, top: 33 },  // 2: left mid
  { left: 40, top: 20 },  // 3: top centre
  { left: 69, top: 33 },  // 4: right mid
  { left: 69, top: 67 },  // 5: bottom right
];

/* Bet stacks — on the betting line, a step further toward the pot than the
   dealer button so the two never collide. */
export const BET_POSITIONS_DESKTOP: OverlayPos[] = [
  { left: 50, top: 61 },  // 0: bottom centre (me) — raised to clear the larger my-seat
  { left: 27, top: 58 },  // 1: bottom left
  { left: 27, top: 40 },  // 2: top left
  { left: 50, top: 34 },  // 3: top centre
  { left: 73, top: 40 },  // 4: top right
  { left: 73, top: 58 },  // 5: bottom right
];

export const BET_POSITIONS_MOBILE: OverlayPos[] = [
  { left: 50, top: 70 },  // 0: bottom centre (me) — raised to clear the larger my-seat
  { left: 36, top: 62 },  // 1: bottom left
  { left: 37, top: 36 },  // 2: left mid
  { left: 50, top: 23 },  // 3: top centre
  { left: 63, top: 36 },  // 4: right mid
  { left: 64, top: 62 },  // 5: bottom right
];
