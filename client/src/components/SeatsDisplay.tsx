import React, { useState, useEffect } from "react";
import HandDisplay from "./HandDisplay";
import { Player } from "../../../types/index";
import { avatarUrl as resolveAvatar, type AvatarId } from "../assets/avatars/manifest";

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

/* ── Neon tokens — consumed from client/src/styles/neon.css via CSS custom properties.
   Do not introduce hex literals here. See .planning/phases/01-foundations-design-system/01-CONTEXT.md D-01/D-02. ── */
type NeonTier = {
  color: string;       // var(--color-*)
  glow: string;        // var(--glow-*) — rgba at ~0.30-0.40 alpha
  glowStrong: string;  // stronger glow for active states (color-mix ~60% alpha)
};

const tier = (color: string, glow: string): NeonTier => ({
  color,
  glow,
  glowStrong: `color-mix(in srgb, ${color} 60%, transparent)`,
});

const N = {
  active:  tier('var(--color-active)',        'var(--glow-call)'),
  fold:    tier('var(--color-action-fold)',   'var(--glow-fold)'),
  allin:   tier('var(--color-action-allin)',  'var(--glow-allin)'),
  chips:   tier('var(--color-chip)',          'var(--glow-raise)'),
  sit:     tier('var(--color-action-sit)',    'var(--glow-sit)'),
  neutral: tier('var(--color-neutral)',       'var(--glow-neutral)'),
  waitbb:  tier('var(--color-action-raise)',  'var(--glow-raise)'),
  sitout:  tier('var(--color-neutral)',       'var(--glow-neutral)'),
} as const;

/* Helper: compose a partially-transparent variant of a token color without hex literals. */
const alpha = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/* ── TimerRing — SVG circular progress around avatar ── */
const TimerRing: React.FC<{ size: number; timeLeft: number; totalTime: number }> = ({
  size, timeLeft, totalTime,
}) => {
  const stroke = 2.5;
  const r = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = totalTime > 0 ? Math.max(0, timeLeft / totalTime) : 0;
  const offset = circumference * (1 - progress);
  const urgent = timeLeft <= 5;
  const color = urgent ? N.fold.color : N.active.color;
  const glowColor = urgent ? N.fold.glowStrong : N.active.glowStrong;

  return (
    <svg
      width={size}
      height={size}
      style={{
        position: 'absolute',
        top: 0, left: 0,
        transform: 'rotate(-90deg)',
        pointerEvents: 'none',
      }}
    >
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{
          transition: 'stroke-dashoffset 0.25s linear, stroke 0.3s ease',
          filter: `drop-shadow(0 0 3px ${glowColor})`,
          ...(urgent ? { animation: 'timer-urgency 0.5s ease-in-out infinite' } : {}),
        }}
      />
    </svg>
  );
};

/* ── StatusBadge — pill-shaped status indicator ── */
const StatusBadge: React.FC<{ label: string; color: string; glow?: string }> = ({
  label, color, glow,
}) => (
  <span
    style={{
      display: 'inline-block',
      padding: '1px 5px',
      borderRadius: 6,
      fontSize: 7,
      fontWeight: 800,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      color,
      border: `1px solid ${alpha(color, 25)}`,
      background: alpha(color, 3),
      textShadow: glow ? `0 0 6px ${glow}` : 'none',
      lineHeight: '14px',
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </span>
);

/* ── GlowBar — accent bar at bottom edge ── */
const GlowBar: React.FC<{ color: string; glow?: string }> = ({ color, glow }) => (
  <span
    style={{
      position: 'absolute',
      bottom: 0,
      left: '12%',
      right: '12%',
      height: 2,
      borderRadius: 2,
      background: color,
      boxShadow: `0 0 6px ${color}, 0 0 16px ${glow ?? alpha(color, 25)}`,
      pointerEvents: 'none',
    }}
  />
);

/* ── Avatar — circular initial-letter with optional glow ── */
const Avatar: React.FC<{
  initial: string;
  size: number;
  isActive: boolean;
  avatarUrl?: string;
}> = ({ initial, size, isActive, avatarUrl }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'rgba(14,14,20,0.95)',
      border: `1.5px solid ${isActive ? alpha(N.active.color, 56) : 'rgba(176,190,197,0.25)'}`,
      boxShadow: isActive
        ? `0 0 10px ${N.active.glow}, 0 0 3px ${N.active.glowStrong}`
        : 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: Math.round(size * 0.45),
      fontWeight: 800,
      color: isActive ? N.active.color : '#e0e0e0',
      overflow: 'hidden',
      transition: 'border-color 0.3s, box-shadow 0.3s',
      flexShrink: 0,
    }}
  >
    {avatarUrl ? (
      <img
        src={avatarUrl}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    ) : (
      initial
    )}
  </div>
);

// Desktop: horizontal table positions
const SEAT_POSITIONS_DESKTOP = [
  { left: '50%', top: '94%',  align: 'translate(-50%, -100%)' },
  { left: '4%',  top: '70%',  align: 'translate(-15%, -50%)' },
  { left: '4%',  top: '30%',  align: 'translate(-15%, -50%)' },
  { left: '50%', top: '6%',   align: 'translate(-50%, 0%)' },
  { left: '96%', top: '30%',  align: 'translate(-85%, -50%)' },
  { left: '96%', top: '70%',  align: 'translate(-85%, -50%)' },
];

// Mobile: vertical table positions
const SEAT_POSITIONS_MOBILE = [
  { left: '50%', top: '95%',  align: 'translate(-50%, -100%)' },
  { left: '4%',  top: '73%',  align: 'translate(-5%, -50%)' },
  { left: '4%',  top: '37%',  align: 'translate(-5%, -50%)' },
  { left: '50%', top: '5%',   align: 'translate(-50%, 0%)' },
  { left: '96%', top: '37%',  align: 'translate(-95%, -50%)' },
  { left: '96%', top: '73%',  align: 'translate(-95%, -50%)' },
];

const TURN_DURATION = 30;

/* ── Resolve which status to display ── */
const getStatus = (p: Player): { label: string; color: string; glow: string } | null => {
  if (p.folded)       return { label: 'Fold',    color: N.fold.color,   glow: N.fold.glow };
  if (p.allIn)        return { label: 'All-in',  color: N.allin.color,  glow: N.allin.glow };
  if (p.sittingOut)   return { label: 'Sit out', color: N.sitout.color, glow: N.sitout.glow };
  if (p.waitingForBB) return { label: 'Wait BB', color: N.waitbb.color, glow: N.waitbb.glow };
  return null;
};

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

  const seatWidth = isMobile ? 64 : 80;
  const seatHeight = Math.round(seatWidth * 1.35);
  const avatarSize = isMobile ? 22 : 28;

  return (
    <>
      {/* ── Inject keyframe animations. Keyframes reference CSS vars directly via var(--...). ── */}
      <style>{`
        @keyframes neon-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        @keyframes seat-glow-pulse {
          0%, 100% {
            box-shadow:
              0 0 8px var(--glow-call),
              inset 0 0 6px var(--glow-call);
            border-color: color-mix(in srgb, var(--color-active) 27%, transparent);
          }
          50% {
            box-shadow:
              0 0 20px var(--glow-call),
              0 0 40px var(--glow-call),
              inset 0 0 14px var(--glow-call);
            border-color: color-mix(in srgb, var(--color-active) 44%, transparent);
          }
        }
        @keyframes timer-urgency {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes empty-seat-breathe {
          0%, 100% { border-color: color-mix(in srgb, var(--color-action-sit) 19%, transparent); }
          50% { border-color: color-mix(in srgb, var(--color-action-sit) 38%, transparent); }
        }
      `}</style>

      {seats.map((player, i) => {
        const visualIndex = (i - rotationOffset + totalSeats) % totalSeats;
        const pos = positions[visualIndex];
        const isMe = i === mySeat;
        const isFree = !player;
        const canSit = isFree && mySeat === null;
        const isActive = currentPlayer === i;
        const isFolded = player?.folded ?? false;

        let timeLeft = 0;
        if (isActive && turnExpiresAt) {
          timeLeft = Math.max(0, Math.ceil((turnExpiresAt - now) / 1000));
        }

        const initial = player
          ? (player.displayName || player.id || '?').charAt(0).toUpperCase()
          : '';
        const status = player ? getStatus(player) : null;
        const displayName = player?.displayName || (player ? `Player ${player.id.slice(0, 4)}` : '');

        /* ═══════════════════════════════════════
           MOBILE "MY SEAT" — expanded layout
           Large cards above + compact info strip below
           ═══════════════════════════════════════ */
        if (isMobile && isMe && player) {
          return (
            <div
              key={i}
              className="absolute flex flex-col items-center z-20"
              style={{
                left: pos.left,
                top: pos.top,
                transform: pos.align,
                width: seatWidth * 1.5,
              }}
            >
              {/* Large cards above */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: -10 }}>
                <HandDisplay cards={player.hand} size={seatWidth * 0.75} overlap={seatWidth * 0.2} />
              </div>

              {/* Compact info strip */}
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 10px 5px 6px',
                  borderRadius: 14,
                  background: 'rgba(10,10,14,0.9)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: `1.5px solid ${isActive ? alpha(N.active.color, 31) : 'rgba(176,190,197,0.18)'}`,
                  ...(isActive ? {
                    animation: 'seat-glow-pulse 2s ease-in-out infinite',
                  } : {}),
                }}
              >
                {isActive && <GlowBar color={N.active.color} glow={N.active.glow} />}

                {/* Avatar + timer ring */}
                <div style={{ position: 'relative', width: avatarSize, height: avatarSize, flexShrink: 0 }}>
                  {isActive && turnExpiresAt && (
                    <TimerRing size={avatarSize} timeLeft={timeLeft} totalTime={TURN_DURATION} />
                  )}
                  <Avatar
                    initial={initial}
                    size={avatarSize}
                    isActive={isActive}
                    avatarUrl={resolveAvatar(player.avatarId as AvatarId | undefined)}
                  />
                </div>

                {/* Name + stack */}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 0 }}>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 68,
                    lineHeight: '13px',
                  }}>
                    {displayName}
                  </span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    color: N.chips.color,
                    textShadow: `0 0 8px ${N.chips.glow}`,
                    lineHeight: '13px',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {player.chips.toLocaleString()}
                  </span>
                </div>

                {/* Status */}
                {status && (
                  <StatusBadge label={status.label} color={status.color} glow={status.glow} />
                )}
              </div>
            </div>
          );
        }

        /* ═══════════════════════════════════════
           STANDARD SEAT — Compact Card style
           Avatar on top, cards in middle, name+stack at bottom
           ═══════════════════════════════════════ */
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: pos.left,
              top: pos.top,
              transform: pos.align,
              width: seatWidth,
              height: seatHeight,
              zIndex: isActive ? 20 : 10,
              transition: 'z-index 0.3s',
            }}
            onClick={() => canSit && onSit(i)}
          >
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                borderRadius: 14,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '4px 6px 8px',
                background: isFree
                  ? (canSit ? alpha(N.sit.color, 4) : 'rgba(20,20,28,0.4)')
                  : 'rgba(10,10,14,0.88)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: isActive
                  ? `1.5px solid ${alpha(N.active.color, 31)}`
                  : player?.waitingForBB
                    ? `1.5px solid ${alpha(N.waitbb.color, 25)}`
                    : canSit
                      ? `1.5px dashed ${alpha(N.sit.color, 25)}`
                      : isFree
                        ? '1.5px dashed rgba(176,190,197,0.15)'
                        : '1.5px solid rgba(176,190,197,0.12)',
                overflow: 'visible',
                cursor: canSit ? 'pointer' : 'default',
                transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
                opacity: isFolded ? 0.65 : 1,
                ...(isActive ? {
                  animation: 'seat-glow-pulse 2s ease-in-out infinite',
                } : canSit ? {
                  animation: 'empty-seat-breathe 3s ease-in-out infinite',
                } : {}),
              }}
              onMouseEnter={(e) => {
                if (canSit) {
                  e.currentTarget.style.boxShadow = `0 0 16px ${N.sit.glow}, inset 0 0 8px ${N.sit.glow}`;
                  e.currentTarget.style.borderColor = alpha(N.sit.color, 44);
                }
              }}
              onMouseLeave={(e) => {
                if (canSit) {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = '';
                }
              }}
            >
              {isActive && <GlowBar color={N.active.color} glow={N.active.glow} />}

              {player ? (
                <>
                  {/* Avatar floats above the seat box */}
                  <div
                    style={{
                      position: 'absolute',
                      top: -(avatarSize / 2) - 1,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: avatarSize,
                      height: avatarSize,
                      zIndex: 25,
                    }}
                  >
                    {isActive && turnExpiresAt && (
                      <TimerRing size={avatarSize} timeLeft={timeLeft} totalTime={TURN_DURATION} />
                    )}
                    <Avatar
                      initial={initial}
                      size={avatarSize}
                      isActive={isActive}
                      avatarUrl={resolveAvatar(player.avatarId as AvatarId | undefined)}
                    />
                  </div>

                  {/* Name — truncated, white */}
                  <div style={{
                    marginTop: (avatarSize / 2) + 2,
                    fontSize: isMobile ? 9 : 10,
                    fontWeight: 600,
                    color: '#fff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '92%',
                    lineHeight: '13px',
                  }}>
                    {displayName}
                  </div>

                  {/* Cards — scaled down */}
                  <div style={{
                    transform: `scale(${isMobile ? 0.7 : 0.85})`,
                    transformOrigin: 'center top',
                    height: Math.round((seatWidth * 0.6 * 1.4) * (isMobile ? 0.7 : 0.85)),
                    marginTop: 1,
                    marginBottom: -2,
                    display: 'flex',
                    justifyContent: 'center',
                    width: '100%',
                    pointerEvents: 'none',
                  }}>
                    <HandDisplay cards={player.hand} size={seatWidth * 0.6} />
                  </div>

                  {/* Stack — monospace amber with glow */}
                  <div style={{
                    fontSize: 10,
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    fontVariantNumeric: 'tabular-nums',
                    color: N.chips.color,
                    textShadow: `0 0 8px ${N.chips.glow}`,
                    lineHeight: '13px',
                  }}>
                    {player.chips.toLocaleString()}
                  </div>

                  {/* Status badge */}
                  {status && (
                    <div style={{ marginTop: 1 }}>
                      <StatusBadge label={status.label} color={status.color} glow={status.glow} />
                    </div>
                  )}
                </>
              ) : (
                /* ── Empty seat ── */
                <>
                  <div style={{
                    fontSize: 24,
                    fontWeight: 300,
                    color: canSit ? N.sit.color : N.neutral.color,
                    opacity: canSit ? 0.8 : 0.25,
                    lineHeight: 1,
                    textShadow: canSit ? `0 0 10px ${N.sit.glow}` : 'none',
                    transition: 'opacity 0.3s',
                  }}>
                    +
                  </div>
                  {canSit && (
                    <div style={{
                      fontSize: 8,
                      fontWeight: 800,
                      color: N.sit.color,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginTop: 2,
                      textShadow: `0 0 6px ${N.sit.glow}`,
                    }}>
                      Sit
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};

export default SeatsDisplay;
