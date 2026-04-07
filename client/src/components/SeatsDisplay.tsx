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
  isMobile?: boolean;
}

// Desktop: horizontal table positions (unchanged)
// 0: Bottom Center (My Seat), 1: Bottom Left, 2: Top Left,
// 3: Top Center, 4: Top Right, 5: Bottom Right
const SEAT_POSITIONS_DESKTOP = [
  { left: '50%', top: '96%',  align: 'translate(-50%, -100%)' },
  { left: '4%',  top: '72%',  align: 'translate(-20%, -50%)' },
  { left: '4%',  top: '28%',  align: 'translate(-20%, -50%)' },
  { left: '50%', top: '4%',   align: 'translate(-50%, 0%)' },
  { left: '96%', top: '28%',  align: 'translate(-80%, -50%)' },
  { left: '96%', top: '72%',  align: 'translate(-80%, -50%)' },
];

// Mobile: vertical table positions — seats around a tall oval
// 0: Bottom Center (My Seat — below table)
// 1: Bottom Left
// 2: Left (mid)
// 3: Top Center
// 4: Right (mid)
// 5: Bottom Right
const SEAT_POSITIONS_MOBILE = [
  { left: '50%', top: '97%',  align: 'translate(-50%, -100%)' }, // 0: Me — bottom center
  { left: '3%',  top: '75%',  align: 'translate(-10%, -50%)' },  // 1: Bottom Left
  { left: '3%',  top: '38%',  align: 'translate(-10%, -50%)' },  // 2: Left mid
  { left: '50%', top: '3%',   align: 'translate(-50%, 0%)' },    // 3: Top Center
  { left: '97%', top: '38%',  align: 'translate(-90%, -50%)' },  // 4: Right mid
  { left: '97%', top: '75%',  align: 'translate(-90%, -50%)' },  // 5: Bottom Right
];

const SeatsDisplay: React.FC<SeatsDisplayProps> = ({
  seats,
  mySeat,
  tableWidth,
  tableHeight,
  currentPlayer,
  turnExpiresAt,
  onSit,
  isMobile = false,
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, []);

  const totalSeats = 6;
  const rotationOffset = mySeat !== null ? mySeat : 0;
  const positions = isMobile ? SEAT_POSITIONS_MOBILE : SEAT_POSITIONS_DESKTOP;

  // Responsive seat size
  const seatWidth = isMobile
    ? Math.max(52, Math.min(80, tableWidth * 0.17))
    : Math.max(60, Math.min(100, tableWidth * 0.18));
  const seatHeight = seatWidth;

  return (
    <>
      {seats.map((player, i) => {
        const visualIndex = (i - rotationOffset + totalSeats) % totalSeats;
        const pos = positions[visualIndex];
        const isMe = i === mySeat;
        const isFree = !player;
        const canSit = isFree && mySeat === null;
        const isActive = currentPlayer === i;

        let timeLeft = 0;
        if (isActive && turnExpiresAt) {
          timeLeft = Math.max(0, Math.ceil((turnExpiresAt - now) / 1000));
        }

        const isWaitingForBB = player?.waitingForBB;

        // On mobile, "my seat" (visual index 0) renders differently — larger cards below
        if (isMobile && isMe && player) {
          return (
            <div
              key={i}
              className={`absolute flex flex-col items-center z-20`}
              style={{
                left: pos.left,
                top: pos.top,
                transform: pos.align,
                width: seatWidth * 1.2,
              }}
            >
              {/* My hand — large cards */}
              <div className="flex justify-center mb-1">
                <HandDisplay cards={player.hand} size={seatWidth * 0.75} overlap={seatWidth * 0.2} />
              </div>

              {/* Name + chips badge */}
              <div className={`
                relative flex flex-col items-center rounded-xl px-3 py-1 text-white shadow-lg border-2
                ${isActive ? "border-yellow-400 shadow-[0_0_15px_#FFD700]" : "border-gray-700"}
                bg-gray-900
              `}>
                {isActive && turnExpiresAt && (
                  <div className={`
                    absolute -top-2.5 right--2 px-1.5 py-0.5 rounded-full text-[9px] font-bold shadow-md z-30
                    ${timeLeft < 10 ? 'bg-red-500' : 'bg-gray-700'}
                  `}>
                    {timeLeft}s
                  </div>
                )}
                <span className="text-[11px] font-bold truncate max-w-[80px]">
                  {player.displayName || `Player ${player.id.slice(0, 4)}`}
                </span>
                <span className="text-[10px] font-mono font-bold text-yellow-400">
                  {player.chips}
                </span>
                {player.folded && <span className="text-red-400 font-bold text-[8px]">FOLD</span>}
                {player.waitingForBB && <span className="text-orange-300 text-[7px]">Wait BB</span>}
              </div>
            </div>
          );
        }

        // Standard seat rendering (desktop + other mobile seats)
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
                  <div className={`transform ${isMobile ? 'scale-[0.65]' : 'scale-75'} -mb-4 mt-1 w-full flex justify-center`}>
                    <HandDisplay cards={player.hand} size={seatWidth * 0.6} />
                  </div>

                  {/* Player Info */}
                  <div className="text-[10px] mt-1 leading-tight w-full px-1 flex flex-col items-center">
                    <div className="font-mono font-bold truncate max-w-full">{player.chips}</div>
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
