import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { Button, Card } from '../components/ui';
import type { ExtendedClientEvents, ExtendedServerEvents } from '../../../types/index';

/**
 * Consent — first-launch full-page consent gate.
 *
 * Plan 02-08 / D-27 / COMPLIANCE-02.
 *
 * This is a FULL-PAGE ROUTE, not a modal. Shown to any authenticated user
 * whose `tosAcceptedAt` is null. Single combined checkbox + Accept button
 * covering Terms of Service, Privacy Policy, and Responsible Gaming.
 *
 * On Accept: emits `acceptTos` with `version: '1.0'`. Server validates auth
 * and payload, writes `tosAcceptedAt = now()` + `tosVersion = '1.0'` to the
 * User row, then emits `tosAccepted`. App.tsx's listener updates
 * `currentUser.tosAcceptedAt` and transitions the view to 'menu'.
 *
 * No skip button. No "remind me later". This is a gate.
 */

interface ConsentProps {
  socket: Socket<ExtendedServerEvents, ExtendedClientEvents>;
  onAccept: () => void;
  onViewLegal: (which: 'tos' | 'privacy' | 'rg') => void;
}

export const Consent: React.FC<ConsentProps> = ({ socket, onAccept, onViewLegal }) => {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // If the server ack arrives, close the gate. Using `on` + cleanup rather
  // than `once` so the component is resilient to accidental double-emits
  // from either side (idempotent on the client). Server rejects duplicates
  // at the DB level — a second write just re-stamps tosAcceptedAt, and the
  // client converges on the first ack it sees.
  useEffect(() => {
    const handleAccepted = () => {
      setSubmitting(false);
      onAccept();
    };
    socket.on('tosAccepted', handleAccepted);
    return () => {
      socket.off('tosAccepted', handleAccepted);
    };
  }, [socket, onAccept]);

  const handleAccept = () => {
    if (!agreed || submitting) return;
    setSubmitting(true);
    socket.emit('acceptTos', { version: '1.0' });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(ellipse at top, rgba(0,229,255,0.08) 0%, transparent 55%), var(--color-surface-base)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        padding: 'max(env(safe-area-inset-top), 20px) 16px max(env(safe-area-inset-bottom), 20px)',
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center' }}>
        <Card variant="active" glow padding={22}>
          <h1
            style={{
              color: 'var(--color-active)',
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              textShadow: '0 0 10px var(--glow-call)',
              margin: '0 0 10px',
              textAlign: 'center',
            }}
          >
            Welcome to NightRiver
          </h1>
          <p
            style={{
              color: '#e0f7fa',
              fontSize: 14,
              lineHeight: 1.55,
              margin: '0 0 18px',
              textAlign: 'center',
            }}
          >
            Before you play, please review and accept our terms.
          </p>

          {/* Inline links to full legal pages (D-27) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginBottom: 20,
              padding: '12px 14px',
              background: 'rgba(10,10,14,0.6)',
              border: '1px solid color-mix(in srgb, var(--color-active) 32%, transparent)',
              borderRadius: 10,
            }}
          >
            <LegalLink label="Terms of Service" onClick={() => onViewLegal('tos')} />
            <LegalLink label="Privacy Policy" onClick={() => onViewLegal('privacy')} />
            <LegalLink label="Responsible Gaming" onClick={() => onViewLegal('rg')} />
          </div>

          {/* Single combined checkbox (D-27 explicit) */}
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              color: '#fff',
              fontSize: 13,
              lineHeight: 1.5,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              marginBottom: 18,
            }}
          >
            <input
              type="checkbox"
              checked={agreed}
              disabled={submitting}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{
                width: 20,
                height: 20,
                accentColor: 'var(--color-active)',
                marginTop: 1,
                flexShrink: 0,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            />
            <span>
              I agree to the Terms, Privacy Policy, and Responsible Gaming guidelines.
            </span>
          </label>

          <Button
            variant="active"
            emphasis
            fullWidth
            disabled={!agreed || submitting}
            onClick={handleAccept}
            style={{
              opacity: !agreed || submitting ? 0.5 : 1,
              cursor: !agreed || submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Saving…' : 'Accept & Continue'}
          </Button>
        </Card>
      </div>
    </div>
  );
};

const LegalLink: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      background: 'transparent',
      border: 'none',
      padding: '6px 4px',
      textAlign: 'left',
      color: 'var(--color-active)',
      fontSize: 13,
      fontWeight: 600,
      letterSpacing: '0.02em',
      cursor: 'pointer',
      textDecoration: 'underline',
      textUnderlineOffset: 3,
      textDecorationColor: 'color-mix(in srgb, var(--color-active) 50%, transparent)',
      WebkitTapHighlightColor: 'transparent',
    }}
  >
    › {label}
  </button>
);
