import React, { useRef, useState, useEffect } from "react";
import SeatsDisplay from "./SeatsDisplay";
import CommunityCards from "./CommunityCards";
import PotDisplay from "./PotDisplay";
import { Player, Spectator, Pot } from "../../../types/index";

interface TableProps {
  seats?: (Player | null)[];
  spectators?: Spectator[];
  mySeat: number | null;
  communityCards?: string[];
  currentPlayer?: number | null;
  turnExpiresAt?: number | null;
  pots?: Pot[];
  totalPot?: number;
  onSit: (seat: number) => void;
}

const Table: React.FC<TableProps> = ({
  seats = [],
  spectators = [],
  mySeat,
  communityCards = [],
  currentPlayer,
  turnExpiresAt,
  pots = [],
  totalPot = 0,
  onSit,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Seat margin percentages — how much space to reserve for seats outside the table
  const SEAT_MARGIN_X_PCT = 0.10; // 10% on each side
  const SEAT_MARGIN_Y_PCT = 0.15; // 15% on top and bottom

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { offsetWidth } = containerRef.current;
        // The table felt uses the inner area; total container is larger to fit seats outside
        const tableWidth = offsetWidth * (1 - 2 * SEAT_MARGIN_X_PCT);
        const tableHeight = tableWidth * (4 / 7);
        // Total container height includes margins for seats above and below
        const totalHeight = tableHeight / (1 - 2 * SEAT_MARGIN_Y_PCT);
        setDimensions({ width: offsetWidth, height: totalHeight });
      }
    };

    // Initial calculation
    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Inner table dimensions (the felt ellipse)
  const innerWidth = dimensions.width * (1 - 2 * SEAT_MARGIN_X_PCT);
  const cardSize = Math.max(30, Math.min(60, innerWidth * 0.085));
  const cardSpacing = Math.max(4, innerWidth * 0.015);

  return (
    <div className="w-full flex flex-col items-center">
      <div
        ref={containerRef}
        className="relative w-full max-w-3xl mx-auto"
        style={{ height: dimensions.height }}
      >
        {dimensions.width > 0 && (
          <>
            {/* Table felt — inset within the container */}
            <div
              className="absolute rounded-[50%/30%] border-8 border-[#654321] shadow-xl"
              style={{
                left: `${SEAT_MARGIN_X_PCT * 100}%`,
                right: `${SEAT_MARGIN_X_PCT * 100}%`,
                top: `${SEAT_MARGIN_Y_PCT * 100}%`,
                bottom: `${SEAT_MARGIN_Y_PCT * 100}%`,
                background: "radial-gradient(ellipse at center, var(--poker-felt) 0%, var(--poker-felt-dark) 100%)",
              }}
            >
              <div
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10"
                style={{ width: '60%' }}
              >
                <PotDisplay pots={pots} totalPot={totalPot} />
                <CommunityCards
                  cards={communityCards}
                  spacing={cardSpacing}
                  size={cardSize}
                />
              </div>
            </div>

            {/* Seats — positioned relative to the full container (outside the table) */}
            <SeatsDisplay
              seats={seats}
              mySeat={mySeat}
              tableWidth={dimensions.width}
              tableHeight={dimensions.height}
              currentPlayer={currentPlayer}
              turnExpiresAt={turnExpiresAt}
              onSit={onSit}
            />
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
