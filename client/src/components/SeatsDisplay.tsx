import React, { useState, useEffect } from "react";
import HandDisplay from "./HandDisplay";
import { Player } from "../../../types/index";
import { avatarUrl as resolveAvatar, type AvatarId } from "../assets/avatars/manifest";
import { SEAT_POSITIONS_DESKTOP, SEAT_POSITIONS_MOBILE, seatGeometry, SEAT_OVERLAY_Y } from "./seatLayout";

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

/* ── Avatar — circular initial-letter with optional glow ── */
const Avatar: React.FC<{
  initial: string;
  size: number;
  isActive: boolean;
  avatarUrl?: string;
  imgScale?: number;   // zoom the source art to fill the circle (source has baked-in margins)
  borderWidth?: number;
}> = ({ initial, size, isActive, avatarUrl, imgScale = 1, borderWidth = 1.5 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'rgba(14,14,20,0.95)',
      border: `${borderWidth}px solid ${isActive ? alpha(N.active.color, 56) : 'rgba(176,190,197,0.25)'}`,
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
        style={{
          width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%',
          transform: imgScale !== 1 ? `scale(${imgScale})` : undefined,
        }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    ) : (
      initial
    )}
  </div>
);

/* ── StatusOverlay — contrast badge centered over a seat (Fold / All-in / Sit out / Wait BB) ── */
const StatusOverlay: React.FC<{ label: string; color: string; glow: string }> = ({
  label, color, glow,
}) => (
  <div
    style={{
      position: 'absolute',
      top: `${SEAT_OVERLAY_Y * 100}%`,
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 30,
      color: '#fff',
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      padding: '3px 10px',
      borderRadius: 8,
      border: `1.5px solid ${color}`,
      background: 'rgba(10,10,14,0.92)',
      boxShadow: `0 0 10px ${glow}, inset 0 0 8px ${alpha(color, 18)}`,
      textShadow: `0 0 6px ${color}`,
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
    }}
  >
    {label}
  </div>
);

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

  const seatWidth = isMobile ? 64 : 80;   // used by empty-seat box only
  const seatHeight = Math.round(seatWidth * 1.35);

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
           EMPTY SEAT — unchanged.
           (With auto-seating a player normally never sees this, but keep
            the existing dashed "+/Sit" box so nothing regresses.)
           ═══════════════════════════════════════ */
        if (isFree) {
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
                zIndex: 10,
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
                  background: canSit ? alpha(N.sit.color, 4) : 'rgba(20,20,28,0.4)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: canSit
                    ? `1.5px dashed ${alpha(N.sit.color, 25)}`
                    : '1.5px dashed rgba(176,190,197,0.15)',
                  cursor: canSit ? 'pointer' : 'default',
                  transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
                  ...(canSit ? { animation: 'empty-seat-breathe 3s ease-in-out infinite' } : {}),
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
              </div>
            </div>
          );
        }

        /* ═══════════════════════════════════════
           OCCUPIED SEAT — layered layout
           avatar (back) ← cards (mid) ← pill name/stack (front).
           Turn timer = glowing divider line inside the pill.
           ═══════════════════════════════════════ */
        // Avatar/seat geometry. "My seat" uses the same layout, just larger.
        const { aSize, pillW, cardW, pillH, stageH } = seatGeometry(isMobile, isMe);
        const hasCards = !!player.hand && player.hand.length > 0;
        // Hide a folded opponent's face-down "ghost" cards — the Fold badge
        // alone marks them out. (My own folded cards stay: they're face-up.)
        const showCards = hasCards && !(isFolded && !isMe);
        const timerFrac = isActive && turnExpiresAt
          ? Math.max(0, Math.min(1, (turnExpiresAt - now) / (TURN_DURATION * 1000)))
          : 0;
        const urgent = timeLeft <= 5;
        const dim = isFolded ? 0.5 : 1;

        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: pos.left,
              top: pos.top,
              transform: pos.align,
              width: pillW,
              height: stageH,
              zIndex: isActive ? 20 : 10,
              transition: 'z-index 0.3s',
            }}
          >
            {/* Avatar — back layer */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: aSize,
              height: aSize,
              zIndex: 1,
              opacity: dim,
              transition: 'opacity 0.3s',
            }}>
              <Avatar
                initial={initial}
                size={aSize}
                isActive={isActive}
                avatarUrl={resolveAvatar(player.avatarId as AvatarId | undefined)}
                imgScale={1.32}
                borderWidth={2}
              />
            </div>

            {/* Cards — mid layer (top edge ≈ avatar top) */}
            {showCards && (
              <div style={{
                position: 'absolute',
                left: '50%',
                top: Math.round(aSize * 0.05),
                transform: 'translateX(-50%)',
                zIndex: 2,
                pointerEvents: 'none',
                opacity: dim,
                filter: isFolded
                  ? 'grayscale(1) brightness(0.6) drop-shadow(0 3px 6px rgba(0,0,0,0.55))'
                  : 'drop-shadow(0 3px 6px rgba(0,0,0,0.55))',
                transition: 'opacity 0.3s',
              }}>
                <HandDisplay cards={player.hand} size={cardW} overlap={Math.round(cardW * 0.42)} />
              </div>
            )}

            {/* Pill — front layer: name / timer-divider / stack */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: pillW,
              minHeight: pillH,
              zIndex: 3,
              borderRadius: 11,
              overflow: 'hidden',
              background: 'rgba(10,10,14,0.92)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1.5px solid ${isActive ? alpha(N.active.color, 45) : 'rgba(176,190,197,0.16)'}`,
              boxShadow: isActive
                ? `0 0 14px ${N.active.glow}, 0 4px 12px rgba(0,0,0,0.45)`
                : '0 4px 12px rgba(0,0,0,0.45)',
              opacity: dim,
              transition: 'border-color 0.3s, box-shadow 0.3s, opacity 0.3s',
            }}>
              {/* Name */}
              <div style={{
                textAlign: 'center',
                fontSize: isMobile ? 10 : 11,
                fontWeight: 600,
                color: '#fff',
                padding: '4px 8px 3px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.1,
              }}>
                {displayName}
              </div>

              {/* Divider doubling as turn timer */}
              <div style={{
                position: 'relative',
                height: 2,
                background: 'rgba(255,255,255,0.07)',
                overflow: 'hidden',
              }}>
                {isActive && turnExpiresAt && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: `${timerFrac * 100}%`,
                    background: urgent ? N.fold.color : N.active.color,
                    boxShadow: `0 0 6px ${urgent ? N.fold.color : N.active.color}, 0 0 12px ${urgent ? N.fold.glow : N.active.glow}`,
                    transition: 'width 0.25s linear, background 0.3s, box-shadow 0.3s',
                    ...(urgent ? { animation: 'timer-urgency 0.5s ease-in-out infinite' } : {}),
                  }} />
                )}
              </div>

              {/* Stack */}
              <div style={{
                textAlign: 'center',
                fontSize: isMobile ? 12 : 13,
                fontWeight: 800,
                fontFamily: 'monospace',
                fontVariantNumeric: 'tabular-nums',
                color: N.chips.color,
                textShadow: `0 0 8px ${N.chips.glow}`,
                padding: '3px 8px 5px',
                lineHeight: 1,
                background: 'rgba(255,255,255,0.025)',
              }}>
                {player.chips.toLocaleString()}
              </div>
            </div>

            {/* Status overlay — contrast badge (Fold / All-in / Sit out / Wait BB) */}
            {status && (
              <StatusOverlay label={status.label} color={status.color} glow={status.glow} />
            )}
          </div>
        );
      })}
    </>
  );
};

export default SeatsDisplay;
