import React from 'react';

/**
 * Phase 5 / Plan 05-05 / ADMIN-03 / UI-SPEC §AdminBanner.
 *
 * Permanent top bar visible on all /admin/* pages while authenticated.
 * 44px height, amber background, dark text per UI-SPEC.
 */
export const AdminBanner: React.FC = () => (
  <div
    role="banner"
    aria-label="Admin mode indicator"
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: 44,
      backgroundColor: 'var(--color-action-raise)',
      color: '#0a0a0e',
      fontSize: 13,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}
  >
    ADMIN MODE
  </div>
);
