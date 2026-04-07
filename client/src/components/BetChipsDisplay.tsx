import React, { useState, useEffect, useRef } from "react";
import { getChipColor } from "./PokerChip";
import { Player } from "../../../types/index";

interface BetChipsDisplayProps {
  seats: (Player | null)[];
  mySeat: number | null;
  stage: string;
  lastRoundBets: number[];
  isMobile?: boolean;
}

// Desktop: bet chip positions on the table (% of outer container)
const BET_POSITIONS_DESKTOP = [
  { left: 50, top: 65 },  // 0: Bottom Center
  { left: 25, top: 60 },  // 1: Bottom Left
  { left: 25, top: 38 },  // 2: Top Left
  { left: 50, top: 32 },  // 3: Top Center
  { left: 75, top: 38 },  // 4: Top Right
  { left: 75, top: 60 },  // 5: Bottom Right
];

// Mobile: bet positions for vertical table
const BET_POSITIONS_MOBILE = [
  { left: 50, top: 78 },  // 0: Bottom Center (me)
  { left: 22, top: 68 },  // 1: Bottom Left
  { left: 22, top: 40 },  // 2: Left mid
  { left: 50, top: 22 },  // 3: Top Center
  { left: 78, top: 40 },  // 4: Right mid
  { left: 78, top: 68 },  // 5: Bottom Right
];

const POT_CENTER = { left: 50, top: 50 };
const SHOW_DURATION = 600;
const MOVE_DURATION = 800;

const COLLECT_TRANSITIONS: Record<string, string[]> = {
  preflop: ['flop', 'showdown'],
  flop: ['turn', 'showdown'],
  turn: ['river', 'showdown'],
  river: ['showdown'],
};

const shouldAnimateCollect = (fromStage: string, toStage: string): boolean => {
  const validTargets = COLLECT_TRANSITIONS[fromStage];
  return validTargets ? validTargets.includes(toStage) : false;
};

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
        boxShadow: `0 1px 3px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.2)`,
        zIndex: total - index,
      }}
    />
  );
};

const BetStack: React.FC<{
  amount: number;
  position: { left: number; top: number };
  moveToPot: boolean;
}> = ({ amount, position, moveToPot }) => {
  if (amount <= 0) return null;

  const chips = calculateChips(amount, 5);
  const stackHeight = chips.length * 3 + 18;

  const displayValue = amount >= 10000
    ? `${(amount / 1000).toFixed(0)}k`
    : amount >= 1000
      ? `${(amount / 1000).toFixed(1)}k`
      : amount.toString();

  const targetLeft = moveToPot ? POT_CENTER.left : position.left;
  const targetTop = moveToPot ? POT_CENTER.top : position.top;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${targetLeft}%`,
        top: `${targetTop}%`,
        transform: `translate(-50%, -50%) scale(${moveToPot ? 0.3 : 1})`,
        zIndex: 15,
        transition: moveToPot
          ? `left ${MOVE_DURATION}ms ease-in-out, top ${MOVE_DURATION}ms ease-in-out, opacity ${MOVE_DURATION}ms ease-in, transform ${MOVE_DURATION}ms ease-in-out`
          : 'none',
        opacity: moveToPot ? 0 : 1,
      }}
    >
      <div
        className="text-center mb-0.5"
        style={{
          fontSize: 10,
          fontWeight: 'bold',
          color: '#fff',
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          whiteSpace: 'nowrap',
        }}
      >
        {displayValue}
      </div>
      <div style={{ position: 'relative', height: stackHeight, width: 18, margin: '0 auto' }}>
        {chips.map((chipValue, index) => (
          <MiniChip key={index} value={chipValue} index={index} total={chips.length} />
        ))}
      </div>
    </div>
  );
};

type AnimPhase = 'idle' | 'show' | 'collect' | 'moving' | 'done';

const BetChipsDisplay: React.FC<BetChipsDisplayProps> = ({
  seats,
  mySeat,
  stage,
  lastRoundBets,
  isMobile = false,
}) => {
  const totalSeats = 6;
  const rotationOffset = mySeat !== null ? mySeat : 0;
  const betPositions = isMobile ? BET_POSITIONS_MOBILE : BET_POSITIONS_DESKTOP;

  const prevStageRef = useRef(stage);

  const [frozenBets, setFrozenBets] = useState<number[]>(Array(totalSeats).fill(0));
  const [animPhase, setAnimPhase] = useState<AnimPhase>('idle');

  const currentBets = Array.from({ length: totalSeats }, (_, i) => seats[i]?.bet ?? 0);

  useEffect(() => {
    const prevStage = prevStageRef.current;
    if (prevStage !== stage && animPhase === 'idle') {
      if (shouldAnimateCollect(prevStage, stage)) {
        const betsToAnimate = lastRoundBets.length > 0 ? [...lastRoundBets] : [];
        const hasBets = betsToAnimate.some(b => b > 0);

        if (hasBets) {
          setFrozenBets(betsToAnimate);
          setAnimPhase('show');
        }
      }
    }
    prevStageRef.current = stage;
  }, [stage, animPhase, lastRoundBets]);

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | undefined;
    let rafId1: number | undefined;
    let rafId2: number | undefined;

    if (animPhase === 'show') {
      timerId = setTimeout(() => {
        setAnimPhase('collect');
      }, SHOW_DURATION);
    } else if (animPhase === 'collect') {
      rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(() => {
          setAnimPhase('moving');
        });
      });
    } else if (animPhase === 'moving') {
      timerId = setTimeout(() => {
        setAnimPhase('done');
      }, MOVE_DURATION + 100);
    } else if (animPhase === 'done') {
      setFrozenBets(Array(totalSeats).fill(0));
      setAnimPhase('idle');
    }

    return () => {
      if (timerId !== undefined) clearTimeout(timerId);
      if (rafId1 !== undefined) cancelAnimationFrame(rafId1);
      if (rafId2 !== undefined) cancelAnimationFrame(rafId2);
    };
  }, [animPhase, totalSeats]);

  const isAnimating = animPhase === 'show' || animPhase === 'collect' || animPhase === 'moving';
  const displayBets = isAnimating ? frozenBets : currentBets;
  const moveToPot = animPhase === 'moving';

  return (
    <>
      {displayBets.map((bet, seatIndex) => {
        if (bet <= 0) return null;

        const visualIndex = (seatIndex - rotationOffset + totalSeats) % totalSeats;
        const position = betPositions[visualIndex];

        return (
          <BetStack
            key={seatIndex}
            amount={bet}
            position={position}
            moveToPot={moveToPot}
          />
        );
      })}
    </>
  );
};

export default BetChipsDisplay;
