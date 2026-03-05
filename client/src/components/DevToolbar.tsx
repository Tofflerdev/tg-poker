import React from 'react';
import type { TelegramUser } from '../../../types/index';

interface DevToolbarProps {
  currentUser: TelegramUser | null;
}

/**
 * Dev-only toolbar for local testing.
 * Shows current player info and quick links to open other player tabs.
 * This component is only loaded in DEV mode via lazy import.
 */
const DevToolbar: React.FC<DevToolbarProps> = ({ currentUser }) => {
  const currentDevId = sessionStorage.getItem('devPlayerId');
  const currentPlayerNum = currentDevId && parseInt(currentDevId, 10) >= 100001 && parseInt(currentDevId, 10) <= 100006
    ? parseInt(currentDevId, 10) - 100000
    : null;

  const openPlayerTab = (playerNum: number) => {
    window.open(`${window.location.origin}?player=${playerNum}`, `_player${playerNum}`);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      color: '#e0e0e0',
      padding: '6px 12px',
      fontSize: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontFamily: 'monospace',
      borderBottom: '2px solid #e94560',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      <span style={{ 
        background: '#e94560', 
        color: 'white', 
        padding: '2px 6px', 
        borderRadius: '3px',
        fontWeight: 'bold',
        fontSize: '10px',
        letterSpacing: '0.5px',
      }}>
        DEV
      </span>
      
      <span style={{ color: '#a8d8ea' }}>
        {currentUser 
          ? `👤 ${currentUser.displayName || currentUser.username || `ID:${currentUser.telegramId}`}`
          : '⏳ Not authenticated'
        }
      </span>

      {currentUser && (
        <span style={{ color: '#f8d49a' }}>
          💰 {currentUser.balance}
        </span>
      )}

      <span style={{ color: '#666', margin: '0 4px' }}>|</span>

      <span style={{ color: '#888' }}>Open player:</span>
      {[1, 2, 3, 4, 5, 6].map(num => (
        <button
          key={num}
          onClick={() => openPlayerTab(num)}
          style={{
            background: currentPlayerNum === num ? '#e94560' : '#2a2a4a',
            color: currentPlayerNum === num ? 'white' : '#a8d8ea',
            border: `1px solid ${currentPlayerNum === num ? '#e94560' : '#444'}`,
            borderRadius: '3px',
            padding: '1px 8px',
            cursor: 'pointer',
            fontSize: '11px',
            fontFamily: 'monospace',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            if (currentPlayerNum !== num) {
              e.currentTarget.style.background = '#3a3a5a';
              e.currentTarget.style.borderColor = '#e94560';
            }
          }}
          onMouseLeave={(e) => {
            if (currentPlayerNum !== num) {
              e.currentTarget.style.background = '#2a2a4a';
              e.currentTarget.style.borderColor = '#444';
            }
          }}
          title={`Open as Player ${num} (telegramId: ${100000 + num})`}
        >
          P{num}
        </button>
      ))}
    </div>
  );
};

export default DevToolbar;
