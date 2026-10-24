import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

const COOKIE = 'hcm_token';
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'hcm-lite-dev-secret-change-me'
);

export function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}
export function verifyPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}
export function tempPassword() {
  return 'Temp-' + Math.random().toString(36).slice(2, 8) + '!' + Math.floor(Math.random() * 10);
}

export async function signSession({ id, email, role, employee_id }) {
  return new SignJWT({ email, role, employee_id: employee_id || null })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function setSessionCookie(token) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

// Returns session {id, email, role, employee_id} or null.
export async function getSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return { id: payload.sub, email: payload.email, role: payload.role, employee_id: payload.employee_id || null };
  } catch {
    return null;
  }
}

// --- API helpers -------------------------------------------------------------

export function json(data, status = 200) {
  return Response.json(data, { status });
}
export function fail(status, code, message, details) {
  return Response.json({ error: { code, message, details } }, { status });
}

// Wraps a handler: requires a valid session (and optionally role).
// Handler receives (req, ctx, session). Returns 401/403 responses on failure.
export function withAuth(roles, handler) {
  return async (req, ctx) => {
    const session = await getSession();
    if (!session) return fail(401, 'UNAUTHORIZED', 'Login required');
    if (roles && roles.length && !roles.includes(session.role)) {
      return fail(403, 'FORBIDDEN', `Requires role: ${roles.join(' or ')}`);
    }
    return handler(req, ctx, session);
  };
}

export function publicRoute(handler) {
  return async (req, ctx) => handler(req, ctx);
}
