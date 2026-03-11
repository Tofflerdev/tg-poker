import React from "react";
import dealerButtonImg from "../assets/dealer-button.svg";

interface DealerButtonProps {
  dealerPosition: number;
  mySeat: number | null;
  stage: string;
}

// Dealer button positions (% of outer container), derived from seat positions
// and shifted toward the table center so the button stays inside the felt.
//
// Seat positions (from SeatsDisplay):
//   0: 50%,96%  1: 4%,72%  2: 4%,28%  3: 50%,4%  4: 96%,28%  5: 96%,72%
//
// Felt ellipse spans 10%-90% horizontally, 15%-85% vertically.
// Community cards occupy roughly 35%-65% horizontal, 40%-60% vertical.
// Each button position sits between its seat and the table center,
// inside the felt but outside the community-cards zone.
const DEALER_BUTTON_ON_TABLE = [
  { left: 38, top: 78 },  // 0: Bottom Center — up-left from seat, inside felt bottom
  { left: 20, top: 65 },  // 1: Bottom Left — right-up from seat, inside felt left-bottom
  { left: 20, top: 35 },  // 2: Top Left — right-down from seat, inside felt left-top
  { left: 38, top: 22 },  // 3: Top Center — down-left from seat, inside felt top
  { left: 80, top: 35 },  // 4: Top Right — left-down from seat, inside felt right-top
  { left: 80, top: 65 },  // 5: Bottom Right — left-up from seat, inside felt right-bottom
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
      <img
        src={dealerButtonImg}
        alt="Dealer"
        draggable={false}
        style={{
          width: "clamp(20px, 4vw, 30px)",
          height: "clamp(20px, 4vw, 30px)",
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
          userSelect: "none",
        }}
      />
    </div>
  );
};

export default DealerButton;
