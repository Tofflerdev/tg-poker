import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { Button, Card } from './ui';
import type { ExtendedClientEvents, ExtendedServerEvents } from '../../../types/index';

/**
 * ConsentBanner — non-blocking grandfather banner for legacy users.
 *
 * Plan 02-08 / D-29 / COMPLIANCE-03.
 *
 * Rendered at the top of MainMenu iff:
 *   currentUser.tosAcceptedAt == null  (user predates the ToS gate)
 *   AND localStorage['consent_banner_dismissed_v1'] !== '1'
 *
 * The parent (MainMenu) is responsible for the first predicate so the banner
 * code stays dumb; this component owns only the localStorage dismissal flag
 * and the Accept / Dismiss actions.
 *
 * On Accept: same `acceptTos` flow as Consent.tsx. Also sets the localStorage
 *   flag so the banner doesn't re-render immediately after ack.
 * On Dismiss: only sets the localStorage flag (does NOT call acceptTos —
 *   user stays in the "not accepted" bucket but the nag is suppressed).
 */

const DISMISS_KEY = 'consent_banner_dismissed_v1';

interface ConsentBannerProps {
  socket: Socket<ExtendedServerEvents, ExtendedClientEvents>;
  onAccept: () => void;
  onViewLegal: (which: 'tos' | 'privacy' | 'rg') => void;
}

export const ConsentBanner: React.FC<ConsentBannerProps> = ({
  socket,
  onAccept,
  onViewLegal,
}) => {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [submitting, setSubmitting] = useState(false);

  // Listen for server ack to mirror Consent.tsx's flow (T-02-08-02 applies
  // equally here — server validates the payload). When ack arrives, persist
  // the dismissal flag and tell parent (MainMenu) to hide us.
  useEffect(() => {
    const handleAccepted = () => {
      setSubmitting(false);
      try {
        localStorage.setItem(DISMISS_KEY, '1');
      } catch {
        /* quota / disabled storage — ignore; banner reappears next mount */
      }
      setDismissed(true);
      onAccept();
    };
    socket.on('tosAccepted', handleAccepted);
    return () => {
      socket.off('tosAccepted', handleAccepted);
    };
  }, [socket, onAccept]);

  if (dismissed) return null;

  const handleAccept = () => {
    if (submitting) return;
    setSubmitting(true);
    socket.emit('acceptTos', { version: '1.0' });
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <Card variant="raise" glow padding={14}>
      <div
        style={{
          color: 'var(--color-action-raise)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          textShadow: '0 0 6px var(--glow-raise)',
          marginBottom: 6,
        }}
      >
        Please Review Our Terms
      </div>
      <div
        style={{
          color: '#fff',
          fontSize: 13,
          lineHeight: 1.45,
          marginBottom: 12,
        }}
      >
        We've updated our Terms, Privacy Policy, and Responsible Gaming
        guidelines.{' '}
        <button
          type="button"
          onClick={() => onViewLegal('tos')}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            color: 'var(--color-active)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: 2,
            textDecorationColor: 'color-mix(in srgb, var(--color-active) 50%, transparent)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Read terms
        </button>
        .
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          variant="active"
          emphasis
          onClick={handleAccept}
          disabled={submitting}
          style={{
            flex: 1,
            minHeight: 40,
            fontSize: 13,
            opacity: submitting ? 0.6 : 1,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Saving…' : 'Accept'}
        </Button>
        <Button
          variant="neutral"
          onClick={handleDismiss}
          disabled={submitting}
          style={{
            flex: 1,
            minHeight: 40,
            fontSize: 13,
          }}
        >
          Dismiss
        </Button>
      </div>
    </Card>
  );
};
