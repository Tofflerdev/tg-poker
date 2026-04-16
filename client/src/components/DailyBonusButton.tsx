import React, { useState, useEffect } from 'react';
import { Button } from './ui';

/**
 * DailyBonusButton — claim-state CTA rendered inside the MainMenu Daily Bonus block.
 *
 * Plan 02-04 refactor:
 * - Visual swap to `<Button variant="sit">` (Neon Strip green — affirmative tier
 *   per D-05). `emphasis` turns on when the bonus is claimable, giving the
 *   inner-glow + low-alpha gradient treatment from the Plan 01 primitive.
 * - Claim-state computation (balance <1000 AND last-claim >24h, or
 *   server-provided `canClaimDaily` flag) is unchanged.
 */

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
  onClaim,
}) => {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isEligible, setIsEligible] = useState<boolean>(false);

  useEffect(() => {
    const checkEligibility = () => {
      if (balance >= 1000) {
        setIsEligible(false);
        setTimeLeft('Balance ≥ 1000');
        return;
      }

      if (!lastDailyRefill) {
        setIsEligible(true);
        setTimeLeft('Ready');
        return;
      }

      const lastRefillDate = new Date(lastDailyRefill);
      const nextClaimDate = new Date(lastRefillDate.getTime() + 24 * 60 * 60 * 1000);
      const now = new Date();

      if (now >= nextClaimDate) {
        setIsEligible(true);
        setTimeLeft('Ready');
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
      if (canClaimDaily) setTimeLeft('Ready');
    }
  }, [canClaimDaily]);

  return (
    <Button
      variant="sit"
      emphasis={isEligible}
      fullWidth
      disabled={!isEligible}
      onClick={isEligible ? onClaim : undefined}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 16px',
        opacity: isEligible ? 1 : 0.55,
        cursor: isEligible ? 'pointer' : 'not-allowed',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden>🎁</span>
        <span>Daily Bonus</span>
      </span>
      <span style={{ fontSize: 11, opacity: 0.85, letterSpacing: '0.05em' }}>
        {timeLeft}
      </span>
    </Button>
  );
};
