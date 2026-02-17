import React from "react";
import AnimatedCard from "./AnimatedCard";

interface CommunityCardsProps {
  cards: string[];
  size?: number;      // размер карты в пикселях
  spacing?: number;   // расстояние между картами
  animated?: boolean; // включить анимации
}

const CommunityCards: React.FC<CommunityCardsProps> = ({
  cards,
  size = 60,
  spacing = 10,
  animated = true,
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
        <AnimatedCard 
          key={idx} 
          code={code} 
          size={size} 
          animate={animated ? 'deal' : null}
          delay={animated ? idx * 100 : 0}
        />
      ))}
    </div>
  );
};

export default CommunityCards;
