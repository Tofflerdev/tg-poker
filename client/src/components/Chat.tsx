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
  const [isTyping, setIsTyping] = useState(false);
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
        authorName: "Система",
        text,
        timestamp: Date.now(),
        type: "system",
      };
      setMessages((prev) => [...prev, systemMessage]);
    };

    socket.on("chatMessage", handleChatMessage);
    socket.on("systemMessage", handleSystemMessage);

    // Add welcome message
    handleSystemMessage("Добро пожаловать за стол! Удачи в игре 🍀");

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
    return date.toLocaleTimeString("ru-RU", { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  const isOwnMessage = (msg: ChatMessage) => msg.authorId === currentUser?.id;

  return (
    <div className="chat-container">
      <div className="chat-header">
        <span>💬 Чат стола</span>
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          {messages.filter(m => m.type === "player").length} сообщений
        </span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{ 
            textAlign: "center", 
            color: "var(--tg-color-hint)", 
            padding: "20px",
            fontSize: 14 
          }}>
            Нет сообщений. Начните общение!
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-message ${
              msg.type === "system" 
                ? "chat-message--system" 
                : isOwnMessage(msg) 
                  ? "chat-message--own" 
                  : "chat-message--other"
            }`}
          >
            {msg.type !== "system" && (
              <div className="chat-message__author">
                {msg.authorName}
              </div>
            )}
            <div>{msg.text}</div>
            <div className="chat-message__time">
              {formatTime(msg.timestamp)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Написать сообщение..."
          rows={1}
          disabled={!currentUser}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!inputValue.trim() || !currentUser}
          aria-label="Отправить"
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
