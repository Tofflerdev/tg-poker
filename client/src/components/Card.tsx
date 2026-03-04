import React from "react";

interface CardProps {
  code?: string; // например "AS", "10H", "KD" или пустая строка
  size?: number; // размер карты в пикселях
  style?: React.CSSProperties;
}

const Card: React.FC<CardProps> = ({ code, size = 60, style }) => {
  // 🔹 путь к картинкам (public/cards/ — works in both dev and production)
  const src = code
    ? `/cards/${code}.png`
    : `/cards/back.png`;

  return (
    <img
      src={src}
      alt={code || "back"}
      style={{
        width: size,
        height: size * 1.4, // стандартное соотношение карт
        borderRadius: 6,
        boxShadow: "0 2px 5px rgba(0,0,0,0.5)",
        transition: "transform 0.3s",
        ...style,
      }}
    />
  );
};

export default Card;
