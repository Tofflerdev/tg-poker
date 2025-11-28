import React from "react";
import SeatsDisplay from "./SeatsDisplay";
import CommunityCards from "./CommunityCards";

interface Player {
  id: string;
  seat?: number; // у наблюдателей места нет
  hand: string[];
}

interface TableProps {
  seats?: (Player | null)[];      // делаем необязательными
  spectators?: Player[];          // делаем необязательными
  mySeat: number | null;
  tableWidth?: number;
  tableHeight?: number;
  seatSize?: number;
  seatOffset?: number;
  communityCards?: string[];      // делаем необязательными
  onSit: (seat: number) => void;
}

const Table: React.FC<TableProps> = ({
  seats = [],                      // дефолт — пустой массив
  spectators = [],                 // дефолт — пустой массив
  mySeat,
  tableWidth = 700,
  tableHeight = 400,
  seatSize = 120,
  seatOffset = 50,
  communityCards = [],             // дефолт — пустой массив
  onSit,
}) => {
  return (
    <>
      <div
        style={{
          position: "relative",
          width: tableWidth,
          height: tableHeight,
          margin: "60px auto",
          borderRadius: "50% / 30%",
          background: "green",
          border: "10px solid brown",
        }}
      >
        {/* Игроки вокруг стола */}
        <SeatsDisplay
          seats={seats}
          mySeat={mySeat}
          tableWidth={tableWidth}
          tableHeight={tableHeight}
          seatSize={seatSize}
          seatOffset={seatOffset}
          onSit={onSit}
        />

        {/* Community Cards в центре стола */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          <CommunityCards cards={communityCards} spacing={10} size={60} />
        </div>
      </div>

      {/* Наблюдатели под столом */}
      <div style={{ marginTop: 20 }}>
        <h3>Наблюдатели</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {spectators.map((s) => (
            <div
              key={s.id}
              style={{
                padding: "5px 10px",
                background: "#555",
                borderRadius: 5,
                color: "#fff",
              }}
            >
              {s.id}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default Table;
