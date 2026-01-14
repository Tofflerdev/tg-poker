import React from "react";
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
  pots?: Pot[];
  totalPot?: number;
  onSit: (seat: number) => void;
  // стили (опционально)
  tableWidth?: number;
  tableHeight?: number;
}

const Table: React.FC<TableProps> = ({
  seats = [],
  spectators = [],
  mySeat,
  communityCards = [],
  currentPlayer,
  pots = [],
  totalPot = 0,
  onSit,
  tableWidth = 700,
  tableHeight = 400,
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
        <SeatsDisplay
          seats={seats}
          mySeat={mySeat}
          tableWidth={tableWidth}
          tableHeight={tableHeight}
          currentPlayer={currentPlayer}
          onSit={onSit}
        />

        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
          }}
        >
          <PotDisplay pots={pots} totalPot={totalPot} />
          <CommunityCards cards={communityCards} spacing={10} size={60} />
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>Наблюдатели ({spectators.length})</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {spectators.map((s, i) => (
            <div
              key={s.id + i}
              style={{ padding: "5px 10px", background: "#555", borderRadius: 5, color: "#fff" }}
            >
              {s.id.substring(0, 5)}...
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default Table;