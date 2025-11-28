import React from "react";
import Card from "./Card";

interface HandDisplayProps {
  cards: string[];
  title?: string;
  size?: number;    // размер карты в пикселях
  overlap?: number; // сколько пикселей карты накладываются друг на друга
}

const HandDisplay: React.FC<HandDisplayProps> = ({
  cards,
  title,
  size = 60,
  overlap = 20,
}) => {
  const containerHeight = size * 1.4; // высота подложки
  const totalWidth = cards.length > 0 ? size + (cards.length - 1) * (size - overlap) : 0;

  return (
    <div style={{ marginBottom: 20 }}>
      {title && <h3>{title}</h3>}
      <div
        style={{
          position: "relative",
          height: containerHeight,
          width: totalWidth, // ширина подложки равна ширине всей руки
          margin: "0 auto",  // горизонтальное центрирование подложки
        }}
      >
        {cards.map((c, i) => (
          <Card
            key={i}
            code={c}
            size={size}
            style={{
              position: "absolute",
              left: i * (size - overlap),
              top: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default HandDisplay;
