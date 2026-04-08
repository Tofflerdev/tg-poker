import React, { useState, useEffect, useRef } from "react";
import { getChipColor } from "./PokerChip";
import { ShowdownResult } from "../../../types/index";

interface PayoutChipsDisplayProps {
  showdown: ShowdownResult | null;
  seats: ({ id: string } | null)[];
  mySeat: number | null;
  isMobile?: boolean;
}

// Same seat positions as BetChipsDisplay
const SEAT_POSITIONS_DESKTOP = [
  { left: 50, top: 65 },
  { left: 25, top: 60 },
  { left: 25, top: 38 },
  { left: 50, top: 32 },
  { left: 75, top: 38 },
  { left: 75, top: 60 },
];

const SEAT_POSITIONS_MOBILE = [
  { left: 50, top: 78 },
  { left: 22, top: 68 },
  { left: 22, top: 40 },
  { left: 50, top: 22 },
  { left: 78, top: 40 },
  { left: 78, top: 68 },
];

// Starting position: to the right of pot display
const POT_RIGHT_DESKTOP = { left: 62, top: 43 };
const POT_RIGHT_MOBILE = { left: 64, top: 38 };
const INITIAL_DELAY = 2000;
const MOVE_DURATION = 900;

const calculateChips = (value: number, maxChips: number = 5): number[] => {
  const denominations = [1000, 500, 100, 50, 25, 10, 5, 1];
  const chips: number[] = [];
  let remaining = value;
  for (const denom of denominations) {
    while (remaining >= denom && chips.length < maxChips) {
      chips.push(denom);
      remaining -= denom;
    }
  }
  return chips;
};

const MiniChip: React.FC<{ value: number; index: number; total: number }> = ({ value, index, total }) => {
  const color = getChipColor(value);
  const size = 18;
  return (
    <div
      style={{
        position: 'absolute',
        bottom: index * 3,
        left: '50%',
        transform: 'translateX(-50%)',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        border: '1.5px dashed rgba(255, 255, 255, 0.4)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.2)',
        zIndex: total - index,
      }}
    />
  );
};

interface PayoutTarget {
  seatIndex: number;
  amount: number;
}

const PayoutStack: React.FC<{
  amount: number;
  startPosition: { left: number; top: number };
  targetPosition: { left: number; top: number };
  moveToSeat: boolean;
}> = ({ amount, startPosition, targetPosition, moveToSeat }) => {
  if (amount <= 0) return null;

  const chips = calculateChips(amount, 5);
  const stackHeight = chips.length * 3 + 18;

  const displayValue = amount >= 10000
    ? `${(amount / 1000).toFixed(0)}k`
    : amount >= 1000
      ? `${(amount / 1000).toFixed(1)}k`
      : amount.toString();

  const currentLeft = moveToSeat ? targetPosition.left : startPosition.left;
  const currentTop = moveToSeat ? targetPosition.top : startPosition.top;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${currentLeft}%`,
        top: `${currentTop}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: 15,
        transition: moveToSeat
          ? `left ${MOVE_DURATION}ms ease-in-out, top ${MOVE_DURATION}ms ease-in-out, opacity ${MOVE_DURATION * 0.4}ms ease-in ${MOVE_DURATION * 0.6}ms`
          : 'none',
        opacity: moveToSeat ? 0 : 1,
      }}
    >
      <div
        className="text-center mb-0.5"
        style={{
          fontSize: 11,
          fontWeight: 'bold',
          color: '#4ade80',
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          whiteSpace: 'nowrap',
        }}
      >
        +{displayValue}
      </div>
      <div style={{ position: 'relative', height: stackHeight, width: 18, margin: '0 auto' }}>
        {chips.map((chipValue, index) => (
          <MiniChip key={index} value={chipValue} index={index} total={chips.length} />
        ))}
      </div>
    </div>
  );
};

type AnimPhase = 'idle' | 'show' | 'moving' | 'done';

const PayoutChipsDisplay: React.FC<PayoutChipsDisplayProps> = ({
  showdown,
  seats,
  mySeat,
  isMobile = false,
}) => {
  const totalSeats = 6;
  const rotationOffset = mySeat !== null ? mySeat : 0;
  const seatPositions = isMobile ? SEAT_POSITIONS_MOBILE : SEAT_POSITIONS_DESKTOP;

  const [payoutTargets, setPayoutTargets] = useState<PayoutTarget[]>([]);
  const [animPhase, setAnimPhase] = useState<AnimPhase>('idle');
  const lastShowdownRef = useRef<ShowdownResult | null>(null);

  // Detect new showdown and start animation
  useEffect(() => {
    if (showdown && showdown !== lastShowdownRef.current) {
      lastShowdownRef.current = showdown;

      // Build payout targets: aggregate amounts per winning seat
      const amountBySeat: Record<number, number> = {};

      for (const potResult of showdown.potResults) {
        const winnerCount = potResult.winners.length;
        if (winnerCount === 0) continue;
        const share = Math.floor(potResult.amount / winnerCount);

        for (const winner of potResult.winners) {
          // Find seat index for this winner
          const seatIdx = seats.findIndex(s => s && s.id === winner.id);
          if (seatIdx === -1) continue;
          amountBySeat[seatIdx] = (amountBySeat[seatIdx] || 0) + share;
        }
      }

      const targets = Object.entries(amountBySeat).map(([seat, amount]) => ({
        seatIndex: Number(seat),
        amount,
      }));

      if (targets.length > 0) {
        setPayoutTargets(targets);
        setAnimPhase('show');
      }
    }

    if (!showdown) {
      lastShowdownRef.current = null;
    }
  }, [showdown, seats]);

  // Animation state machine
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let rafId1: number | undefined;
    let rafId2: number | undefined;

    if (animPhase === 'show') {
      // Wait a bit before starting the move (let users see the showdown result)
      timerId = setTimeout(() => {
        // Use double rAF to ensure the "show" position is rendered before transitioning
        rafId1 = requestAnimationFrame(() => {
          rafId2 = requestAnimationFrame(() => {
            setAnimPhase('moving');
          });
        });
      }, INITIAL_DELAY);
    } else if (animPhase === 'moving') {
      timerId = setTimeout(() => {
        setAnimPhase('done');
      }, MOVE_DURATION + 100);
    } else if (animPhase === 'done') {
      setPayoutTargets([]);
      setAnimPhase('idle');
    }

    return () => {
      if (timerId !== undefined) clearTimeout(timerId);
      if (rafId1 !== undefined) cancelAnimationFrame(rafId1);
      if (rafId2 !== undefined) cancelAnimationFrame(rafId2);
    };
  }, [animPhase]);

  if (animPhase === 'idle' || payoutTargets.length === 0) return null;

  const moveToSeat = animPhase === 'moving';
  const potRight = isMobile ? POT_RIGHT_MOBILE : POT_RIGHT_DESKTOP;
  const STACK_SPREAD = 8; // horizontal spread between multiple stacks (%)

  return (
    <>
      {payoutTargets.map((target, idx) => {
        const visualIndex = (target.seatIndex - rotationOffset + totalSeats) % totalSeats;
        const position = seatPositions[visualIndex];

        // Spread multiple winners horizontally around the pot-right position
        const offset = payoutTargets.length > 1
          ? (idx - (payoutTargets.length - 1) / 2) * STACK_SPREAD
          : 0;
        const startPosition = {
          left: potRight.left + offset,
          top: potRight.top,
        };

        return (
          <PayoutStack
            key={target.seatIndex}
            amount={target.amount}
            startPosition={startPosition}
            targetPosition={position}
            moveToSeat={moveToSeat}
          />
        );
      })}
    </>
  );
};

export default PayoutChipsDisplay;
