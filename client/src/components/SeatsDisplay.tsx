import React, { useState, useEffect } from "react";
import HandDisplay from "./HandDisplay";
import { Player } from "../../../types/index";

interface SeatsDisplayProps {
  seats: (Player | null)[];
  mySeat: number | null;
  tableWidth: number;
  tableHeight: number;
  seatSize?: number;
  currentPlayer?: number | null;
  turnExpiresAt?: number | null;
  onSit: (seat: number) => void;
}

// Positions as percentages [left, top]
// 0: Bottom Center (My Seat)
// 1: Bottom Left
// 2: Top Left
// 3: Top Center
// 4: Top Right
// 5: Bottom Right
const SEAT_POSITIONS = [
  { left: '50%', top: '92%', align: 'translate(-50%, -50%)' }, // Bottom Center
  { left: '10%', top: '75%', align: 'translate(-50%, -50%)' }, // Bottom Left
  { left: '10%', top: '25%', align: 'translate(-50%, -50%)' }, // Top Left
  { left: '50%', top: '8%',  align: 'translate(-50%, -50%)' }, // Top Center
  { left: '90%', top: '25%', align: 'translate(-50%, -50%)' }, // Top Right
  { left: '90%', top: '75%', align: 'translate(-50%, -50%)' }, // Bottom Right
];

const SeatsDisplay: React.FC<SeatsDisplayProps> = ({
  seats,
  mySeat,
  tableWidth,
  tableHeight,
  currentPlayer,
  turnExpiresAt,
  onSit,
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, []);

  const totalSeats = 6;
  const rotationOffset = mySeat !== null ? mySeat : 0;

  // Responsive seat size calculation
  const seatWidth = Math.max(60, Math.min(100, tableWidth * 0.18));
  const seatHeight = seatWidth;

  return (
    <>
      {seats.map((player, i) => {
        // Calculate visual position index
        const visualIndex = (i - rotationOffset + totalSeats) % totalSeats;
        const pos = SEAT_POSITIONS[visualIndex];

        const isFree = !player;
        const canSit = isFree && mySeat === null;
        const isActive = currentPlayer === i;
        
        let timeLeft = 0;
        if (isActive && turnExpiresAt) {
          timeLeft = Math.max(0, Math.ceil((turnExpiresAt - now) / 1000));
        }

        const isWaitingForBB = player?.waitingForBB;
        
        return (
          <div
            key={i}
            className={`absolute flex flex-col items-center justify-center transition-all duration-500 ${isActive ? "z-20" : "z-10"}`}
            style={{
              left: pos.left,
              top: pos.top,
              transform: pos.align,
              width: seatWidth,
              height: seatHeight,
            }}
            onClick={() => canSit && onSit(i)}
          >
            <div 
              className={`
                relative w-full h-full rounded-xl flex flex-col items-center justify-center text-center text-white shadow-lg border-2
                ${isActive ? "border-yellow-400 shadow-[0_0_15px_#FFD700]" : ""}
                ${isWaitingForBB ? "border-orange-400" : ""}
                ${!isActive && !isWaitingForBB ? (canSit ? "border-green-300" : isFree ? "border-gray-500" : "border-gray-700") : ""}
                ${canSit ? "bg-green-800 cursor-pointer hover:bg-green-700" : isFree ? "bg-gray-800/80" : "bg-gray-900"}
              `}
            >
              {isActive && turnExpiresAt && (
                <div className={`
                  absolute -top-3 px-2 py-0.5 rounded-full text-xs font-bold shadow-md z-30
                  ${timeLeft < 10 ? 'bg-red-500' : 'bg-gray-700'}
                `}>
                  {timeLeft}s
                </div>
              )}

              {player ? (
                <>
                  {/* Avatar and Name */}
                  <div className="absolute -top-6 bg-black/70 px-2 py-0.5 rounded-lg flex items-center gap-1 whitespace-nowrap z-20 max-w-[140%] overflow-hidden">
                    {player.avatarUrl && (
                      <img
                        src={player.avatarUrl}
                        alt="Avatar"
                        className="w-3 h-3 rounded-full"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <span className="text-[10px] font-bold truncate max-w-[80px]">
                      {player.displayName || `Player ${player.id.slice(0, 4)}`}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="transform scale-75 -mb-4 mt-1 w-full flex justify-center">
                     <HandDisplay cards={player.hand} size={seatWidth * 0.6} />
                  </div>
                  
                  {/* Player Info */}
                  <div className="text-[10px] mt-1 leading-tight w-full px-1 flex flex-col items-center">
                      <div className="font-mono font-bold truncate max-w-full">{player.chips}</div>
                      {player.bet > 0 && <div className="text-blue-300 font-bold text-[9px]">{player.bet}</div>}
                      {player.folded && <div className="text-red-400 font-bold text-[9px]">FOLD</div>}
                      {player.waitingForBB && <div className="text-orange-300 text-[8px]">Wait BB</div>}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs text-gray-400">Empty</div>
                  {canSit && <div className="mt-1 font-bold text-xs text-green-200">SIT</div>}
                </>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};

export default SeatsDisplay;
