// Contraseñas y sesiones. Las contraseñas se guardan con scrypt; de las sesiones solo se guarda
// la huella del token, nunca el token.

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import type { Request } from "express";
import { db, now, sessions, users } from "./db";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const COOKIE = "rl_session";
const WEB_DAYS = 30;
const APP_DAYS = 365;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const fingerprint = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: number, kind: "web" | "app", device?: string): Promise<{ token: string; maxAge: number }> {
  const token = randomBytes(32).toString("hex");
  const maxAge = (kind === "app" ? APP_DAYS : WEB_DAYS) * 86400;
  const t = now();
  await db.insert(sessions).values({ userId, tokenHash: fingerprint(token), kind, device: device?.slice(0, 120) || null, createdAt: t, lastUsedAt: t, expiresAt: t + maxAge });
  return { token, maxAge };
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, fingerprint(token)));
}

/// Token de la petición: "Authorization: Bearer …" (el programa) o la cookie (la web).
export function tokenOf(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim() || null;
  const cookies = req.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const [name, ...value] = cookie.trim().split("=");
    if (name === COOKIE) return decodeURIComponent(value.join("=")) || null;
  }
  return null;
}

export type User = typeof users.$inferSelect;

export async function userOf(req: Request): Promise<User | null> {
  const token = tokenOf(req);
  if (!token) return null;
  const t = now();
  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, fingerprint(token)), gt(sessions.expiresAt, t)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // Como mucho una escritura por hora y sesión. Las del programa se renuevan solas mientras se use.
  if (t - row.session.lastUsedAt > 3600) {
    const expiresAt = row.session.kind === "app" ? t + APP_DAYS * 86400 : row.session.expiresAt;
    await db.update(sessions).set({ lastUsedAt: t, expiresAt }).where(eq(sessions.id, row.session.id));
  }
  return row.user;
}

export function isAdmin(user: User): boolean {
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(user.email);
}

/// Lo que se devuelve de un usuario: nunca la contraseña.
export function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
    consentLibrary: user.consentLibrary,
    admin: isAdmin(user),
  };
}
