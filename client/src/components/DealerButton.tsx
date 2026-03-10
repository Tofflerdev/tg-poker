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
  // Don't show if dealerPosition is invalid
  if (dealerPosition < 0 || dealerPosition >= 6) return null;

  const totalSeats = 6;
  const rotationOffset = mySeat !== null ? mySeat : 0;
  const visualIndex = (dealerPosition - rotationOffset + totalSeats) % totalSeats;

  const pos = DEALER_BUTTON_ON_TABLE[visualIndex];

  return (
    <div
      className="absolute z-20 transition-all duration-700 ease-in-out pointer-events-none"
      style={{
        left: `${pos.left}%`,
        top: `${pos.top}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div
        className="flex items-center justify-center rounded-full bg-white"
        style={{
          width: 22,
          height: 22,
          border: "2px solid #d4d4d8",
          boxShadow: "0 1px 4px rgba(0,0,0,0.35), inset 0 1px 2px rgba(255,255,255,0.6)",
        }}
      >
        <span
          className="font-bold leading-none select-none"
          style={{ fontSize: 11, color: "#111" }}
        >
          D
        </span>
      </div>
    </div>
  );
};

export default DealerButton;
