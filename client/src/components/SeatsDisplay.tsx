import React, { useState, useEffect, useMemo } from "react";
import HandDisplay from "./HandDisplay";
import { Player } from "../../../types/index";

interface SeatsDisplayProps {
  seats: (Player | null)[];
  mySeat: number | null;
  tableWidth: number;
  tableHeight: number;
  seatSize?: number;
  currentPlayer?: number | null;
  turnExpiresAt?: number | null;
  onSit: (seat: number) => void;
  isMobile?: boolean;
}

/* ── Neon color tokens (matching GameControls) ── */
const NEON = {
  active:  { color: '#00e5ff', glow: 'rgba(0,229,255,0.40)' },
  fold:    { color: '#ff4757', glow: 'rgba(255,71,87,0.35)' },
  allin:   { color: '#ff6d00', glow: 'rgba(255,109,0,0.40)' },
  chips:   { color: '#ffab00', glow: 'rgba(255,171,0,0.25)' },
  neutral: { color: '#b0bec5', glow: 'rgba(176,190,197,0.15)' },
  sit:     { color: '#4caf50', glow: 'rgba(76,175,80,0.30)' },
  warn:    { color: '#ff9800', glow: 'rgba(255,152,0,0.30)' },
  danger:  { color: '#ff1744', glow: 'rgba(255,23,68,0.50)' },
} as const;

/* ── Seat position presets ── */
const SEAT_POSITIONS_DESKTOP = [
  { left: '50%', top: '96%',  align: 'translate(-50%, -100%)' },
  { left: '4%',  top: '72%',  align: 'translate(-20%, -50%)' },
  { left: '4%',  top: '28%',  align: 'translate(-20%, -50%)' },
  { left: '50%', top: '4%',   align: 'translate(-50%, 0%)' },
  { left: '96%', top: '28%',  align: 'translate(-80%, -50%)' },
  { left: '96%', top: '72%',  align: 'translate(-80%, -50%)' },
];

const SEAT_POSITIONS_MOBILE = [
  { left: '50%', top: '97%',  align: 'translate(-50%, -100%)' },
  { left: '3%',  top: '75%',  align: 'translate(-10%, -50%)' },
  { left: '3%',  top: '38%',  align: 'translate(-10%, -50%)' },
  { left: '50%', top: '3%',   align: 'translate(-50%, 0%)' },
  { left: '97%', top: '38%',  align: 'translate(-90%, -50%)' },
  { left: '97%', top: '75%',  align: 'translate(-90%, -50%)' },
];

/* ── Timer duration for progress ring (matches server turn timer) ── */
const DEFAULT_TURN_DURATION = 20;

/* ── Inject keyframes once ── */
const STYLE_ID = 'neon-seats-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes neon-pulse {
      0%, 100% { opacity: 0.7; }
      50% { opacity: 1; }
    }
    @keyframes seat-glow-pulse {
      0%, 100% { box-shadow: 0 0 8px var(--glow-color), inset 0 0 6px var(--glow-color); }
      50% { box-shadow: 0 0 18px var(--glow-color), inset 0 0 10px var(--glow-color); }
    }
    @keyframes timer-urgency {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);
}

/* ── SVG circular timer ring ── */
const TimerRing: React.FC<{
  size: number;
  timeLeft: number;
  totalTime: number;
  strokeWidth?: number;
}> = ({ size, timeLeft, totalTime, strokeWidth = 2.5 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, timeLeft / totalTime));
  const dashOffset = circumference * (1 - progress);
  const isUrgent = timeLeft <= 5;
  const strokeColor = isUrgent ? NEON.danger.color : NEON.active.color;

  return (
    <svg
      width={size}
      height={size}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        transform: 'rotate(-90deg)',
        filter: isUrgent
          ? `drop-shadow(0 0 4px ${NEON.danger.glow})`
          : `drop-shadow(0 0 3px ${NEON.active.glow})`,
      }}
    >
      {/* Background track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        style={{
          transition: 'stroke-dashoffset 0.3s linear, stroke 0.3s',
          animation: isUrgent ? 'timer-urgency 0.6s ease-in-out infinite' : undefined,
        }}
      />
    </svg>
  );
};

/* ── Avatar with optional timer ring ── */
const PlayerAvatar: React.FC<{
  player: Player;
  size: number;
  isActive: boolean;
  timeLeft: number;
  totalTime: number;
}> = ({ player, size, isActive, timeLeft, totalTime }) => {
  const initial = (player.displayName || player.id)?.[0]?.toUpperCase() || '?';
  const ringPad = 4;
  const outerSize = size + ringPad * 2;

  return (
    <div
      style={{
        position: 'relative',
        width: outerSize,
        height: outerSize,
        flexShrink: 0,
      }}
    >
      {/* Timer ring (only when active) */}
      {isActive && timeLeft > 0 && (
        <TimerRing
          size={outerSize}
          timeLeft={timeLeft}
          totalTime={totalTime}
          strokeWidth={2.5}
        />
      )}

      {/* Avatar circle */}
      <div
        style={{
          position: 'absolute',
          top: ringPad,
          left: ringPad,
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          border: isActive
            ? `1.5px solid ${NEON.active.color}`
            : '1.5px solid rgba(255,255,255,0.15)',
          boxShadow: isActive
            ? `0 0 10px ${NEON.active.glow}`
            : 'none',
          background: 'rgba(30,30,40,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.3s, box-shadow 0.3s',
        }}
      >
        {player.avatarUrl ? (
          <img
            src={player.avatarUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('style');
            }}
          />
        ) : null}
        <span
          style={{
            display: player.avatarUrl ? 'none' : 'block',
            color: isActive ? NEON.active.color : 'rgba(255,255,255,0.6)',
            fontSize: size * 0.42,
            fontWeight: 700,
            letterSpacing: '0.02em',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {initial}
        </span>
      </div>
    </div>
  );
};

/* ── Status badge pill ── */
const StatusBadge: React.FC<{ label: string; neon: typeof NEON[keyof typeof NEON] }> = ({ label, neon }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '1px 6px',
      fontSize: 8,
      fontWeight: 700,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      color: neon.color,
      border: `1px solid ${neon.color}50`,
      borderRadius: 6,
      background: `${neon.color}12`,
      lineHeight: '14px',
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </span>
);

/* ── Main component ── */
const SeatsDisplay: React.FC<SeatsDisplayProps> = ({
  seats,
  mySeat,
  tableWidth,
  tableHeight,
  currentPlayer,
  turnExpiresAt,
  onSit,
  isMobile = false,
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(interval);
  }, []);

  const totalSeats = 6;
  const rotationOffset = mySeat !== null ? mySeat : 0;
  const positions = isMobile ? SEAT_POSITIONS_MOBILE : SEAT_POSITIONS_DESKTOP;

  const seatWidth = isMobile
    ? Math.max(56, Math.min(84, tableWidth * 0.18))
    : Math.max(64, Math.min(110, tableWidth * 0.19));

  const avatarSize = isMobile ? 22 : 26;

  return (
    <>
      {seats.map((player, i) => {
        const visualIndex = (i - rotationOffset + totalSeats) % totalSeats;
        const pos = positions[visualIndex];
        const isMe = i === mySeat;
        const isFree = !player;
        const canSit = isFree && mySeat === null;
        const isActive = currentPlayer === i;

        let timeLeft = 0;
        if (isActive && turnExpiresAt) {
          timeLeft = Math.max(0, Math.ceil((turnExpiresAt - now) / 1000));
        }

        /* ── Seat border color ── */
        const borderColor = isActive
          ? NEON.active.color
          : player?.waitingForBB
            ? `${NEON.warn.color}60`
            : canSit
              ? `${NEON.sit.color}50`
              : isFree
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(255,255,255,0.10)';

        /* ── Container styles ── */
        const containerStyle: React.CSSProperties = {
          '--glow-color': NEON.active.glow,
          position: 'absolute',
          left: pos.left,
          top: pos.top,
          transform: pos.align,
          width: isMobile && isMe && player ? seatWidth * 1.15 : seatWidth,
          zIndex: isActive ? 20 : 10,
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        } as React.CSSProperties;

        /* ── Mobile "my seat" — special expanded layout ── */
        if (isMobile && isMe && player) {
          return (
            <div key={i} style={containerStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* My cards — larger */}
                <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'center' }}>
                  <HandDisplay cards={player.hand} size={seatWidth * 0.7} overlap={seatWidth * 0.18} />
                </div>

                {/* Info strip */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(10,10,14,0.88)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1.5px solid ${borderColor}`,
                    borderRadius: 12,
                    padding: '4px 8px',
                    animation: isActive ? 'seat-glow-pulse 2s ease-in-out infinite' : undefined,
                    boxShadow: isActive
                      ? `0 0 12px ${NEON.active.glow}`
                      : '0 2px 8px rgba(0,0,0,0.4)',
                    transition: 'border-color 0.3s, box-shadow 0.3s',
                  }}
                >
                  <PlayerAvatar
                    player={player}
                    size={avatarSize}
                    isActive={isActive}
                    timeLeft={timeLeft}
                    totalTime={DEFAULT_TURN_DURATION}
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.85)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 70,
                        lineHeight: '14px',
                      }}
                    >
                      {player.displayName || `Player ${player.id.slice(0, 4)}`}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
                        fontWeight: 700,
                        color: NEON.chips.color,
                        textShadow: `0 0 8px ${NEON.chips.glow}`,
                        lineHeight: '14px',
                      }}
                    >
                      {player.chips.toLocaleString()}
                    </span>
                  </div>

                  {/* Status badges */}
                  {player.folded && <StatusBadge label="Fold" neon={NEON.fold} />}
                  {player.allIn && <StatusBadge label="All-in" neon={NEON.allin} />}
                  {player.sittingOut && <StatusBadge label="Sit out" neon={NEON.neutral} />}
                  {player.waitingForBB && <StatusBadge label="Wait BB" neon={NEON.warn} />}
                </div>
              </div>
            </div>
          );
        }

        /* ── Standard seat (desktop + other mobile seats) ── */
        return (
          <div
            key={i}
            style={containerStyle}
            onClick={() => canSit && onSit(i)}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                background: canSit
                  ? 'rgba(76,175,80,0.06)'
                  : 'rgba(10,10,14,0.85)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: canSit
                  ? `1.5px dashed ${NEON.sit.color}50`
                  : `1.5px solid ${borderColor}`,
                borderRadius: 14,
                padding: isMobile ? '5px 4px 4px' : '6px 6px 5px',
                cursor: canSit ? 'pointer' : 'default',
                animation: isActive ? 'seat-glow-pulse 2s ease-in-out infinite' : undefined,
                boxShadow: isActive
                  ? `0 0 14px ${NEON.active.glow}`
                  : canSit
                    ? 'none'
                    : '0 2px 10px rgba(0,0,0,0.4)',
                transition: 'border-color 0.3s, box-shadow 0.3s, background 0.3s',
                minHeight: isMobile ? 52 : 60,
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (canSit) {
                  e.currentTarget.style.borderColor = NEON.sit.color;
                  e.currentTarget.style.boxShadow = `0 0 12px ${NEON.sit.glow}`;
                }
              }}
              onMouseLeave={(e) => {
                if (canSit) {
                  e.currentTarget.style.borderColor = `${NEON.sit.color}50`;
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              {player ? (
                <>
                  {/* Top row: avatar + info */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: isMobile ? 4 : 5,
                      width: '100%',
                      paddingLeft: 2,
                      paddingRight: 2,
                    }}
                  >
                    <PlayerAvatar
                      player={player}
                      size={avatarSize}
                      isActive={isActive}
                      timeLeft={timeLeft}
                      totalTime={DEFAULT_TURN_DURATION}
                    />

                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          fontSize: isMobile ? 9 : 10,
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.8)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: seatWidth - avatarSize - 24,
                          lineHeight: '13px',
                        }}
                      >
                        {player.displayName || `Player ${player.id.slice(0, 4)}`}
                      </span>
                      <span
                        style={{
                          fontSize: isMobile ? 10 : 11,
                          fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
                          fontWeight: 700,
                          color: NEON.chips.color,
                          textShadow: `0 0 8px ${NEON.chips.glow}`,
                          lineHeight: '14px',
                        }}
                      >
                        {player.chips.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Cards */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      marginTop: 2,
                      transform: isMobile ? 'scale(0.65)' : 'scale(0.72)',
                      transformOrigin: 'top center',
                      marginBottom: isMobile ? -12 : -10,
                    }}
                  >
                    <HandDisplay cards={player.hand} size={seatWidth * 0.52} overlap={seatWidth * 0.12} />
                  </div>

                  {/* Status badges row */}
                  {(player.folded || player.allIn || player.sittingOut || player.waitingForBB) && (
                    <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                      {player.folded && <StatusBadge label="Fold" neon={NEON.fold} />}
                      {player.allIn && <StatusBadge label="All-in" neon={NEON.allin} />}
                      {player.sittingOut && <StatusBadge label="Sit out" neon={NEON.neutral} />}
                      {player.waitingForBB && <StatusBadge label="Wait" neon={NEON.warn} />}
                    </div>
                  )}

                  {/* Neon accent bar at bottom (active player only) */}
                  {isActive && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: '20%',
                        right: '20%',
                        height: 2,
                        borderRadius: 2,
                        background: NEON.active.color,
                        boxShadow: `0 0 6px ${NEON.active.color}, 0 0 16px ${NEON.active.glow}`,
                        animation: 'neon-pulse 2s ease-in-out infinite',
                      }}
                    />
                  )}
                </>
              ) : (
                /* ── Empty seat ── */
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: isMobile ? 44 : 52,
                    gap: 2,
                  }}
                >
                  {canSit ? (
                    <>
                      {/* Plus icon */}
                      <svg
                        width={isMobile ? 16 : 18}
                        height={isMobile ? 16 : 18}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={NEON.sit.color}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        style={{ opacity: 0.7 }}
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: NEON.sit.color,
                          opacity: 0.8,
                        }}
                      >
                        Sit
                      </span>
                    </>
                  ) : (
                    <span
                      style={{
                        fontSize: 9,
                        color: 'rgba(255,255,255,0.2)',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Empty
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};

export default SeatsDisplay;
