import React from "react";
import dealerButtonImg from "../assets/dealer-button.svg";
import { DEALER_POSITIONS_DESKTOP, DEALER_POSITIONS_MOBILE } from "./seatLayout";

interface DealerButtonProps {
  dealerPosition: number;
  mySeat: number | null;
  stage: string;
  isMobile?: boolean;
}

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
