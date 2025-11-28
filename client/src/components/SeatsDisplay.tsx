import React from "react";
import HandDisplay from "./HandDisplay";

interface Player {
  id: string;
  seat?: number; // у наблюдателей может не быть места
  hand: string[];
}

interface SeatsDisplayProps {
  seats: (Player | null)[];
  mySeat: number | null;
  tableWidth: number;
  tableHeight: number;
  seatSize?: number;
  seatOffset?: number;
  onSit: (seat: number) => void;
}

const SeatsDisplay: React.FC<SeatsDisplayProps> = ({
  seats,
  mySeat,
  tableWidth,
  tableHeight,
  seatSize = 120,
  seatOffset = 50,
  onSit,
}) => {
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
              background: canSit ? "#4a7a4a" : isFree ? "#3a5a3a" : "#444",
              border: `2px solid ${canSit ? "#aaffaa" : isFree ? "#777" : "#555"}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              textAlign: "center",
              cursor: canSit ? "pointer" : "default",
              transition: "background 0.2s, border 0.2s",
            }}
            onMouseEnter={(e) => {
              if (canSit) e.currentTarget.style.background = "#5fbf5f";
            }}
            onMouseLeave={(e) => {
              if (canSit) e.currentTarget.style.background = "#4a7a4a";
            }}
            onClick={() => canSit && onSit(i)}
          >
            {player ? (
              <HandDisplay cards={player.hand} title={`Player`} />
            ) : (
              <>
                <div>Место свободно</div>
                {canSit && <div style={{ marginTop: 5 }}>Сесть</div>}
              </>
            )}
          </div>
        );
      })}
    </>
  );
};

export default SeatsDisplay;
