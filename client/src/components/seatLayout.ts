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

/** Seat-card anchor: CSS left/top (%) + the translate() that offsets the card.
   `ax`/`ay` are the magnitudes of that translate (e.g. translate(-15%, -50%)
   → ax 15, ay 50). They let overlays compute the seat's box geometry without
   re-parsing the `align` string. */
export interface SeatAnchor {
  left: string;
  top: string;
  align: string;
  ax: number;
  ay: number;
}

/** Overlay anchor (dealer / bet): centre point as % of the container. */
export interface OverlayPos {
  left: number;
  top: number;
}

// Desktop: horizontal table
export const SEAT_POSITIONS_DESKTOP: SeatAnchor[] = [
  { left: '50%', top: '94%', align: 'translate(-50%, -100%)', ax: 50, ay: 100 },
  { left: '4%',  top: '70%', align: 'translate(-15%, -50%)',  ax: 15, ay: 50 },
  { left: '4%',  top: '30%', align: 'translate(-15%, -50%)',  ax: 15, ay: 50 },
  { left: '50%', top: '6%',  align: 'translate(-50%, 0%)',    ax: 50, ay: 0 },
  { left: '96%', top: '30%', align: 'translate(-85%, -50%)',  ax: 85, ay: 50 },
  { left: '96%', top: '70%', align: 'translate(-85%, -50%)',  ax: 85, ay: 50 },
];

// Mobile: vertical table
export const SEAT_POSITIONS_MOBILE: SeatAnchor[] = [
  { left: '50%', top: '95%', align: 'translate(-50%, -100%)', ax: 50, ay: 100 },
  { left: '4%',  top: '73%', align: 'translate(-5%, -50%)',   ax: 5,  ay: 50 },
  { left: '4%',  top: '37%', align: 'translate(-5%, -50%)',   ax: 5,  ay: 50 },
  { left: '50%', top: '5%',  align: 'translate(-50%, 0%)',    ax: 50, ay: 0 },
  { left: '96%', top: '37%', align: 'translate(-95%, -50%)',  ax: 95, ay: 50 },
  { left: '96%', top: '73%', align: 'translate(-95%, -50%)',  ax: 95, ay: 50 },
];

/** Seat-card pixel geometry. "My seat" (visualIndex 0) is larger; same layout. */
export interface SeatGeometry {
  aSize: number;    // avatar diameter
  pillW: number;    // name/stack pill width
  pillH: number;    // pill min height
  overlap: number;  // how much the pill rides up over the avatar/cards
  stageH: number;   // total seat-card height
  cardW: number;    // hole-card width
}

export function seatGeometry(isMobile: boolean, isMe: boolean): SeatGeometry {
  const aSize = isMe ? (isMobile ? 88 : 96) : (isMobile ? 60 : 80);
  const pillW = Math.round(aSize * 1.12);
  const cardW = Math.round(aSize * 0.57);
  const pillH = isMobile ? 34 : 38;
  const overlap = isMobile ? 14 : 16;
  const stageH = aSize + pillH - overlap;
  return { aSize, pillW, pillH, overlap, stageH, cardW };
}

/** Where the centred status/action overlay sits inside the seat card (40% down). */
export const SEAT_OVERLAY_Y = 0.4;

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
  // 0: bottom centre (me). `top` is overridden by myBetAnchor(); `left` is off
  // centre because the desktop corridor between the blinds/rake info line and
  // my hole cards is only ~40px — dead centre the stack lands on that text.
  { left: 60, top: 61 },
  { left: 27, top: 58 },  // 1: bottom left
  { left: 27, top: 40 },  // 2: top left
  { left: 50, top: 34 },  // 3: top centre
  { left: 73, top: 40 },  // 4: top right
  { left: 73, top: 58 },  // 5: bottom right
];

export const BET_POSITIONS_MOBILE: OverlayPos[] = [
  { left: 50, top: 70 },  // 0: bottom centre (me) — overridden by myBetAnchor()
  { left: 36, top: 62 },  // 1: bottom left
  { left: 37, top: 36 },  // 2: left mid
  { left: 50, top: 23 },  // 3: top centre
  { left: 63, top: 36 },  // 4: right mid
  { left: 64, top: 62 },  // 5: bottom right
];

/** Gap between my bet stack and the top edge of my hole cards. */
const MY_BET_GAP_PX = { mobile: 12, desktop: 16 };

/**
 * Bet anchor for the bottom-centre seat (me), as a % of the container — but
 * derived from pixels.
 *
 * My seat card is a fixed pixel height anchored to the bottom of the table,
 * while bet positions are percentages, so a constant % drifts into the cards as
 * the table gets shorter. Measured with BET_POSITIONS_MOBILE[0].top = 70:
 * 4px of clearance on a 502px-tall table, 11px of overlap on a 442px one (and
 * ~6px worse again once the stack is five chips high).
 *
 * The returned `top` is where the stack's BOTTOM edge goes — BetStack anchors
 * seat 0 by its bottom, so the gap to the cards doesn't depend on chip count;
 * a tall stack grows upward toward the pot instead of down onto the cards.
 */
export function myBetAnchor(isMobile: boolean, tableHeight: number): OverlayPos {
  const base = isMobile ? BET_POSITIONS_MOBILE[0] : BET_POSITIONS_DESKTOP[0];
  if (!tableHeight) return base;

  const { aSize, stageH } = seatGeometry(isMobile, true);
  // Mirrors SEAT_POSITIONS_*[0] (translate(-50%,-100%) → `top` is the seat's
  // bottom edge) and the cards' offset inside the seat card in SeatsDisplay.
  const seatBottomPct = isMobile ? 0.95 : 0.94;
  const cardsTopPx = seatBottomPct * tableHeight - stageH + Math.round(aSize * 0.05);
  const gap = isMobile ? MY_BET_GAP_PX.mobile : MY_BET_GAP_PX.desktop;
  const top = ((cardsTopPx - gap) / tableHeight) * 100;

  // Guard rails for degenerate table sizes: never climb into the pot/community
  // block (~60% down) and never drop off the bottom of the felt.
  return { left: base.left, top: Math.min(Math.max(top, 62), 88) };
}
