import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  AdminClientEvents,
  AdminServerEvents,
  AdminState,
  AdminTableInfo,
} from '../../../../types/index';

/**
 * Phase 5 / Plan 05-05 / ADMIN-03 / useAdminSocket.
 *
 * Owns the /admin namespace Socket.io connection lifecycle.
 * Reads JWT from localStorage on mount; exposes adminState, mutations socket,
 * and a 401-redirect flag when server rejects the token.
 */

type AdminSocket = Socket<AdminServerEvents, AdminClientEvents>;

interface UseAdminSocketResult {
  state: AdminState | null;
  socket: AdminSocket | null;
  connectionError: string | null;
  /** true if server rejected JWT with UNAUTHORIZED — caller should clear JWT + redirect to login */
  unauthorized: boolean;
}

export function useAdminSocket(): UseAdminSocketResult {
  const [state, setState] = useState<AdminState | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const socketRef = useRef<AdminSocket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('adminJwt');
    if (!token) {
      setUnauthorized(true);
      return;
    }

    const sock: AdminSocket = io('/admin', {
      auth: { token },
      autoConnect: true,
    });
    socketRef.current = sock;

    sock.on('connect_error', (err) => {
      if (err.message === 'UNAUTHORIZED') {
        setUnauthorized(true);
        localStorage.removeItem('adminJwt');
      } else {
        setConnectionError(err.message);
      }
    });

    sock.on('connect', () => {
      setConnectionError(null);
    });

    sock.on('disconnect', () => {
      setConnectionError('Connection lost. Attempting to reconnect…');
    });

    sock.on('adminState', (snapshot) => setState(snapshot));

    sock.on('tableStateChanged', (table: AdminTableInfo) => {
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tables: prev.tables.map((t) => (t.id === table.id ? table : t)),
        };
      });
    });

    sock.on('userBanned', ({ telegramId, bannedAt }) => {
      setState((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((u) =>
                u.telegramId === telegramId ? { ...u, bannedAt } : u
              ),
            }
          : prev
      );
    });

    sock.on('userKicked', ({ telegramId }) => {
      setState((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.filter((u) => u.telegramId !== telegramId),
            }
          : prev
      );
    });

    sock.on('balanceGranted', () => {
      // No-op delta — economy snapshot is rebuilt on next reconnect.
      // For MVP we don't propagate per-user balance into AdminUserInfo
      // (chips reflects table chips, not wallet balance).
    });

    sock.on('auditLogAppended', (entry) => {
      setState((prev) =>
        prev
          ? {
              ...prev,
              recentAuditLogs: [entry, ...prev.recentAuditLogs].slice(0, 10),
            }
          : prev
      );
    });

    return () => {
      sock.removeAllListeners();
      sock.disconnect();
      socketRef.current = null;
    };
  }, []);

  return {
    state,
    socket: socketRef.current,
    connectionError,
    unauthorized,
  };
}
