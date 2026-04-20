import React, { useState, useEffect } from "react";
import { Socket } from "socket.io-client";
import Table from "../components/Table";
import GameControls from "../components/GameControls";
import Chat from "../components/Chat";
import { Button } from "../components/ui";
import { ActionBubbleLayer } from "../components/ActionBubbleLayer";
import type { GameState, ShowdownResult, TelegramUser, ExtendedServerEvents, ExtendedClientEvents, ActionBubbleEvent } from "../../../types/index";
import { useTelegram } from "../hooks/useTelegram";
import { useIsMobile } from "../hooks/useIsMobile";

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
  const isMobile = useIsMobile();
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [lastStage, setLastStage] = useState(gameState.stage);
  const [isChatOpen, setIsChatOpen] = useState(false);
  // Phase 3 / Plan 03-03: imperative handle wired into ActionBubbleLayer so
  // the socket 'actionBubble' listener can push events without re-subscribing
  // on every re-render. See useEffect below for subscription lifecycle.
  const bubblePushRef = React.useRef<((evt: ActionBubbleEvent) => void) | null>(null);

  // Handle back button and header
  useEffect(() => {
    setHeaderColor("#1a472a");

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
      hapticFeedback?.notificationOccurred("warning");
    }

    setIsMyTurn(nowMyTurn);
  }, [gameState.currentPlayer, mySeat, isMyTurn, hapticFeedback]);

  // Track stage changes for haptic feedback
  useEffect(() => {
    if (lastStage !== gameState.stage) {
      hapticFeedback?.impactOccurred("light");

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
        const isWinner = showdown.winners.some(w => w.id === socket.id);
        if (isWinner) {
          hapticFeedback?.notificationOccurred("success");
        }
      }
    }
  }, [showdown, mySeat, currentUser, hapticFeedback]);

  // Phase 3 / Plan 03-03 (D-01, GAME-02): subscribe to server-broadcast actionBubble.
  // ActionBubbleLayer exposes a push handle via registerPushHandle; we forward
  // each event to it. Subscribe once per socket; cleanup on unmount.
  useEffect(() => {
    const onActionBubble: ExtendedServerEvents['actionBubble'] = (evt) => {
      bubblePushRef.current?.(evt);
    };
    socket.on('actionBubble', onActionBubble);
    return () => {
      socket.off('actionBubble', onActionBubble);
    };
  }, [socket]);

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
    <div className="h-[100dvh] bg-gradient-to-b from-[#0d1b0f] to-[#1a2e1a] flex flex-col overflow-hidden">
      {/*
        Chrome header (D-24 / D-25 / UI-04):
        - Top-left table/phase label REMOVED outright (pot at center, phase self-evident).
        - Top-right pot label REMOVED outright (redundant with PotDisplay).
        - Back-to-menu affordance retained as small top-left chrome button (ui/Button variant="neutral").
        - Chat button retained at top-right (chrome affordance, not a data label).
        Safe-area paddingTop so the back button is reachable under Telegram header.
      */}
      <div
        className="flex justify-between items-center px-3 md:px-4 py-2 md:py-3 text-white z-10"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)' }}
      >
        <Button
          variant="neutral"
          onClick={() => {
            showConfirm("Покинуть стол?", (confirmed) => {
              if (confirmed) onLeaveTable();
            });
          }}
          aria-label="Back to menu"
          style={{
            minHeight: 0,
            width: 44,
            height: 44,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Button>

        {/* Chat opener — chrome only, not a data label */}
        <Button
          variant="neutral"
          onClick={() => setIsChatOpen(true)}
          aria-label="Open chat"
          style={{
            minHeight: 0,
            width: 44,
            height: 44,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 999,
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 md:h-5 md:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </Button>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col relative min-h-0">
        {/* Table */}
        <div className={`flex-1 flex items-center justify-center overflow-hidden min-h-0 ${isMobile ? 'px-2 py-1' : 'p-4'}`}>
          {/* Relative container so ActionBubbleLayer's absolute inset:0 resolves to the table area. */}
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
              blinds={{ small: gameState.smallBlind, big: gameState.bigBlind }}
              showdown={showdown}
              onSit={handleSeatClick}
            />
            {/* Phase 3 / Plan 03-03 (GAME-02, GAME-03): per-seat action-bubble layer. */}
            <ActionBubbleLayer
              mySeat={mySeat}
              isMobile={isMobile}
              registerPushHandle={(push) => { bubblePushRef.current = push; }}
            />
          </div>
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

        {/* Game Controls — docked at bottom */}
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
