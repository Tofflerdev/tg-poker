import React from 'react';
import type { TableInfo } from '../../../types/index';
import { useTelegram } from '../hooks/useTelegram';

interface TableListProps {
  tables: TableInfo[];
  onSelectTable: (tableId: string) => void;
  onBack: () => void;
}

export const TableList: React.FC<TableListProps> = ({ tables, onSelectTable, onBack }) => {
  const { showBackButton, hideBackButton, hapticFeedback, setHeaderColor } = useTelegram();

  React.useEffect(() => {
    setHeaderColor('#2481cc');
    showBackButton(onBack);

    return () => {
      hideBackButton();
    };
  }, [showBackButton, hideBackButton, setHeaderColor, onBack]);

  const handleSelect = (tableId: string) => {
    hapticFeedback?.impactOccurred('light');
    onSelectTable(tableId);
  };

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

  const getStatusText = (status: TableInfo['status']) => {
    switch (status) {
      case 'waiting':
        return 'Ожидание';
      case 'playing':
        return 'Идёт игра';
      case 'full':
        return 'Полный';
      default:
        return 'Неизвестно';
    }
  };

  const getCategoryIcon = (category: TableInfo['config']['category']) => {
    switch (category) {
      case 'cash':
        return '💵';
      case 'tournament':
        return '🏆';
      case 'sitngo':
        return '⚡';
      default:
        return '🎲';
    }
  };

  return (
    <div className="table-list">
      <div className="list-header">
        <h1>Выбор стола</h1>
        <p className="subtitle">Доступно столов: {tables.length}</p>
      </div>

      <div className="tables-container">
        {tables.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🎲</span>
            <p>Нет доступных столов</p>
          </div>
        ) : (
          tables.map((table) => (
            <div
              key={table.id}
              className={`table-card ${table.status}`}
              onClick={() => handleSelect(table.id)}
            >
              <div className="table-card-header">
                <div className="table-name">
                  {getCategoryIcon(table.config.category)}
                  <span>{table.name}</span>
                </div>
                <div className={`table-status ${table.status}`}>
                  {getStatusIcon(table.status)}
                  <span>{getStatusText(table.status)}</span>
                </div>
              </div>

              <div className="table-card-body">
                <div className="info-row">
                  <span className="info-label">Блайнды:</span>
                  <span className="info-value">
                    {table.config.smallBlind}/{table.config.bigBlind}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Buy-in:</span>
                  <span className="info-value">
                    {table.config.buyIn.toLocaleString()}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Ход:</span>
                  <span className="info-value">
                    {table.config.turnTime} сек
                  </span>
                </div>
              </div>

              <div className="table-card-footer">
                <div className="players-count">
                  <span className="players-icon">👥</span>
                  <span>
                    {table.playerCount}/{table.maxPlayers} игроков
                  </span>
                </div>
                <button className="join-button">
                  {table.status === 'full' ? 'Наблюдать' : 'Присоединиться'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <style>{`
        .table-list {
          min-height: 100vh;
          background: var(--tg-theme-bg-color, #f1f1f1);
          padding: 16px;
        }

        .list-header {
          margin-bottom: 20px;
        }

        .list-header h1 {
          margin: 0;
          font-size: 24px;
          color: var(--tg-theme-text-color, #000);
        }

        .subtitle {
          margin: 4px 0 0 0;
          color: var(--tg-theme-hint-color, #999);
          font-size: 14px;
        }

        .tables-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: var(--tg-theme-hint-color, #999);
        }

        .empty-icon {
          font-size: 48px;
          display: block;
          margin-bottom: 16px;
        }

        .table-card {
          background: var(--tg-theme-secondary-bg-color, #fff);
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          border: 2px solid transparent;
        }

        .table-card:active {
          transform: scale(0.98);
        }

        .table-card.waiting {
          border-color: #4CAF50;
        }

        .table-card.playing {
          border-color: #2196F3;
        }

        .table-card.full {
          border-color: #f44336;
          opacity: 0.8;
        }

        .table-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(0,0,0,0.1);
        }

        .table-name {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 600;
          color: var(--tg-theme-text-color, #000);
        }

        .table-status {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 12px;
          background: rgba(0,0,0,0.05);
        }

        .table-status.waiting {
          background: rgba(76, 175, 80, 0.1);
          color: #4CAF50;
        }

        .table-status.playing {
          background: rgba(33, 150, 243, 0.1);
          color: #2196F3;
        }

        .table-status.full {
          background: rgba(244, 67, 54, 0.1);
          color: #f44336;
        }

        .table-card-body {
          margin-bottom: 12px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
          font-size: 14px;
        }

        .info-label {
          color: var(--tg-theme-hint-color, #999);
        }

        .info-value {
          color: var(--tg-theme-text-color, #000);
          font-weight: 500;
        }

        .table-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          border-top: 1px solid rgba(0,0,0,0.1);
        }

        .players-count {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 14px;
          color: var(--tg-theme-hint-color, #999);
        }

        .join-button {
          background: var(--tg-theme-button-color, #2481cc);
          color: var(--tg-theme-button-text-color, #fff);
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .table-card.full .join-button {
          background: var(--tg-theme-hint-color, #999);
        }
      `}</style>
    </div>
  );
};
