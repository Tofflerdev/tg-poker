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
  onSit: (seat: number) => void;
}

const SeatsDisplay: React.FC<SeatsDisplayProps> = ({
  seats,
  mySeat,
  tableWidth,
  tableHeight,
  seatSize = 120,
  currentPlayer,
  onSit,
}) => {
  const seatOffset = 50;

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

        return (
          <div
            key={i}
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
                : `2px solid ${canSit ? "#aaffaa" : isFree ? "#777" : "#444"}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              textAlign: "center",
              cursor: canSit ? "pointer" : "default",
              transition: "all 0.3s",
              boxShadow: isActive ? "0 0 15px #FFD700" : "none"
            }}
            onClick={() => canSit && onSit(i)}
          >
            {player ? (
              <>
                {/* Карты */}
                <div style={{ transform: "scale(0.8)", marginBottom: -10 }}>
                   <HandDisplay cards={player.hand} size={60} />
                </div>
                
                {/* Инфо об игроке */}
                <div style={{ fontSize: 12, marginTop: 5 }}>
                    <div>Stack: {player.chips}</div>
                    {player.bet > 0 && <div style={{color: '#aaaaff'}}>Bet: {player.bet}</div>}
                    {player.folded && <div style={{color: '#ff6666'}}>FOLD</div>}
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