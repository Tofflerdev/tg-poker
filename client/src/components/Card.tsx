import React from "react";

interface CardProps {
  code?: string; // например "AS", "10H", "KD" или пустая строка
  size?: number; // размер карты в пикселях
  style?: React.CSSProperties;
}

const Card: React.FC<CardProps> = ({ code, size = 60, style }) => {
  // 🔹 путь к картинкам
  const src = code
    ? `/src/assets/cards/${code}.png`
    : `/src/assets/cards/back.png`; // <-- рубашка

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
