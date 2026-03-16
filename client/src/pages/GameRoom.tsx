import React, { useState, useEffect } from "react";
import { Socket } from "socket.io-client";
import Table from "../components/Table";
import GameControls from "../components/GameControls";
import Chat from "../components/Chat";
import type { GameState, ShowdownResult, TelegramUser, ExtendedServerEvents, ExtendedClientEvents } from "../../../types/index";
import { useTelegram } from "../hooks/useTelegram";

interface GameRoomProps {
  socket: Socket<ExtendedServerEvents, ExtendedClientEvents>;
  tableId: string;
  gameState: GameState;
  currentUser: TelegramUser | null;
  mySeat: number | null;
  showdown: ShowdownResult | null;
  onLeaveTable: () => void;
}

export const GameRoom: React.FC<GameRoomProps> = ({
  socket,
  tableId,
  gameState,
  mySeat,
  showdown,
  currentUser,
  onLeaveTable,
}) => {
  const { showBackButton, hideBackButton, setHeaderColor, showConfirm, hapticFeedback } = useTelegram();
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [lastStage, setLastStage] = useState(gameState.stage);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Handle back button and header
  useEffect(() => {
    setHeaderColor("#1a472a"); // Dark green for poker table
    
    showBackButton(() => {
      showConfirm("Покинуть стол?", (confirmed) => {
        if (confirmed) {
          onLeaveTable();
        }
      });
    });

    return () => {
      hideBackButton();
    };
  }, [showBackButton, hideBackButton, setHeaderColor, showConfirm, onLeaveTable]);

  // Track turn changes for haptic feedback
  useEffect(() => {
    const wasMyTurn = isMyTurn;
    const nowMyTurn = mySeat !== null && gameState.currentPlayer === mySeat;
    
    if (!wasMyTurn && nowMyTurn) {
      // It's now my turn - provide haptic notification
      hapticFeedback?.notificationOccurred("warning");
    }
    
    setIsMyTurn(nowMyTurn);
  }, [gameState.currentPlayer, mySeat, isMyTurn, hapticFeedback]);

  // Track stage changes for haptic feedback
  useEffect(() => {
    if (lastStage !== gameState.stage) {
      // Stage changed - provide light haptic
      hapticFeedback?.impactOccurred("light");
      
      // Special feedback for showdown
      if (gameState.stage === "showdown") {
        hapticFeedback?.notificationOccurred("success");
      }
      
      setLastStage(gameState.stage);
    }
  }, [gameState.stage, lastStage, hapticFeedback]);

  // Handle showdown results
  useEffect(() => {
    if (showdown && mySeat !== null) {
      const myResult = showdown.results.find(r => r.seat === mySeat);
      if (myResult) {
        // Server uses socket.id for player identification in game state
        const isWinner = showdown.winners.some(w => w.id === socket.id);
        if (isWinner) {
          hapticFeedback?.notificationOccurred("success");
        }
      }
    }
  }, [showdown, mySeat, currentUser, hapticFeedback]);

  const handleSeatClick = (seat: number) => {
    if (mySeat === null && !selectedSeat) {
      setSelectedSeat(seat);
      hapticFeedback?.impactOccurred("light");
    }
  };

  const handleJoinSeat = () => {
    if (selectedSeat !== null) {
      socket.emit("join", selectedSeat);
      setSelectedSeat(null);
      hapticFeedback?.impactOccurred("medium");
    }
  };

  const handleCancelSeat = () => {
    setSelectedSeat(null);
    hapticFeedback?.impactOccurred("light");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0d3328] to-[#1a472a] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 bg-black/30 text-white z-10">
        <div className="flex flex-col">
          <span className="text-xs opacity-70">Table #{tableId.slice(-4)}</span>
          <span className="text-sm font-medium uppercase">{getStageText(gameState.stage)}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-70">Pot:</span>
          <span className={`text-lg font-bold text-[#ffd700] ${showdown ? "animate-pulse" : ""}`}>
            {gameState.totalPot.toLocaleString()}
          </span>
        </div>

        <button 
          onClick={() => setIsChatOpen(true)}
          className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors relative"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          {/* Optional: Unread badge could go here */}
        </button>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col relative">
        {/* Table */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
          <Table
            seats={gameState.seats}
            spectators={gameState.spectators}
            mySeat={mySeat}
            communityCards={gameState.communityCards}
            currentPlayer={gameState.currentPlayer}
            turnExpiresAt={gameState.turnExpiresAt || undefined}
            pots={gameState.pots}
            totalPot={gameState.totalPot}
            dealerPosition={gameState.dealerPosition}
            stage={gameState.stage}
            lastRoundBets={gameState.lastRoundBets}
            onSit={handleSeatClick}
          />
        </div>

        {/* Seat Confirmation Modal */}
        {mySeat === null && selectedSeat !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl p-6 shadow-2xl w-full max-w-xs text-center animate-in fade-in zoom-in duration-200">
              <p className="text-lg font-medium mb-6 text-gray-900">Take seat {selectedSeat + 1}?</p>
              <div className="flex gap-3 justify-center">
                <button 
                  className="flex-1 py-2 px-4 bg-green-600 text-white rounded-lg font-medium active:scale-95 transition-transform"
                  onClick={handleJoinSeat}
                >
                  Yes
                </button>
                <button 
                  className="flex-1 py-2 px-4 bg-gray-200 text-gray-800 rounded-lg font-medium active:scale-95 transition-transform"
                  onClick={handleCancelSeat}
                >
                  No
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Game Controls - Sticky Bottom */}
        <div className="w-full z-20">
          <GameControls
            socket={socket}
            gameState={gameState}
            mySeat={mySeat}
          />
        </div>
      </div>

      {/* Chat Overlay (Bottom Sheet) */}
      {isChatOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsChatOpen(false)}
          />
          <div className="relative bg-[#1c1c1e] w-full h-[60vh] rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center p-3 border-b border-white/10 bg-[#2c2c2e]">
              <h3 className="font-medium text-white">Chat</h3>
              <button 
                onClick={() => setIsChatOpen(false)}
                className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <Chat 
                socket={socket}
                currentUser={currentUser}
                tableId={tableId}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function getStageText(stage: GameState["stage"]): string {
  switch (stage) {
    case "waiting":
      return "Waiting";
    case "preflop":
      return "Preflop";
    case "flop":
      return "Flop";
    case "turn":
      return "Turn";
    case "river":
      return "River";
    case "showdown":
      return "Showdown";
    default:
      return stage;
  }
}
