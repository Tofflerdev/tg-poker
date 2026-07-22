import React, { useState } from 'react';
import { TabBar } from '../../components/ui';
import { AdminBanner } from './AdminBanner';
import { AdminLogin } from './AdminLogin';
import { AdminTables } from './AdminTables';
import { AdminUsers } from './AdminUsers';
import { AdminEconomy } from './AdminEconomy';
import { AdminAudit } from './AdminAudit';
import { useAdminSocket } from './useAdminSocket';

/**
 * Phase 5 / Plan 05-05 / ADMIN-03 / AdminApp.
 *
 * Root of the lazy-loaded admin subtree. Handles JWT presence check, mounts
 * the /admin namespace socket (via useAdminSocket), renders AdminBanner + 4-tab
 * dashboard. Exported as default so Vite can code-split it to a separate chunk
 * (RESEARCH Pattern 8 / Threat T-5-05-1).
 *
 * No player socket is touched here — the admin path uses its own /admin namespace
 * (Plan 05-04); the player socket in App.tsx is short-circuited entirely when
 * IS_ADMIN_PATH is true.
 */

type AdminTab = 'tables' | 'users' | 'economy' | 'audit';

const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: 'tables', label: 'Tables' },
  { id: 'users', label: 'Users' },
  { id: 'economy', label: 'Economy' },
  { id: 'audit', label: 'Audit Log' },
];

const AdminApp: React.FC = () => {
  const [authed, setAuthed] = useState<boolean>(
    () => Boolean(localStorage.getItem('adminJwt'))
  );

  if (!authed) {
    return <AdminLogin onLoginSuccess={() => setAuthed(true)} />;
  }

  return (
    <AdminAuthenticatedShell
      onLogout={() => {
        localStorage.removeItem('adminJwt');
        setAuthed(false);
      }}
    />
  );
};

interface ShellProps {
  onLogout: () => void;
}

const AdminAuthenticatedShell: React.FC<ShellProps> = ({ onLogout }) => {
  const { state, socket, connectionError, unauthorized } = useAdminSocket();
  const [tab, setTab] = useState<AdminTab>('tables');

  if (unauthorized) {
    // Deferred call so we don't call setState during render.
    setTimeout(onLogout, 0);
    return null;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-base)',
        color: 'white',
        paddingTop: 44,
      }}
    >
      <AdminBanner />

      {connectionError && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 44,
            left: 0,
            width: '100vw',
            padding: 8,
            background: 'rgba(255,171,0,0.12)',
            color: 'var(--color-action-raise)',
            fontSize: 13,
            textAlign: 'center',
            zIndex: 999,
          }}
        >
          {connectionError}
        </div>
      )}

      <div style={{ padding: '24px 32px' }}>
        <TabBar
          tabs={ADMIN_TABS}
          activeId={tab}
          onChange={(id) => setTab(id as AdminTab)}
        />

        <div style={{ marginTop: 16 }}>
          {!state ? (
            <div style={{ padding: 16, color: 'var(--color-neutral)' }}>
              Loading admin state…
            </div>
          ) : !socket ? (
            <div style={{ padding: 16, color: 'var(--color-neutral)' }}>
              Connecting…
            </div>
          ) : (
            <>
              {tab === 'tables' && <AdminTables state={state} socket={socket} />}
              {tab === 'users' && <AdminUsers state={state} socket={socket} />}
              {tab === 'economy' && <AdminEconomy state={state} socket={socket} />}
              {tab === 'audit' && <AdminAudit state={state} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminApp;
