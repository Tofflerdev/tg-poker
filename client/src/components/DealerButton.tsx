import React from "react";
import dealerButtonImg from "../assets/dealer-button.svg";

interface DealerButtonProps {
  dealerPosition: number;
  mySeat: number | null;
  stage: string;
  isMobile?: boolean;
}

// Desktop: dealer button positions (horizontal table)
const DEALER_POSITIONS_DESKTOP = [
  { left: 38, top: 78 },  // 0: Bottom Center
  { left: 20, top: 65 },  // 1: Bottom Left
  { left: 20, top: 35 },  // 2: Top Left
  { left: 38, top: 22 },  // 3: Top Center
  { left: 80, top: 35 },  // 4: Top Right
  { left: 80, top: 65 },  // 5: Bottom Right
];

// Mobile: dealer button positions (vertical table)
const DEALER_POSITIONS_MOBILE = [
  { left: 62, top: 82 },  // 0: Bottom Center (me)
  { left: 22, top: 72 },  // 1: Bottom Left
  { left: 22, top: 38 },  // 2: Left mid
  { left: 38, top: 18 },  // 3: Top Center
  { left: 78, top: 38 },  // 4: Right mid
  { left: 78, top: 72 },  // 5: Bottom Right
];

const DealerButton: React.FC<DealerButtonProps> = ({
  dealerPosition,
  mySeat,
  stage,
  isMobile = false,
}) => {
  if (dealerPosition == null || dealerPosition < 0 || dealerPosition >= 6) return null;

  const totalSeats = 6;
  const rotationOffset = mySeat !== null ? mySeat : 0;
  const visualIndex = (dealerPosition - rotationOffset + totalSeats) % totalSeats;

  const positions = isMobile ? DEALER_POSITIONS_MOBILE : DEALER_POSITIONS_DESKTOP;
  const pos = positions[visualIndex];

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
