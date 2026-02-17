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
        const isWinner = showdown.winners.some(w => w.id === currentUser?.id);
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
    <div className="game-room">
      <div className="game-room__main">
        {/* Table Header */}
        <div className="table-header">
          <div className="table-info">
            <span className="table-id">Стол #{tableId.slice(-4)}</span>
            <span className="game-stage">{getStageText(gameState.stage)}</span>
          </div>
          <div className="pot-info">
            <span className="pot-label">Банк:</span>
            <span className={`pot-value ${showdown ? "pot-win-animation" : ""}`}>
              {gameState.totalPot.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="game-room__content">
          {/* Table Area */}
          <div className="game-room__table-area">
            <div className="game-container">
              <Table 
                seats={gameState.seats}
                spectators={gameState.spectators}
                mySeat={mySeat}
                communityCards={gameState.communityCards}
                currentPlayer={gameState.currentPlayer}
                turnExpiresAt={gameState.turnExpiresAt || undefined}
                pots={gameState.pots}
                totalPot={gameState.totalPot}
                onSit={handleSeatClick}
              />
            </div>

            {/* Seat Confirmation */}
            {mySeat === null && selectedSeat !== null && (
              <div className="seat-confirmation tg-fade-in">
                <p>Занять место {selectedSeat + 1}?</p>
                <div className="confirmation-buttons">
                  <button className="btn-confirm" onClick={handleJoinSeat}>
                    Да
                  </button>
                  <button className="btn-cancel" onClick={handleCancelSeat}>
                    Нет
                  </button>
                </div>
              </div>
            )}

            {/* Game Controls */}
            <GameControls
              socket={socket}
              gameState={gameState}
              mySeat={mySeat}
            />
          </div>

          {/* Sidebar with Chat */}
          <div className="game-room__sidebar">
            <Chat 
              socket={socket}
              currentUser={currentUser}
              tableId={tableId}
            />
          </div>
        </div>
      </div>

      <style>{`
        .game-room {
          min-height: 100vh;
          background: linear-gradient(180deg, #0d3328 0%, #1a472a 100%);
          display: flex;
          flex-direction: column;
        }

        .game-room__main {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .game-room__content {
          flex: 1;
          display: flex;
          gap: 16px;
          padding: 0 16px 16px;
        }

        .game-room__table-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .game-room__sidebar {
          width: 320px;
          flex-shrink: 0;
        }

        @media (max-width: 900px) {
          .game-room__content {
            flex-direction: column;
          }
          
          .game-room__sidebar {
            width: 100%;
            height: 300px;
          }
        }

        .table-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: rgba(0,0,0,0.3);
          color: white;
          margin-bottom: 16px;
        }

        .table-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .table-id {
          font-size: 12px;
          opacity: 0.7;
        }

        .game-stage {
          font-size: 14px;
          font-weight: 500;
          text-transform: uppercase;
        }

        .pot-info {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .pot-label {
          font-size: 12px;
          opacity: 0.7;
        }

        .pot-value {
          font-size: 18px;
          font-weight: 600;
          color: #ffd700;
        }

        .game-container {
          flex: 1;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 16px;
          overflow: auto;
          min-height: 400px;
        }

        .seat-confirmation {
          position: fixed;
          bottom: 200px;
          left: 50%;
          transform: translateX(-50%);
          background: white;
          padding: 16px 24px;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          text-align: center;
          z-index: 100;
        }

        .seat-confirmation p {
          margin: 0 0 12px 0;
          font-weight: 500;
        }

        .confirmation-buttons {
          display: flex;
          gap: 8px;
          justify-content: center;
        }

        .btn-confirm, .btn-cancel {
          padding: 8px 24px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          transition: transform 0.1s, opacity 0.2s;
        }

        .btn-confirm:active, .btn-cancel:active {
          transform: scale(0.95);
        }

        .btn-confirm {
          background: #4CAF50;
          color: white;
        }

        .btn-cancel {
          background: #f0f0f0;
          color: #333;
        }
      `}</style>
    </div>
  );
};

function getStageText(stage: GameState["stage"]): string {
  switch (stage) {
    case "waiting":
      return "Ожидание игроков";
    case "preflop":
      return "Префлоп";
    case "flop":
      return "Флоп";
    case "turn":
      return "Тёрн";
    case "river":
      return "Ривер";
    case "showdown":
      return "Вскрытие";
    default:
      return stage;
  }
}
