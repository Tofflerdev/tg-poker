import { describe, it, expect } from 'vitest';
import {
  myBetAnchor,
  seatGeometry,
  BET_POSITIONS_MOBILE,
  BET_POSITIONS_DESKTOP,
} from '../seatLayout';

/* Top edge of my hole cards, in px from the top of the table container —
   mirrors SEAT_POSITIONS_*[0] + the card offset inside the seat card
   (SeatsDisplay). myBetAnchor exists to track this as the table resizes. */
const myCardsTopPx = (isMobile: boolean, tableHeight: number): number => {
  const { aSize, stageH } = seatGeometry(isMobile, true);
  return (isMobile ? 0.95 : 0.94) * tableHeight - stageH + Math.round(aSize * 0.05);
};

/* myBetAnchor().top is the BOTTOM edge of the stack (BetStack anchors seat 0
   by its bottom), so the gap doesn't depend on how many chips are stacked. */
const gapToMyCards = (isMobile: boolean, tableHeight: number): number => {
  const { top } = myBetAnchor(isMobile, tableHeight);
  return myCardsTopPx(isMobile, tableHeight) - (top / 100) * tableHeight;
};

describe('myBetAnchor', () => {
  // 442px is a 360x640 phone, 502px a 390x700 one; the taller values cover
  // desktop windows. A fixed percentage drifted from +4px to -11px across this
  // range, which is how the chips ended up on top of my cards.
  it.each([442, 502, 600, 700, 900])(
    'holds a constant 12px gap above my cards on mobile at table height %ipx',
    (h) => {
      expect(gapToMyCards(true, h)).toBeCloseTo(12, 0);
    },
  );

  it.each([460, 556, 700])(
    'holds a constant 16px gap above my cards on desktop at table height %ipx',
    (h) => {
      expect(gapToMyCards(false, h)).toBeCloseTo(16, 0);
    },
  );

  it('falls back to the static position before the table has been measured', () => {
    expect(myBetAnchor(true, 0)).toEqual(BET_POSITIONS_MOBILE[0]);
    expect(myBetAnchor(false, 0)).toEqual(BET_POSITIONS_DESKTOP[0]);
  });

  it('keeps the horizontal position of the static entry', () => {
    expect(myBetAnchor(true, 502).left).toBe(BET_POSITIONS_MOBILE[0].left);
    // Desktop is deliberately off-centre — the centred blinds/rake line sits in
    // the only vertical corridor available there.
    expect(myBetAnchor(false, 556).left).toBe(BET_POSITIONS_DESKTOP[0].left);
    expect(BET_POSITIONS_DESKTOP[0].left).not.toBe(50);
  });

  it('clamps out of the pot area on a degenerately short table', () => {
    // 300px tall would put the stack at ~56%, i.e. into the community cards.
    expect(myBetAnchor(true, 300).top).toBe(62);
  });
});
