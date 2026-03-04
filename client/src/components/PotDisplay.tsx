import React from "react";
import { Pot } from "../../../types/index";

interface PotDisplayProps {
  pots: Pot[];
  totalPot: number;
}

const PotDisplay: React.FC<PotDisplayProps> = ({ pots, totalPot }) => {
  return (
    <div className="flex flex-col items-center gap-1 z-10">
      <div className="bg-black/60 px-4 py-1.5 rounded-full flex items-center gap-2 border border-white/10 backdrop-blur-sm shadow-lg">
        <span className="text-xs text-gray-300 uppercase font-bold tracking-wider">Pot</span>
        <span className="text-yellow-400 font-bold font-mono text-lg">{totalPot}</span>
      </div>
      
      {/* Side pots if any */}
      {pots.length > 1 && (
        <div className="flex gap-2 text-[10px] text-gray-400">
          {pots.map((pot, i) => (
            <div key={i} className="bg-black/40 px-2 py-0.5 rounded border border-white/5">
              {i === 0 ? "Main" : `Side ${i}`}: {pot.amount}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PotDisplay;
