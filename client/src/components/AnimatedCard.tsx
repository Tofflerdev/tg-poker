import React, { useState, useEffect } from "react";
import { cardSrc, CARD_RADIUS_RATIO } from "./cardSrc";

interface AnimatedCardProps {
  code?: string; // например "AS", "10H", "KD" или пустая строка
  size?: number; // размер карты в пикселях
  style?: React.CSSProperties;
  animate?: 'deal' | 'flip' | 'win' | null; // тип анимации
  delay?: number; // задержка перед началом анимации (мс)
  onAnimationEnd?: () => void;
  faceDown?: boolean; // показывать рубашкой вверх
}

const AnimatedCard: React.FC<AnimatedCardProps> = ({
  code,
  size = 60,
  style,
  animate = null,
  delay = 0,
  onAnimationEnd,
  faceDown = false
}) => {
  const [isFlipping, setIsFlipping] = useState(false);
  const [showFront, setShowFront] = useState(!faceDown);

  // Раздача — чистый CSS, и класс висит уже на первом рендере: вместе с
  // animation-delay и fill-mode: both карта всё время задержки держит стартовый
  // кадр (opacity 0, за пределами стола). Если вешать класс из setTimeout, карта
  // успевает отрисоваться на своём месте, потом пропасть — и только потом лететь.
  const [animationClass, setAnimationClass] = useState(() =>
    animate === 'deal' ? 'card-deal' : ''
  );
  // Задержку фиксируем на монтировании, чтобы перерендеры родителя не дёргали
  // уже запущенную анимацию.
  const [animationDelay] = useState(delay);

  useEffect(() => {
    // 'deal' стартует сам, от CSS-задержки
    if (!animate || animate === 'deal') return;

    const timer = setTimeout(() => {
      if (animate === 'win') {
        setAnimationClass('card-win');
        return;
      }
      // flip
      setIsFlipping(true);
      setTimeout(() => {
        setShowFront(prev => !prev);
        setTimeout(() => {
          setIsFlipping(false);
          onAnimationEnd?.();
        }, 150);
      }, 150);
    }, delay);

    return () => clearTimeout(timer);
  }, [animate, delay, onAnimationEnd]);

  const handleAnimationEnd = (e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    // card-deal оставляем висеть: его конечный кадр совпадает с обычным
    // состоянием карты, а снятие класса дало бы лишний перерендер.
    if (e.animationName === 'card-win') setAnimationClass('');
    onAnimationEnd?.();
  };

  const src = cardSrc(showFront ? code : undefined);

  return (
    <div
      className={`card-container ${animationClass}`}
      onAnimationEnd={handleAnimationEnd}
      style={{
        width: size,
        height: size * 1.4,
        perspective: '1000px',
        display: 'inline-block',
        animationDelay: animationClass ? `${animationDelay}ms` : undefined,
        ...style,
      }}
    >
      <img
        src={src}
        alt={code || "back"}
        className={`animated-card ${isFlipping ? 'card-flipping' : ''}`}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: size * CARD_RADIUS_RATIO,
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          objectFit: 'cover',
          backfaceVisibility: 'hidden',
          transform: isFlipping ? 'rotateY(90deg)' : 'rotateY(0deg)',
          transition: 'transform 0.3s ease-in-out',
        }}
      />
    </div>
  );
};

export default AnimatedCard;
