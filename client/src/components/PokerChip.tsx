import React from "react";

interface PokerChipProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
  animateType?: 'bounce' | 'pulse' | 'slide' | null;
  style?: React.CSSProperties;
}

const sizeMap = {
  sm: { width: 28, fontSize: 9 },
  md: { width: 44, fontSize: 11 },
  lg: { width: 60, fontSize: 14 },
};

// Определяем цвет фишки по номиналу
export const getChipColor = (value: number): string => {
  if (value >= 1000) return '#212121'; // black
  if (value >= 500) return '#7b1fa2'; // purple
  if (value >= 100) return '#1e88e5'; // blue
  if (value >= 50) return '#43a047'; // green
  if (value >= 25) return '#ffb300'; // yellow
  if (value >= 10) return '#e53935'; // red
  return '#fb8c00'; // orange for small values
};

const PokerChip: React.FC<PokerChipProps> = ({ 
  value, 
  size = 'md',
  animated = false,
  animateType = null,
  style 
}) => {
  const { width, fontSize } = sizeMap[size];
  const color = getChipColor(value);
  
  const animationClass = animated && animateType ? `chip-${animateType}` : '';

  // Форматируем значение для отображения
  const displayValue = value >= 1000 
    ? `${(value / 1000).toFixed(1)}k` 
    : value.toString();

  return (
    <div
      className={`poker-chip ${animationClass}`}
      style={{
        width,
        height: width,
        borderRadius: '50%',
        backgroundColor: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize,
        color: value >= 25 && value < 100 ? '#000' : '#fff',
        boxShadow: `
          0 3px 6px rgba(0, 0, 0, 0.3),
          inset 0 2px 4px rgba(255, 255, 255, 0.3),
          inset 0 -2px 4px rgba(0, 0, 0, 0.2)
        `,
        border: '3px dashed rgba(255, 255, 255, 0.4)',
        textShadow: value >= 25 && value < 100 ? 'none' : '0 1px 2px rgba(0,0,0,0.5)',
        ...style,
      }}
    >
      {displayValue}
    </div>
  );
};

// Компонент для стопки фишек
interface ChipStackProps {
  totalValue: number;
  maxChips?: number;
  size?: 'sm' | 'md' | 'lg';
}

export const ChipStack: React.FC<ChipStackProps> = ({ 
  totalValue, 
  maxChips = 8,
  size = 'md' 
}) => {
  // Рассчитываем номиналы фишек для стопки
  const calculateChips = (value: number): number[] => {
    const denominations = [1000, 500, 100, 50, 25, 10, 5, 1];
    const chips: number[] = [];
    let remaining = value;
    
    for (const denom of denominations) {
      while (remaining >= denom && chips.length < maxChips) {
        chips.push(denom);
        remaining -= denom;
      }
    }
    
    return chips;
  };

  const chips = calculateChips(totalValue);

  return (
    <div className="chip-stack" style={{ position: 'relative', height: chips.length * 6 + 30 }}>
      {chips.map((value, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            bottom: index * 6,
            left: 0,
            zIndex: chips.length - index,
            animation: `chip-stack-drop 0.3s ease-out ${index * 0.05}s both`,
          }}
        >
          <PokerChip value={value} size={size} />
        </div>
      ))}
      {chips.length === maxChips && totalValue > chips.reduce((a, b) => a + b, 0) && (
        <div
          style={{
            position: 'absolute',
            bottom: chips.length * 6,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            padding: '2px 6px',
            borderRadius: 10,
            fontSize: 10,
            fontWeight: 'bold',
          }}
        >
          +
        </div>
      )}
    </div>
  );
};

export default PokerChip;
