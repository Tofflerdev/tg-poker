import React, { useState, useEffect, useRef } from 'react';
import { useTelegram } from '../hooks/useTelegram';
import type { UserProfile, TelegramUser } from '../../../types/index';
import { Socket } from 'socket.io-client';
import { Button, Card, TabBar } from '../components/ui';
import { AVATARS, avatarUrl, type AvatarId } from '../assets/avatars/manifest';
import { HandHistoryList } from '../components/HandHistoryList';

/**
 * Phase 2 / Plan 02-06: Redesigned Profile/Settings page.
 *
 * Three-tab layout per D-20: Profile / Avatar / History (fixed order).
 *
 * - Profile tab (D-21): current avatar (manifest-resolved; Telegram photo NOT
 *   rendered per D-15), inline-editable display name (tap to edit, Enter/blur
 *   commits via existing `updateProfile` socket event), stats grid from
 *   `UserProfile` (fetched via existing `getProfile` / `profileData` pattern),
 *   daily-bonus eligibility block driven by `currentUser.canClaimDaily`.
 * - Avatar tab (D-22): 4×5 grid picker with explicit Confirm (D-13 — no
 *   instant-save). Implemented in Task 2 of this plan.
 * - History tab (D-23): empty-state stub, no socket/data wiring. Layout is
 *   locked now so Phase 3 can drop hand-history content without reshaping.
 *
 * UI-05: consumes `ui/` primitives only — Button, Card, TabBar. No inline NEON
 * tokens. Zero reads of `currentUser.avatarUrl` (the DEPRECATED Telegram photo
 * URL).
 */

interface ProfileSettingsProps {
  socket: Socket;
  onBack: () => void;
  currentUser: TelegramUser | null;
}

type TabId = 'profile' | 'avatar' | 'history';

const TABS: { id: TabId; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'history', label: 'History' },
];

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({ socket, onBack, currentUser }) => {
  const { showBackButton, hideBackButton, showAlert, hapticFeedback } = useTelegram();

  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Inline display-name editor state
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // Avatar picker state — D-13 / D-22 / Pitfall 5: explicit Confirm, no instant-save.
  // pendingAvatar tracks the user's tapped selection before they Confirm. It
  // syncs to the live currentUser.avatarId whenever the server acks a change
  // (via App.tsx's avatarUpdated listener → currentUser.avatarId changes →
  // this effect realigns pending, which makes `dirty` false and disables
  // the Confirm button).
  const [pendingAvatar, setPendingAvatar] = useState<AvatarId | undefined>(
    currentUser?.avatarId as AvatarId | undefined
  );
  useEffect(() => {
    setPendingAvatar(currentUser?.avatarId as AvatarId | undefined);
  }, [currentUser?.avatarId]);
  const dirty = pendingAvatar !== undefined && pendingAvatar !== currentUser?.avatarId;

  // Telegram hardware back-button → onBack
  useEffect(() => {
    showBackButton(onBack);
    return () => hideBackButton();
  }, [onBack, showBackButton, hideBackButton]);

  // Fetch profile stats via existing socket pattern
  useEffect(() => {
    socket.emit('getProfile');

    const onProfileData = (data: UserProfile) => {
      setProfile(data);
      setIsLoading(false);
    };

    const onProfileUpdated = (data: UserProfile) => {
      setProfile(data);
      setNameSaving(false);
      setEditingName(false);
    };

    const onProfileError = (msg: string) => {
      setNameSaving(false);
      showAlert(msg);
    };

    socket.on('profileData', onProfileData);
    socket.on('profileUpdated', onProfileUpdated);
    socket.on('profileError', onProfileError);

    return () => {
      socket.off('profileData', onProfileData);
      socket.off('profileUpdated', onProfileUpdated);
      socket.off('profileError', onProfileError);
    };
  }, [socket, showAlert]);

  // Focus the input when the user taps to edit the display name
  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  const handleStartEditName = () => {
    if (!currentUser) return;
    setNameDraft(currentUser.displayName || '');
    setEditingName(true);
  };

  const handleCommitName = () => {
    const trimmed = nameDraft.trim();
    if (!currentUser) return;
    // No-op if unchanged
    if (trimmed === (currentUser.displayName || '')) {
      setEditingName(false);
      return;
    }
    if (trimmed.length < 2 || trimmed.length > 20) {
      showAlert('Name must be between 2 and 20 characters');
      return;
    }
    setNameSaving(true);
    socket.emit('updateProfile', { displayName: trimmed });
  };

  const handleCancelEditName = () => {
    setEditingName(false);
    setNameDraft('');
  };

  const handleClaimBonus = () => {
    hapticFeedback?.impactOccurred('medium');
    socket.emit('claimDailyBonus');
  };

  const handleSelectAvatar = (id: AvatarId) => {
    hapticFeedback?.selectionChanged?.();
    setPendingAvatar(id);
  };

  const handleConfirmAvatar = () => {
    if (!dirty || !pendingAvatar) return;
    hapticFeedback?.impactOccurred('medium');
    // Pitfall 5 / D-13: only Confirm emits — tile taps alone never persist.
    // Server validates the slug against the AVATARS allowlist (Plan 02-02
    // T-02-02-02) and broadcasts avatarUpdated; App.tsx listener updates
    // currentUser.avatarId, which causes `dirty` to become false.
    socket.emit('updateAvatar', { avatarId: pendingAvatar });
  };

  const renderProfileTab = () => {
    if (!currentUser) {
      return (
        <div style={{ color: 'var(--color-neutral)', textAlign: 'center', padding: 24 }}>
          Loading profile...
        </div>
      );
    }

    const currentAvatarSrc = avatarUrl(currentUser.avatarId as AvatarId | undefined);
    const fallbackInitial = (currentUser.displayName || '?').charAt(0).toUpperCase();

    // Daily bonus block copy
    let bonusLine: React.ReactNode;
    if (currentUser.canClaimDaily) {
      bonusLine = (
        <>
          <div style={{ color: 'var(--color-action-sit)', fontWeight: 700, marginBottom: 10 }}>
            Claimable now
          </div>
          <Button variant="sit" emphasis fullWidth onClick={handleClaimBonus}>
            Claim 1000
          </Button>
        </>
      );
    } else if (currentUser.lastDailyRefill) {
      const next = new Date(new Date(currentUser.lastDailyRefill).getTime() + 24 * 60 * 60 * 1000);
      bonusLine = (
        <div style={{ color: 'var(--color-neutral)', fontSize: 13 }}>
          Next claim available at:{' '}
          <span style={{ color: 'var(--color-active)' }}>{next.toLocaleString()}</span>
        </div>
      );
    } else {
      bonusLine = (
        <div style={{ color: 'var(--color-neutral)', fontSize: 13 }}>
          Daily bonus unlocks when your balance drops below 1000.
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Identity card — avatar + display name */}
        <Card variant="active" glow padding={20}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
            }}
          >
            {/* Avatar — 96×96 circular, manifest-resolved, initial-letter fallback */}
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                overflow: 'hidden',
                background: 'rgba(10,10,14,0.6)',
                border: '2px solid color-mix(in srgb, var(--color-active) 56%, transparent)',
                boxShadow: '0 0 18px var(--glow-call)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {currentAvatarSrc ? (
                <img
                  src={currentAvatarSrc}
                  alt={currentUser.avatarId || 'avatar'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span
                  style={{
                    color: 'var(--color-active)',
                    fontSize: 40,
                    fontWeight: 700,
                    textShadow: '0 0 8px var(--glow-call)',
                  }}
                >
                  {fallbackInitial}
                </span>
              )}
            </div>

            {/* Display name — inline edit */}
            {editingName ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameDraft}
                  maxLength={20}
                  disabled={nameSaving}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCommitName();
                    if (e.key === 'Escape') handleCancelEditName();
                  }}
                  onBlur={handleCommitName}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(10,10,14,0.6)',
                    border: '1.5px solid color-mix(in srgb, var(--color-active) 56%, transparent)',
                    color: '#fff',
                    fontSize: 16,
                    fontWeight: 600,
                    textAlign: 'center',
                    outline: 'none',
                    boxShadow: 'inset 0 0 8px var(--glow-call)',
                  }}
                />
                <div style={{ color: 'var(--color-neutral)', fontSize: 11, textAlign: 'center' }}>
                  Enter to save, Esc to cancel
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStartEditName}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#fff',
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 8px',
                  WebkitTapHighlightColor: 'transparent',
                }}
                aria-label="Edit display name"
              >
                <span>{currentUser.displayName}</span>
                <span
                  aria-hidden
                  style={{
                    fontSize: 13,
                    color: 'var(--color-neutral)',
                    opacity: 0.7,
                  }}
                >
                  ✎
                </span>
              </button>
            )}
          </div>
        </Card>

        {/* Stats card */}
        <Card variant="raise" padding={16}>
          <div
            style={{
              color: 'var(--color-action-raise)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 12,
              textShadow: '0 0 6px var(--glow-raise)',
            }}
          >
            Statistics
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 10,
            }}
          >
            <StatCell
              label="Balance"
              value={currentUser.balance.toLocaleString()}
              valueColor="var(--color-chip)"
              glow="var(--glow-raise)"
              monospace
            />
            <StatCell
              label="Hands Played"
              value={isLoading ? '—' : (profile?.handsPlayed ?? 0).toLocaleString()}
              valueColor="#fff"
            />
            <StatCell
              label="Hands Won"
              value={isLoading ? '—' : (profile?.handsWon ?? 0).toLocaleString()}
              valueColor="var(--color-active)"
              glow="var(--glow-call)"
            />
            <StatCell
              label="Total Winnings"
              value={isLoading ? '—' : (profile?.totalWinnings ?? 0).toLocaleString()}
              valueColor="var(--color-chip)"
              glow="var(--glow-raise)"
              monospace
            />
            <StatCell
              label="Biggest Pot"
              value={isLoading ? '—' : (profile?.biggestPot ?? 0).toLocaleString()}
              valueColor="var(--color-chip)"
              glow="var(--glow-raise)"
              monospace
              span={2}
            />
          </div>
        </Card>

        {/* Daily bonus card */}
        <Card variant="sit" padding={16}>
          <div
            style={{
              color: 'var(--color-action-sit)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 10,
              textShadow: '0 0 6px var(--glow-sit)',
            }}
          >
            Daily Bonus
          </div>
          {bonusLine}
        </Card>
      </div>
    );
  };

  const renderAvatarTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card variant="neutral" padding={16}>
        <div
          style={{
            color: 'var(--color-neutral)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Pick an Avatar
        </div>
        {/* 4×5 grid of 20 avatars (D-22) — tap to select, Confirm to commit */}
        <div
          role="radiogroup"
          aria-label="Choose an avatar"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
          }}
        >
          {AVATARS.map((id) => {
            const selected = pendingAvatar === id;
            const src = avatarUrl(id);
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={id}
                onClick={() => handleSelectAvatar(id)}
                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  minWidth: 60,
                  minHeight: 60,
                  padding: 0,
                  background: 'rgba(10,10,14,0.6)',
                  border: selected
                    ? '1.5px solid color-mix(in srgb, var(--color-active) 56%, transparent)'
                    : '1px solid color-mix(in srgb, var(--color-neutral) 18%, transparent)',
                  borderRadius: 14,
                  boxShadow: selected
                    ? '0 0 16px var(--glow-call), inset 0 0 8px var(--glow-call)'
                    : 'none',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'box-shadow .15s, border-color .15s, transform .1s',
                  WebkitTapHighlightColor: 'transparent',
                }}
                className="active:scale-95"
              >
                {src ? (
                  <img
                    src={src}
                    alt={id}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                      height: '100%',
                      color: selected ? 'var(--color-active)' : 'var(--color-neutral)',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      textShadow: selected ? '0 0 6px var(--glow-call)' : undefined,
                    }}
                  >
                    {id}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Explicit Confirm (D-13 / Pitfall 5) — disabled when pending == current */}
      <div style={{ padding: '0 2px' }}>
        <Button
          variant="active"
          emphasis
          fullWidth
          disabled={!dirty}
          onClick={handleConfirmAvatar}
          style={{ opacity: dirty ? 1 : 0.45, cursor: dirty ? 'pointer' : 'not-allowed' }}
        >
          {dirty ? 'Confirm' : 'No changes'}
        </Button>
      </div>
    </div>
  );

  const renderHistoryTab = () => (
    <HandHistoryList socket={socket} active={activeTab === 'history'} />
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-base)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top bar: Back + title */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px 10px',
          paddingTop: 'max(env(safe-area-inset-top), 14px)',
        }}
      >
        <div style={{ flex: '0 0 auto' }}>
          <Button
            variant="neutral"
            onClick={onBack}
            aria-label="Back"
            style={{ minHeight: 40, padding: '0 14px', fontSize: 12 }}
          >
            ← Back
          </Button>
        </div>
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#fff',
          }}
        >
          Profile
        </div>
        {/* Symmetric spacer so title stays visually centered */}
        <div style={{ flex: '0 0 auto', width: 72 }} aria-hidden />
      </div>

      {/* Tab bar — fixed order Profile / Avatar / History (D-20) */}
      <div style={{ padding: '0 12px' }}>
        <TabBar tabs={TABS} activeId={activeTab} onChange={(id) => setActiveTab(id as TabId)} />
      </div>

      {/* Tab content */}
      <div
        style={{
          flex: 1,
          padding: '16px 12px',
          paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
          overflowY: 'auto',
        }}
      >
        {activeTab === 'profile' && renderProfileTab()}
        {activeTab === 'avatar' && renderAvatarTab()}
        {activeTab === 'history' && renderHistoryTab()}
      </div>
    </div>
  );
};

// ---------- StatCell ----------

interface StatCellProps {
  label: string;
  value: string;
  valueColor?: string;
  glow?: string;
  monospace?: boolean;
  span?: 1 | 2;
}

const StatCell: React.FC<StatCellProps> = ({
  label,
  value,
  valueColor = '#fff',
  glow,
  monospace,
  span = 1,
}) => (
  <div
    style={{
      gridColumn: span === 2 ? 'span 2' : undefined,
      background: 'rgba(10,10,14,0.6)',
      border: '1px solid color-mix(in srgb, var(--color-neutral) 18%, transparent)',
      borderRadius: 10,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}
  >
    <div
      style={{
        color: 'var(--color-neutral)',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </div>
    <div
      style={{
        color: valueColor,
        fontSize: 18,
        fontWeight: 700,
        fontFamily: monospace ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
        textShadow: glow ? `0 0 6px ${glow}` : undefined,
      }}
    >
      {value}
    </div>
  </div>
);
