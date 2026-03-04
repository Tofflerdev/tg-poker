import React, { useState, useEffect } from 'react';
import { useTelegram } from '../hooks/useTelegram';

interface DailyBonusButtonProps {
  balance: number;
  lastDailyRefill?: string;
  canClaimDaily?: boolean;
  onClaim: () => void;
}

export const DailyBonusButton: React.FC<DailyBonusButtonProps> = ({ 
  balance, 
  lastDailyRefill, 
  canClaimDaily,
  onClaim 
}) => {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isEligible, setIsEligible] = useState<boolean>(false);

  useEffect(() => {
    const checkEligibility = () => {
      if (balance >= 1000) {
        setIsEligible(false);
        setTimeLeft('Balance >= 1000');
        return;
      }

      if (!lastDailyRefill) {
        setIsEligible(true);
        setTimeLeft('Ready!');
        return;
      }

      const lastRefillDate = new Date(lastDailyRefill);
      const nextClaimDate = new Date(lastRefillDate.getTime() + 24 * 60 * 60 * 1000);
      const now = new Date();

      if (now >= nextClaimDate) {
        setIsEligible(true);
        setTimeLeft('Ready!');
      } else {
        setIsEligible(false);
        const diff = nextClaimDate.getTime() - now.getTime();
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${hours}h ${minutes}m`);
      }
    };

    checkEligibility();
    const interval = setInterval(checkEligibility, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [balance, lastDailyRefill]);

  // Override with server provided flag if available
  useEffect(() => {
    if (canClaimDaily !== undefined) {
      setIsEligible(canClaimDaily);
      if (canClaimDaily) setTimeLeft('Ready!');
    }
  }, [canClaimDaily]);

  return (
    <button 
      className={`daily-bonus-btn ${isEligible ? 'active' : 'disabled'}`}
      onClick={isEligible ? onClaim : undefined}
      disabled={!isEligible}
      style={{
        padding: '10px 20px',
        borderRadius: '12px',
        border: 'none',
        background: isEligible ? 'linear-gradient(45deg, #FFD700, #FFA500)' : '#333',
        color: isEligible ? '#000' : '#888',
        fontWeight: 'bold',
        cursor: isEligible ? 'pointer' : 'not-allowed',
        marginTop: '10px',
        width: '100%',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      <span>🎁 Daily Bonus</span>
      <span>{timeLeft}</span>
    </button>
  );
};
