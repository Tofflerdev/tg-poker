import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { HandHistoryDTO } from '../../../types/index';

/**
 * Phase 3 / Plan 03-05 (PROFILE-03) — reactive hand-history loader.
 *
 * Behaviour (UI-SPEC §"History tab data loading"):
 * - When `active` flips to `true`, emit `getHandHistory` (zero-arg, server uses
 *   socket.data.telegramId per Plan 03-04's T-3-AUTHZ guarantee).
 * - Subscribe to `handHistoryData` and `handHistoryError` until `active` flips
 *   to `false` or the component unmounts.
 * - Start a 5-second client-side timeout — if no response arrives, transition
 *   into the error state with reason 'timeout'. The server has no enforced
 *   timeout (per Plan 03-04 verification), so this is the client's safety net.
 * - On `active` going false → true again, the request is re-issued (UI-SPEC
 *   "Reload on tab re-enter").
 *
 * Returned shape:
 *   - `rows: HandHistoryDTO[] | null` — null until first successful response.
 *   - `loading: boolean` — true between emit and first response (or timeout).
 *   - `error: string | null` — populated on `handHistoryError` or 'timeout'.
 */

export interface UseHandHistoryState {
  rows: HandHistoryDTO[] | null;
  loading: boolean;
  error: string | null;
}

const REQUEST_TIMEOUT_MS = 5000;

export function useHandHistory(socket: Socket, active: boolean): UseHandHistoryState {
  const [state, setState] = useState<UseHandHistoryState>({
    rows: null,
    loading: false,
    error: null,
  });

  // Track whether the current request has resolved so we can ignore late
  // events from an earlier activation (e.g. tab toggled off→on→off→on quickly).
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!active) return;

    const myRequestId = ++requestIdRef.current;
    setState({ rows: null, loading: true, error: null });

    const onData = (rows: HandHistoryDTO[]) => {
      if (requestIdRef.current !== myRequestId) return;
      setState({ rows, loading: false, error: null });
    };
    const onError = (msg: string) => {
      if (requestIdRef.current !== myRequestId) return;
      setState({ rows: null, loading: false, error: msg || 'Server error' });
    };

    socket.on('handHistoryData', onData);
    socket.on('handHistoryError', onError);
    socket.emit('getHandHistory');

    const timeoutHandle = setTimeout(() => {
      if (requestIdRef.current !== myRequestId) return;
      setState((prev) => {
        // Only transition to timeout if we haven't already received a response.
        if (!prev.loading) return prev;
        return { rows: null, loading: false, error: 'timeout' };
      });
    }, REQUEST_TIMEOUT_MS);

    return () => {
      clearTimeout(timeoutHandle);
      socket.off('handHistoryData', onData);
      socket.off('handHistoryError', onError);
      // Bump the request id so any in-flight async response from this cycle
      // is ignored.
      requestIdRef.current += 1;
    };
  }, [socket, active]);

  return state;
}
