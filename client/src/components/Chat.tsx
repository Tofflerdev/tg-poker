import React, { useState, useRef, useEffect } from "react";
import { Socket } from "socket.io-client";
import type { ChatMessage, ExtendedServerEvents, ExtendedClientEvents, TelegramUser } from "../../../types/index";
import { useTelegram } from "../hooks/useTelegram";

interface ChatProps {
  socket: Socket<ExtendedServerEvents, ExtendedClientEvents>;
  currentUser: TelegramUser | null;
  tableId: string;
}

const Chat: React.FC<ChatProps> = ({ socket, currentUser, tableId }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { hapticFeedback } = useTelegram();

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Listen for chat messages
  useEffect(() => {
    const handleChatMessage = (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
      
      // Haptic feedback for new messages (if not from current user)
      if (message.authorId !== currentUser?.id && hapticFeedback) {
        hapticFeedback.selectionChanged();
      }
    };

    const handleSystemMessage = (text: string) => {
      const systemMessage: ChatMessage = {
        id: `system-${Date.now()}`,
        authorId: "system",
        authorName: "System",
        text,
        timestamp: Date.now(),
        type: "system",
      };
      setMessages((prev) => [...prev, systemMessage]);
    };

    socket.on("chatMessage", handleChatMessage);
    socket.on("systemMessage", handleSystemMessage);

    // Add welcome message
    handleSystemMessage("Welcome to the table! Good luck 🍀");

    return () => {
      socket.off("chatMessage", handleChatMessage);
      socket.off("systemMessage", handleSystemMessage);
    };
  }, [socket, currentUser, hapticFeedback]);

  const handleSend = () => {
    if (!inputValue.trim() || !currentUser) return;

    const message: Omit<ChatMessage, "id" | "timestamp"> = {
      authorId: currentUser.id,
      authorName: currentUser.displayName || currentUser.username || currentUser.firstName,
      text: inputValue.trim(),
      type: "player",
    };

    socket.emit("sendChatMessage", message);
    setInputValue("");
    
    // Haptic feedback on send
    hapticFeedback?.impactOccurred("light");
    
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    
    // Auto-resize textarea
    const target = e.target;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 100)}px`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { 
      hour: "2-digit", 
      minute: "2-digit",
      hour12: false
    });
  };

  const isOwnMessage = (msg: ChatMessage) => msg.authorId === currentUser?.id;

  return (
    <div className="flex flex-col h-full bg-[#1c1c1e]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8 text-sm">
            No messages yet. Start the conversation!
          </div>
        )}

        {messages.map((msg) => {
          if (msg.type === "system") {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <div className="bg-white/10 text-gray-300 text-xs px-3 py-1 rounded-full italic">
                  {msg.text}
                </div>
              </div>
            );
          }

          const isOwn = isOwnMessage(msg);
          
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}
            >
              {!isOwn && (
                <span className="text-[10px] text-gray-400 ml-1 mb-0.5">
                  {msg.authorName}
                </span>
              )}
              <div
                className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm break-words ${
                  isOwn 
                    ? "bg-blue-600 text-white rounded-br-none" 
                    : "bg-[#2c2c2e] text-white rounded-bl-none"
                }`}
              >
                {msg.text}
              </div>
              <span className="text-[10px] text-gray-500 mt-0.5 px-1">
                {formatTime(msg.timestamp)}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 bg-[#2c2c2e] border-t border-white/5 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          className="flex-1 bg-[#1c1c1e] text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none max-h-[100px]"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          disabled={!currentUser}
        />
        <button
          className="p-2 bg-blue-600 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors flex-shrink-0"
          onClick={handleSend}
          disabled={!inputValue.trim() || !currentUser}
          aria-label="Send"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Chat;
