import React from "react";
import { cardSrc, CARD_RADIUS_RATIO } from "./cardSrc";

interface CardProps {
  code?: string; // например "AS", "10H", "KD" или пустая строка
  size?: number; // размер карты в пикселях
  style?: React.CSSProperties;
}

const Card: React.FC<CardProps> = ({ code, size = 60, style }) => {
  const src = cardSrc(code);

  return (
    <img
      src={src}
      alt={code || "back"}
      style={{
        width: size,
        height: size * 1.4, // стандартное соотношение карт
        // Радиус пропорционален размеру и совпадает с запечённым в PNG.
        // Фиксированные 6px на карте шириной 28 срезали бы рамку в углах,
        // а на 60 — наоборот, оголяли её.
        borderRadius: size * CARD_RADIUS_RATIO,
        boxShadow: "0 2px 5px rgba(0,0,0,0.5)",
        transition: "transform 0.3s",
        ...style,
      }}
    />
  );
};

export default Card;
