import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * Phase 5 / Plan 05-03 / ADMIN-01 / ADMIN-02 / D-02 / Discretionary 8h expiry.
 *
 * JWT helpers + credential validator. Env vars are read LAZILY inside each
 * function so tests can vi.resetModules and set fresh values in beforeEach.
 *
 * In dev (NODE_ENV !== 'production') without JWT_SECRET set, we fall back to
 * a process-local ephemeral secret generated once at module load. A single
 * warn is logged so the operator notices, but the login flow still works.
 *
 * In production, the boot guard in server/middleware/auth.ts assertSafeBootOrExit
 * exits with code 1 if JWT_SECRET is unset — so this module never reaches the
 * fallback in prod.
 */

const EPHEMERAL_DEV_SECRET = crypto.randomBytes(32).toString('hex');
let _devWarnEmitted = false;

function getJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    // The boot guard should have exited already; if we reach here, something is very wrong.
    throw new Error('JWT_SECRET missing in production');
  }
  if (!_devWarnEmitted) {
    console.warn('[adminAuth] JWT_SECRET not set in dev — using process-local ephemeral secret. Tokens will not survive a restart.');
    _devWarnEmitted = true;
  }
  return EPHEMERAL_DEV_SECRET;
}

export function signAdminToken(username: string): string {
  return jwt.sign({ username }, getJwtSecret(), { expiresIn: '8h', algorithm: 'HS256' });
}

export function verifyAdminToken(token: string): { username: string } {
  const payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
  if (typeof payload !== 'object' || payload === null || typeof (payload as any).username !== 'string') {
    throw new Error('Invalid admin token payload');
  }
  return { username: (payload as any).username };
}

export function validateCredentials(username: unknown, password: unknown): boolean {
  if (typeof username !== 'string' || typeof password !== 'string') return false;
  if (username.length === 0 || password.length === 0) return false;
  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASS;
  if (!expectedUser || !expectedPass) return false;
  // Use timingSafeEqual on equal-length comparisons to defend against timing attacks.
  // For different-length inputs, return false directly — the user/pass length being a
  // few bytes off is not a useful side channel.
  if (username.length !== expectedUser.length || password.length !== expectedPass.length) return false;
  const userMatch = crypto.timingSafeEqual(Buffer.from(username), Buffer.from(expectedUser));
  const passMatch = crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expectedPass));
  return userMatch && passMatch;
}
