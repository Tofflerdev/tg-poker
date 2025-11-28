import React from "react";
import Card from "./Card"; // используем ваш компонент Card

interface CommunityCardsProps {
  cards: string[];
  size?: number;      // размер карты в пикселях
  spacing?: number;   // расстояние между картами
}

const CommunityCards: React.FC<CommunityCardsProps> = ({
  cards,
  size = 60,
  spacing = 10, // уменьшено до 10px
}) => {
  return (
    <div
      style={{
        display: "flex",
        gap: `${spacing}px`,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {cards.map((code, idx) => (
        <Card key={idx} code={code} size={size} />
      ))}
    </div>
  );
};

export default CommunityCards;
