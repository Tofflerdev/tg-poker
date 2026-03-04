import React from "react";
import HandDisplay from "./HandDisplay";
import { Player } from "../../../types/index";

interface SeatsDisplayProps {
  seats: (Player | null)[];
  mySeat: number | null;
  tableWidth: number;
  tableHeight: number;
  seatSize?: number;
  currentPlayer?: number | null; // Кто сейчас ходит?
  turnExpiresAt?: number | null;
  onSit: (seat: number) => void;
}

const SeatsDisplay: React.FC<SeatsDisplayProps> = ({
  seats,
  mySeat,
  tableWidth,
  tableHeight,
  seatSize = 120,
  currentPlayer,
  turnExpiresAt,
  onSit,
}) => {
  const seatOffset = 50;
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {seats.map((player, i) => {
        const angle = (i / seats.length) * 2 * Math.PI;
        const radiusX = tableWidth / 2 + seatOffset;
        const radiusY = tableHeight / 2 + seatOffset;
        const x = radiusX * Math.cos(angle);
        const y = radiusY * Math.sin(angle);

        const isFree = !player;
        const canSit = isFree && mySeat === null;
        // Подсветка активного игрока желтым бордером
        const isActive = currentPlayer === i;
        
        let timeLeft = 0;
        if (isActive && turnExpiresAt) {
          timeLeft = Math.max(0, Math.ceil((turnExpiresAt - now) / 1000));
        }

        // Визуальные индикаторы для разных состояний
        const isWaitingForBB = player?.waitingForBB;
        
        return (
          <div
            key={i}
            className={isActive ? "turn-active" : ""}
            style={{
              position: "absolute",
              left: tableWidth / 2 + x - seatSize / 2,
              top: tableHeight / 2 + y - seatSize / 2,
              width: seatSize,
              height: seatSize,
              borderRadius: 12,
              background: canSit ? "#4a7a4a" : isFree ? "#3a5a3a" : "#222",
              border: isActive
                ? "4px solid #FFD700" // Золотая рамка для активного
                : isWaitingForBB
                  ? "2px solid #f0ad4e" // Оранжевая рамка для ожидающих ББ
                  : `2px solid ${canSit ? "#aaffaa" : isFree ? "#777" : "#444"}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              textAlign: "center",
              cursor: canSit ? "pointer" : "default",
              transition: "all 0.3s",
              boxShadow: isActive ? "0 0 15px #FFD700" : "none",
            }}
            onClick={() => canSit && onSit(i)}
          >
            {isActive && turnExpiresAt && (
              <div style={{
                position: 'absolute',
                top: -25,
                background: timeLeft < 10 ? '#ff4444' : '#444',
                color: 'white',
                padding: '2px 8px',
                borderRadius: 10,
                fontWeight: 'bold',
                fontSize: 14,
                boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
                zIndex: 10
              }}>
                {timeLeft}s
              </div>
            )}

            {player ? (
              <>
                {/* Avatar and Name */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  marginBottom: 5,
                  position: 'absolute',
                  top: -35,
                  background: 'rgba(0,0,0,0.7)',
                  padding: '4px 8px',
                  borderRadius: 10,
                  whiteSpace: 'nowrap',
                  zIndex: 5
                }}>
                  {player.avatarUrl && (
                    <img
                      src={player.avatarUrl}
                      alt="Avatar"
                      style={{ width: 20, height: 20, borderRadius: '50%' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <span style={{ fontSize: 12, fontWeight: 'bold' }}>
                    {player.displayName || `Player ${player.id.slice(0, 4)}`}
                  </span>
                </div>

                {/* Карты */}
                <div style={{ transform: "scale(0.8)", marginBottom: -10 }}>
                   <HandDisplay cards={player.hand} size={60} />
                </div>
                
                {/* Инфо об игроке */}
                <div style={{ fontSize: 12, marginTop: 5 }}>
                    <div>Stack: {player.chips}</div>
                    {player.bet > 0 && <div style={{color: '#aaaaff'}}>Bet: {player.bet}</div>}
                    {player.folded && <div style={{color: '#ff6666'}}>FOLD</div>}
                    {player.waitingForBB && <div style={{color: '#f0ad4e'}}>Ждет ББ</div>}
                </div>
              </>
            ) : (
              <>
                <div style={{fontSize: 12}}>Empty</div>
                {canSit && <div style={{ marginTop: 2, fontWeight: 'bold' }}>SIT</div>}
              </>
            )}
          </div>
        );
      })}
    </>
  );
};

export default SeatsDisplay;