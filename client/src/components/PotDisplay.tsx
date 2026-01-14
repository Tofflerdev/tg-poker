import React from "react";
import { Pot } from "../../../types/index";

interface PotDisplayProps {
  pots: Pot[];
  totalPot: number;
}

const PotDisplay: React.FC<PotDisplayProps> = ({ pots, totalPot }) => {
  if (totalPot === 0) {
    return null;
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 5,
      padding: "10px 20px",
      background: "rgba(0, 0, 0, 0.5)",
      borderRadius: 10,
      minWidth: 120,
    }}>
      {/* Общий банк */}
      <div style={{
        fontSize: 18,
        fontWeight: "bold",
        color: "#FFD700",
        textShadow: "0 0 10px rgba(255, 215, 0, 0.5)",
      }}>
        💰 {totalPot}
      </div>

      {/* Разбивка по потам (показываем только если больше одного пота) */}
      {pots.length > 1 && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 3,
          marginTop: 5,
          fontSize: 12,
          color: "#ccc",
        }}>
          {pots.map((pot, i) => (
            <div key={i} style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
            }}>
              <span style={{ color: i === 0 ? "#fff" : "#aaa" }}>
                {pot.name}:
              </span>
              <span style={{ 
                fontWeight: "bold",
                color: i === 0 ? "#FFD700" : "#FFA500",
              }}>
                {pot.amount}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PotDisplay;
