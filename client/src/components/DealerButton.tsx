import React from "react";

interface DealerButtonProps {
  dealerPosition: number;
  mySeat: number | null;
  stage: string;
}

// Positions ON THE TABLE FELT, offset to the SIDE of each seat so the button
// doesn't overlap player cards, names, avatars, or community cards.
// The felt ellipse spans ~10%-90% horizontally and ~15%-85% vertically.
// Each position is placed in the "dead space" on the felt near the seat,
// shifted laterally (clockwise) from the seat's direct line to center.
const DEALER_BUTTON_ON_TABLE = [
  { left: 62, top: 76 },  // 0: Bottom Center — right side of bottom
  { left: 16, top: 58 },  // 1: Bottom Left — just inside left edge, mid-low
  { left: 16, top: 42 },  // 2: Top Left — just inside left edge, mid-high
  { left: 38, top: 24 },  // 3: Top Center — left side of top
  { left: 84, top: 42 },  // 4: Top Right — just inside right edge, mid-high
  { left: 84, top: 58 },  // 5: Bottom Right — just inside right edge, mid-low
];

const DealerButton: React.FC<DealerButtonProps> = ({
  dealerPosition,
  mySeat,
  stage,
}) => {
  // Don't show if dealerPosition is invalid or no active hand
  if (dealerPosition == null || dealerPosition < 0 || dealerPosition >= 6) return null;

  const totalSeats = 6;
  const rotationOffset = mySeat !== null ? mySeat : 0;
  const visualIndex = (dealerPosition - rotationOffset + totalSeats) % totalSeats;

  const pos = DEALER_BUTTON_ON_TABLE[visualIndex];

  return (
    <div
      className="absolute transition-all duration-700 ease-in-out pointer-events-none"
      style={{
        left: `${pos.left}%`,
        top: `${pos.top}%`,
        transform: "translate(-50%, -50%)",
        zIndex: 25,
      }}
    >
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 26,
          height: 26,
          background: "linear-gradient(135deg, #ffffff 0%, #e8e8e8 100%)",
          border: "2.5px solid #b0b0b0",
          boxShadow: "0 2px 6px rgba(0,0,0,0.4), inset 0 1px 3px rgba(255,255,255,0.8)",
        }}
      >
        <span
          className="font-bold leading-none select-none"
          style={{ fontSize: 13, color: "#222", textShadow: "0 1px 0 rgba(255,255,255,0.5)" }}
        >
          D
        </span>
      </div>
    </div>
  );
};

export default DealerButton;
