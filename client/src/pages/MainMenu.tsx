import React from 'react';
import { useTelegram } from '../hooks/useTelegram';
import type { TableInfo, TelegramUser } from '../../../types/index';
import { DailyBonusButton } from '../components/DailyBonusButton';

interface MainMenuProps {
  user: TelegramUser | null;
  tables: TableInfo[];
  onSelectTable: (tableId: string) => void;
  onShowTables: () => void;
  onOpenProfile: () => void;
  onClaimBonus: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ 
  user, 
  tables, 
  onSelectTable, 
  onShowTables,
  onOpenProfile,
  onClaimBonus
}) => {
  const { hideMainButton, setHeaderColor, hapticFeedback } = useTelegram();

  const handleSelectTableClick = (tableId: string) => {
    hapticFeedback?.impactOccurred('medium');
    onSelectTable(tableId);
  };

  const handleShowAllTables = () => {
    hapticFeedback?.impactOccurred('light');
    onShowTables();
  };

  React.useEffect(() => {
    setHeaderColor('#2481cc');
    hideMainButton();

    return () => {
      hideMainButton();
    };
  }, [hideMainButton, setHeaderColor]);

  const getStatusIcon = (status: TableInfo['status']) => {
    switch (status) {
      case 'waiting':
        return '🟢';
      case 'playing':
        return '🔵';
      case 'full':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const firstThreeTables = tables.slice(0, 3);

  return (
    <div className="main-menu">
      <div className="menu-header">
        <div className="logo">🃏 Poker App</div>
        {user && (
          <div className="user-greeting" onClick={onOpenProfile} style={{ cursor: 'pointer' }}>
            <div className="user-info">
              <img 
                src={user.avatarUrl || user.photoUrl || 'https://via.placeholder.com/40'} 
                alt="Avatar" 
                className="user-avatar-small"
                onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40'; }}
              />
              <span>{user.displayName || user.firstName}</span>
            </div>
            <span className="settings-icon">⚙️</span>
          </div>
        )}
      </div>

      <div className="menu-content">
        {user && (
          <div className="balance-card">
            <div className="balance-info">
              <span className="balance-label">Ваш баланс:</span>
              <span className="balance-value">{user.balance.toLocaleString()} 💰</span>
            </div>
            <DailyBonusButton 
              balance={user.balance}
              lastDailyRefill={user.lastDailyRefill}
              canClaimDaily={user.canClaimDaily}
              onClaim={onClaimBonus}
            />
          </div>
        )}

        <div className="menu-card">
          <h2>Добро пожаловать!</h2>
          <p>Играйте в техасский холдем покер прямо в Telegram.</p>
          
          <div className="stats-preview">
            <div className="stat-item">
              <span className="stat-value">♠️</span>
              <span className="stat-label">Классический покер</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">⚡</span>
              <span className="stat-label">Быстрые раздачи</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">💎</span>
              <span className="stat-label">Разные лимиты</span>
            </div>
          </div>
        </div>

        <div className="tables-section">
          <h3 className="tables-section-title">Доступные столы</h3>
          
          {firstThreeTables.length === 0 ? (
            <div className="empty-tables">Нет доступных столов</div>
          ) : (
            <div className="tables-list">
              {firstThreeTables.map((table) => (
                <button
                  key={table.id}
                  className={`table-item ${table.status}`}
                  onClick={() => handleSelectTableClick(table.id)}
                  disabled={table.status === 'full'}
                >
                  <div className="table-item-header">
                    <span className="table-item-name">{table.name}</span>
                    <span className={`table-item-status ${table.status}`}>
                      {getStatusIcon(table.status)}
                    </span>
                  </div>
                  <div className="table-item-details">
                    <span className="table-item-blinds">
                      💰 {table.config.smallBlind}/{table.config.bigBlind}
                    </span>
                    <span className="table-item-players">
                      👥 {table.playerCount}/{table.maxPlayers}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <button className="view-all-button" onClick={handleShowAllTables}>
            <span>📋 Посмотреть все столы</span>
          </button>
        </div>
      </div>

      <style>{`
        .main-menu {
          min-height: 100vh;
          background: var(--tg-theme-bg-color, #f1f1f1);
          padding: 16px;
        }

        .menu-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .logo {
          font-size: 24px;
          font-weight: bold;
        }

        .user-greeting {
          display: flex;
          align-items: center;
          gap: 10px;
          background: var(--tg-theme-secondary-bg-color, #fff);
          padding: 5px 10px;
          border-radius: 20px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .user-avatar-small {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          object-fit: cover;
        }

        .settings-icon {
          font-size: 18px;
          opacity: 0.7;
        }

        .menu-content {
          max-width: 400px;
          margin: 0 auto;
        }

        .menu-card {
          background: var(--tg-theme-secondary-bg-color, #fff);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
          text-align: center;
        }

        .menu-card h2 {
          margin: 0 0 12px 0;
          color: var(--tg-theme-text-color, #000);
          font-size: 20px;
        }

        .menu-card p {
          margin: 0 0 20px 0;
          color: var(--tg-theme-hint-color, #999);
          font-size: 14px;
        }

        .stats-preview {
          display: flex;
          justify-content: space-around;
          padding-top: 16px;
          border-top: 1px solid rgba(0,0,0,0.1);
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .stat-value {
          font-size: 24px;
        }

        .stat-label {
          font-size: 12px;
          color: var(--tg-theme-hint-color, #999);
        }

        .tables-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }

        .tables-section-title {
          margin: 0;
          font-size: 16px;
          color: var(--tg-theme-text-color, #000);
          font-weight: 600;
        }

        .tables-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .table-item {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px 16px;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          text-align: left;
          background: var(--tg-theme-secondary-bg-color, #fff);
          border: 1px solid rgba(0,0,0,0.1);
        }

        .table-item:active {
          transform: scale(0.98);
        }

        .table-item:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .table-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .table-item-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--tg-theme-text-color, #000);
        }

        .table-item-status {
          font-size: 14px;
        }

        .table-item-details {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: var(--tg-theme-hint-color, #999);
        }

        .view-all-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 16px;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          background: var(--tg-theme-button-color, #2481cc);
          color: var(--tg-theme-button-text-color, #fff);
          font-size: 14px;
          font-weight: 600;
          margin-top: 8px;
        }

        .view-all-button:active {
          transform: scale(0.98);
        }

        .empty-tables {
          text-align: center;
          padding: 24px;
          color: var(--tg-theme-hint-color, #999);
          font-size: 14px;
          background: var(--tg-theme-secondary-bg-color, #fff);
          border-radius: 12px;
        }

        .balance-card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
          color: white;
        }

        .balance-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .balance-label {
          font-size: 14px;
          opacity: 0.9;
        }

        .balance-value {
          font-size: 18px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
};
