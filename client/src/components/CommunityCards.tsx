import React, { useEffect, useRef } from "react";
import AnimatedCard from "./AnimatedCard";

interface CommunityCardsProps {
  cards: string[];
  size?: number;      // размер карты в пикселях
  spacing?: number;   // расстояние между картами
  animated?: boolean; // включить анимации
}

const DEAL_STAGGER_MS = 100;

const CommunityCards: React.FC<CommunityCardsProps> = ({
  cards,
  size = 60,
  spacing = 10,
  animated = true,
}) => {
  // Сколько карт уже лежало на столе до этой раздачи: ступенчатую задержку
  // отсчитываем от них, иначе терн ждал бы 300 мс, а ривер — 400 мс.
  const prevCountRef = useRef(0);
  const alreadyDealt = prevCountRef.current;

  useEffect(() => {
    prevCountRef.current = cards.length;
  }, [cards.length]);

  return (
    <div
      className="flex justify-center items-center"
      style={{ gap: spacing }}
    >
      {cards.map((code, idx) => (
        // Ключ включает код карты: новая карта монтируется заново и проигрывает
        // раздачу, уже лежащие остаются на месте и не переигрывают анимацию.
        <AnimatedCard
          key={`${idx}-${code}`}
          code={code}
          size={size}
          animate={animated ? 'deal' : null}
          delay={animated ? Math.max(0, idx - alreadyDealt) * DEAL_STAGGER_MS : 0}
        />
      ))}
    </div>
  );
};

export default CommunityCards;
