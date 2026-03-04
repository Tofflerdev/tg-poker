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

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { offsetWidth } = containerRef.current;
        // Maintain 7/4 aspect ratio
        const width = offsetWidth;
        const height = width * (4 / 7);
        setDimensions({ width, height });
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

  // Calculate card size based on table width
  // Base size 60px for 700px width -> ~8.5% of width
  const cardSize = Math.max(30, Math.min(60, dimensions.width * 0.085));
  const cardSpacing = Math.max(4, dimensions.width * 0.015);

  return (
    <div className="w-full flex flex-col items-center">
      <div 
        ref={containerRef}
        className="relative w-full max-w-3xl mx-auto"
        style={{ height: dimensions.height }}
      >
        {dimensions.width > 0 && (
          <div
            className="absolute inset-0 rounded-[50%/30%] border-8 border-[#654321] shadow-xl overflow-hidden"
            style={{
              background: "radial-gradient(ellipse at center, var(--poker-felt) 0%, var(--poker-felt-dark) 100%)",
            }}
          >
            <SeatsDisplay
              seats={seats}
              mySeat={mySeat}
              tableWidth={dimensions.width}
              tableHeight={dimensions.height}
              currentPlayer={currentPlayer}
              turnExpiresAt={turnExpiresAt}
              onSit={onSit}
            />

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
