import React, { useRef, useState, useEffect } from "react";
import SeatsDisplay from "./SeatsDisplay";
import CommunityCards from "./CommunityCards";
import PotDisplay from "./PotDisplay";
import DealerButton from "./DealerButton";
import BetChipsDisplay from "./BetChipsDisplay";
import { useIsMobile } from "../hooks/useIsMobile";
import PayoutChipsDisplay from "./PayoutChipsDisplay";
import { Player, Spectator, Pot, ShowdownResult } from "../../../types/index";

interface TableProps {
  seats?: (Player | null)[];
  spectators?: Spectator[];
  mySeat: number | null;
  communityCards?: string[];
  currentPlayer?: number | null;
  turnExpiresAt?: number | null;
  pots?: Pot[];
  totalPot?: number;
  dealerPosition?: number;
  stage?: string;
  lastRoundBets?: number[];
  blinds?: { small: number; big: number };
  showdown?: ShowdownResult | null;
  onSit: (seat: number) => void;
}

// Total chip animation time: show (600ms) + move (800ms) + buffer
const CHIP_ANIMATION_TOTAL = 1500;

const Table: React.FC<TableProps> = ({
  seats = [],
  spectators = [],
  mySeat,
  communityCards = [],
  currentPlayer,
  turnExpiresAt,
  pots = [],
  totalPot = 0,
  dealerPosition,
  stage = "waiting",
  lastRoundBets = [],
  blinds,
  showdown = null,
  onSit,
}) => {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Delayed community cards — wait for chip animation to finish before showing new cards
  const [displayedCards, setDisplayedCards] = useState<string[]>(communityCards);
  const prevStageRef = useRef(stage);
  const prevCardsCountRef = useRef(communityCards.length);

  useEffect(() => {
    const stageChanged = prevStageRef.current !== stage;
    const newCardsAdded = communityCards.length > prevCardsCountRef.current;
    const hasLastRoundBets = lastRoundBets.some(b => b > 0);

    if (stageChanged && newCardsAdded && hasLastRoundBets) {
      const timer = setTimeout(() => {
        setDisplayedCards(communityCards);
      }, CHIP_ANIMATION_TOTAL);

      prevStageRef.current = stage;
      prevCardsCountRef.current = communityCards.length;
      return () => clearTimeout(timer);
    } else {
      setDisplayedCards(communityCards);
      prevStageRef.current = stage;
      prevCardsCountRef.current = communityCards.length;
    }
  }, [communityCards, stage, lastRoundBets]);

  // Seat margin percentages
  const SEAT_MARGIN_X_PCT = isMobile ? 0.08 : 0.10;
  const SEAT_MARGIN_Y_PCT = isMobile ? 0.10 : 0.15;

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;

        if (isMobile) {
          // Mobile: vertical table. Use actual available height from CSS (h-full).
          const availableHeight = offsetHeight;
          const tableWidth = offsetWidth * (1 - 2 * SEAT_MARGIN_X_PCT);
          const idealHeight = tableWidth * (7 / 4); // portrait ratio
          const idealTotalHeight = idealHeight / (1 - 2 * SEAT_MARGIN_Y_PCT);
          // Constrain to available height
          const totalHeight = Math.min(idealTotalHeight, availableHeight);
          setDimensions({ width: offsetWidth, height: totalHeight });
        } else {
          // Desktop: horizontal table
          const tableWidth = offsetWidth * (1 - 2 * SEAT_MARGIN_X_PCT);
          const tableHeight = tableWidth * (4 / 7);
          const totalHeight = tableHeight / (1 - 2 * SEAT_MARGIN_Y_PCT);
          setDimensions({ width: offsetWidth, height: totalHeight });
        }
      }
    };

    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [isMobile]);

  // Inner table dimensions (the felt ellipse)
  const innerWidth = dimensions.width * (1 - 2 * SEAT_MARGIN_X_PCT);
  const cardSize = isMobile
    ? Math.max(28, Math.min(48, innerWidth * 0.10))
    : Math.max(30, Math.min(60, innerWidth * 0.085));
  const cardSpacing = isMobile
    ? Math.max(3, innerWidth * 0.012)
    : Math.max(4, innerWidth * 0.015);

  // Table felt border-radius changes based on orientation
  const feltBorderRadius = isMobile ? "30%/50%" : "50%/30%";

  return (
    <div className="w-full h-full flex flex-col items-center">
      <div
        ref={containerRef}
        className="relative w-full h-full max-w-3xl mx-auto"
        style={isMobile ? undefined : { height: dimensions.height }}
      >
        {dimensions.width > 0 && (
          <>
            {/* Table felt */}
            <div
              className="absolute border-[6px] md:border-8 border-[#654321] shadow-xl"
              style={{
                left: `${SEAT_MARGIN_X_PCT * 100}%`,
                right: `${SEAT_MARGIN_X_PCT * 100}%`,
                top: `${SEAT_MARGIN_Y_PCT * 100}%`,
                bottom: `${SEAT_MARGIN_Y_PCT * 100}%`,
                borderRadius: feltBorderRadius,
                background: "radial-gradient(ellipse at center, var(--poker-felt) 0%, var(--poker-felt-dark) 100%)",
              }}
            >
              {/* Center content: pot + community cards + table info */}
              <div
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 md:gap-2 z-10"
                style={{ width: isMobile ? '80%' : '60%' }}
              >
                <PotDisplay pots={pots} totalPot={totalPot} />
                <CommunityCards
                  cards={displayedCards}
                  spacing={cardSpacing}
                  size={cardSize}
                />
                {blinds && (
                  <div className="text-[10px] text-white/50 mt-1 whitespace-nowrap">
                    NLH ~ {blinds.small}/{blinds.big} 6MAX
                  </div>
                )}
              </div>
            </div>

            {/* Bet chips on the felt */}
            <BetChipsDisplay
              seats={seats}
              mySeat={mySeat}
              stage={stage}
              lastRoundBets={lastRoundBets}
              isMobile={isMobile}
            />

            {/* Payout chips animation */}
            <PayoutChipsDisplay
              showdown={showdown}
              seats={seats}
              mySeat={mySeat}
              isMobile={isMobile}
            />

            {/* Seats */}
            <SeatsDisplay
              seats={seats}
              mySeat={mySeat}
              tableWidth={dimensions.width}
              tableHeight={dimensions.height}
              currentPlayer={currentPlayer}
              turnExpiresAt={turnExpiresAt}
              onSit={onSit}
              isMobile={isMobile}
            />

            {/* Dealer Button */}
            {dealerPosition != null && (
              <DealerButton
                dealerPosition={dealerPosition}
                mySeat={mySeat}
                stage={stage}
                isMobile={isMobile}
              />
            )}
          </>
        )}
      </div>

      {spectators.length > 0 && (
        <div className="mt-4 w-full max-w-3xl px-4">
          <h3 className="text-sm font-bold text-white/70 mb-2">Spectators ({spectators.length})</h3>
          <div className="flex gap-2 flex-wrap">
            {spectators.map((s, i) => (
              <div
                key={s.id + i}
                className="px-2 py-1 bg-black/40 rounded text-xs text-white"
              >
                {s.id.substring(0, 5)}...
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Table;
