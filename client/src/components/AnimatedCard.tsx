import React, { useState, useEffect } from "react";

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
  const [animationClass, setAnimationClass] = useState('');

  useEffect(() => {
    if (!animate) return;

    const timer = setTimeout(() => {
      switch (animate) {
        case 'deal':
          setAnimationClass('card-deal');
          break;
        case 'flip':
          setIsFlipping(true);
          setTimeout(() => {
            setShowFront(prev => !prev);
            setTimeout(() => {
              setIsFlipping(false);
              onAnimationEnd?.();
            }, 150);
          }, 150);
          break;
        case 'win':
          setAnimationClass('card-win');
          break;
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [animate, delay, onAnimationEnd]);

  // Сброс анимации после её завершения
  useEffect(() => {
    if (animationClass) {
      const timer = setTimeout(() => {
        setAnimationClass('');
        onAnimationEnd?.();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [animationClass, onAnimationEnd]);

  const src = showFront && code
    ? `/cards/${code.toUpperCase()}.png`
    : "/cards/back.png";

  return (
    <div
      className={`card-container ${animationClass}`}
      style={{
        width: size,
        height: size * 1.4,
        perspective: '1000px',
        display: 'inline-block',
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
          borderRadius: 6,
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
