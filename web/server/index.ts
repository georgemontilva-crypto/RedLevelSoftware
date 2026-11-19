// Servidor de Red Level: cuentas, descarga del instalador y la API que usa el programa de Windows.
// Sirve también la web ya compilada (carpeta dist).

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { count, desc, eq, sql, sum } from "drizzle-orm";
import express, { type NextFunction, type Request, type Response } from "express";
import { COOKIE, createSession, destroySession, hashPassword, isAdmin, publicUser, tokenOf, userOf, verifyPassword, type User } from "./auth";
import { createTables, db, downloads, libraryGames, now, pool, sessions, users } from "./db";

const REPO = process.env.GITHUB_REPO ?? "georgemontilva-crypto/RedLevelSoftware";
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

/// Error con el mensaje que verá la persona y su código HTTP.
class Problem extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Límite de intentos por IP para registro e inicio de sesión: frena a quien prueba contraseñas.
const attempts = new Map<string, { count: number; resetAt: number }>();
function limit(req: Request, max = 12, windowSeconds = 300) {
  const key = `${req.ip}:${req.path}`;
  const t = now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < t) {
    attempts.set(key, { count: 1, resetAt: t + windowSeconds });
    return;
  }
  entry.count += 1;
  if (entry.count > max) throw new Problem(429, "Demasiados intentos. Espera unos minutos y vuelve a probar.");
}
setInterval(() => {
  const t = now();
  for (const [key, entry] of attempts) if (entry.resetAt < t) attempts.delete(key);
}, 60_000).unref();

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

function credentials(body: Record<string, unknown>) {
  const email = text(body.email, 190).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Problem(400, "Escribe un correo válido.");
  return { email, password };
}

async function requireUser(req: Request): Promise<User> {
  const user = await userOf(req);
  if (!user) throw new Problem(401, "Inicia sesión para continuar.");
  return user;
}

/// Abre la sesión y la entrega: cookie para la web, token en la respuesta para el programa.
async function openSession(req: Request, res: Response, user: User) {
  const kind = req.body?.client === "app" ? "app" : "web";
  const { token, maxAge } = await createSession(user.id, kind, text(req.body?.device, 120));
  if (kind === "web") {
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: req.secure, maxAge: maxAge * 1000, path: "/" });
    return res.json({ user: publicUser(user) });
  }
  return res.json({ user: publicUser(user), token });
}

// ── Cuentas ──────────────────────────────────────────────────

app.post("/api/auth/register", async (req, res) => {
  limit(req);
  const { email, password } = credentials(req.body ?? {});
  const name = text(req.body?.name, 80);
  if (name.length < 2) throw new Problem(400, "Escribe tu nombre.");
  if (password.length < 8) throw new Problem(400, "La contraseña debe tener al menos 8 caracteres.");
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) throw new Problem(409, "Ya hay una cuenta con ese correo. Inicia sesión.");
  const consent = req.body?.consentLibrary === true;
  const t = now();
  await db.insert(users).values({ email, name, passwordHash: await hashPassword(password), createdAt: t, consentLibrary: consent, consentAt: consent ? t : null });
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  await openSession(req, res, user);
});

app.post("/api/auth/login", async (req, res) => {
  limit(req);
  const { email, password } = credentials(req.body ?? {});
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados.
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new Problem(401, "Correo o contraseña incorrectos.");
  await openSession(req, res, user);
});

app.post("/api/auth/logout", async (req, res) => {
  const token = tokenOf(req);
  if (token) await destroySession(token);
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/me", async (req, res) => {
  const user = await userOf(req);
  res.json({ user: user ? publicUser(user) : null });
});

app.patch("/api/me", async (req, res) => {
  const user = await requireUser(req);
  const changes: Partial<typeof users.$inferInsert> = {};
  if (req.body?.name !== undefined) {
    const name = text(req.body.name, 80);
    if (name.length < 2) throw new Problem(400, "Escribe tu nombre.");
    changes.name = name;
  }
  if (typeof req.body?.consentLibrary === "boolean") {
    changes.consentLibrary = req.body.consentLibrary;
    changes.consentAt = req.body.consentLibrary ? now() : null;
    // Retirar el permiso borra lo que ya se había guardado de su biblioteca.
    if (!req.body.consentLibrary) await db.delete(libraryGames).where(eq(libraryGames.userId, user.id));
  }
  if (Object.keys(changes).length > 0) await db.update(users).set(changes).where(eq(users.id, user.id));
  const [fresh] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  res.json({ user: publicUser(fresh) });
});

app.delete("/api/me", async (req, res) => {
  const user = await requireUser(req);
  await db.delete(libraryGames).where(eq(libraryGames.userId, user.id));
  await db.delete(downloads).where(eq(downloads.userId, user.id));
  await db.delete(sessions).where(eq(sessions.userId, user.id));
  await db.delete(users).where(eq(users.id, user.id));
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

// ── Descarga ─────────────────────────────────────────────────

interface Release {
  version: string;
  url: string;
  size: number;
  publishedAt: string;
}
let cached: { at: number; release: Release | null } = { at: 0, release: null };

/// Último instalador publicado en GitHub. Se consulta como mucho cada 5 minutos.
async function latestRelease(): Promise<Release | null> {
  if (now() - cached.at < 300) return cached.release;
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { "User-Agent": "red-level-web", Accept: "application/vnd.github+json" } });
    if (response.ok) {
      const data = (await response.json()) as { tag_name: string; published_at: string; assets: { name: string; size: number; browser_download_url: string }[] };
      const installer = data.assets.find((asset) => asset.name.toLowerCase().endsWith(".exe"));
      if (installer) cached = { at: now(), release: { version: data.tag_name.replace(/^v/, ""), url: installer.browser_download_url, size: installer.size, publishedAt: data.published_at } };
    }
  } catch (error) {
    console.error("No se pudo consultar GitHub:", error);
  }
  if (cached.at === 0) cached.at = now() - 240; // sin respuesta: se reintenta en un minuto
  return cached.release;
}

app.get("/api/release", async (_req, res) => {
  const release = await latestRelease();
  res.json({ release: release ? { version: release.version, size: release.size, publishedAt: release.publishedAt } : null });
});

app.post("/api/download", async (req, res) => {
  const user = await requireUser(req);
  const release = await latestRelease();
  if (!release) throw new Problem(503, "El instalador no está disponible ahora mismo. Inténtalo en unos minutos.");
  await db.insert(downloads).values({ userId: user.id, version: release.version, createdAt: now() });
  res.json({ url: release.url, version: release.version });
});

// ── Programa de Windows ──────────────────────────────────────

interface SyncGame {
  id: string;
  store: string;
  title: string;
  minutes: number;
  lastPlayed: number | null;
  achUnlocked: number | null;
  achTotal: number | null;
}

const whole = (value: unknown, max: number) => (typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : null);

/// El programa llama aquí al abrirse: deja constancia de uso y, si el usuario lo permitió, de su biblioteca.
app.post("/api/app/sync", async (req, res) => {
  const user = await requireUser(req);
  const t = now();
  await db.update(users).set({ lastSeenAt: t, appVersion: text(req.body?.appVersion, 20) || null }).where(eq(users.id, user.id));

  let saved = 0;
  if (user.consentLibrary && Array.isArray(req.body?.games)) {
    const games: SyncGame[] = [];
    const seen = new Set<string>();
    for (const raw of (req.body.games as Record<string, unknown>[]).slice(0, 3000)) {
      const id = text(raw?.id, 190);
      const title = text(raw?.title, 190);
      if (!id || !title || seen.has(id)) continue;
      seen.add(id);
      games.push({
        id,
        title,
        store: text(raw.store, 12) || "local",
        minutes: whole(raw.minutes, 100_000_000) ?? 0,
        lastPlayed: whole(raw.lastPlayed, 4_000_000_000),
        achUnlocked: whole(raw.achUnlocked, 100_000),
        achTotal: whole(raw.achTotal, 100_000),
      });
    }
    // Se sustituye la biblioteca entera: así desaparecen los juegos que el usuario ya no tiene.
    await db.delete(libraryGames).where(eq(libraryGames.userId, user.id));
    for (let i = 0; i < games.length; i += 200) {
      await db.insert(libraryGames).values(
        games.slice(i, i + 200).map((g) => ({ userId: user.id, gameId: g.id, store: g.store, title: g.title, minutes: g.minutes, lastPlayed: g.lastPlayed, achUnlocked: g.achUnlocked, achTotal: g.achTotal, updatedAt: t })),
      );
    }
    saved = games.length;
  }
  res.json({ user: publicUser(user), gamesSaved: saved });
});

// ── Panel del dueño ──────────────────────────────────────────

async function adminRows() {
  const totals = db
    .select({ userId: libraryGames.userId, games: count().as("games"), minutes: sum(libraryGames.minutes).as("minutes") })
    .from(libraryGames)
    .groupBy(libraryGames.userId)
    .as("totals");
  const fetched = db.select({ userId: downloads.userId, downloads: count().as("downloads") }).from(downloads).groupBy(downloads.userId).as("fetched");
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
      appVersion: users.appVersion,
      consentLibrary: users.consentLibrary,
      games: sql<number>`COALESCE(${totals.games}, 0)`,
      minutes: sql<number>`COALESCE(${totals.minutes}, 0)`,
      downloads: sql<number>`COALESCE(${fetched.downloads}, 0)`,
    })
    .from(users)
    .leftJoin(totals, eq(totals.userId, users.id))
    .leftJoin(fetched, eq(fetched.userId, users.id))
    .orderBy(desc(users.createdAt))
    .limit(5000);
  return rows.map((row) => ({ ...row, games: Number(row.games), minutes: Number(row.minutes), downloads: Number(row.downloads) }));
}

async function requireAdmin(req: Request): Promise<User> {
  const user = await requireUser(req);
  if (!isAdmin(user)) throw new Problem(403, "Esta página es solo para el equipo de Red Level.");
  return user;
}

app.get("/api/admin/users", async (req, res) => {
  await requireAdmin(req);
  res.json({ users: await adminRows() });
});

app.get("/api/admin/users.csv", async (req, res) => {
  await requireAdmin(req);
  const date = (seconds: number | null) => (seconds ? new Date(seconds * 1000).toISOString().slice(0, 16).replace("T", " ") : "");
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [["nombre", "correo", "registro", "ultima_conexion", "version", "descargas", "comparte_biblioteca", "juegos", "horas"].join(",")];
  for (const u of await adminRows()) {
    lines.push([u.name, u.email, date(u.createdAt), date(u.lastSeenAt), u.appVersion, u.downloads, u.consentLibrary ? "si" : "no", u.games, Math.round(u.minutes / 60)].map(cell).join(","));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="red-level-usuarios.csv"');
  res.send("﻿" + lines.join("\r\n"));
});

app.get("/api/admin/users/:id/games", async (req, res) => {
  await requireAdmin(req);
  const games = await db
    .select({ title: libraryGames.title, store: libraryGames.store, minutes: libraryGames.minutes, lastPlayed: libraryGames.lastPlayed, achUnlocked: libraryGames.achUnlocked, achTotal: libraryGames.achTotal })
    .from(libraryGames)
    .where(eq(libraryGames.userId, Number(req.params.id) || 0))
    .orderBy(desc(libraryGames.minutes))
    .limit(3000);
  res.json({ games });
});

app.get("/api/config", (_req, res) => {
  res.json({ contactEmail: process.env.CONTACT_EMAIL?.trim() || null });
});

app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true });
});

app.use("/api", (_req, _res, next) => next(new Problem(404, "Esa dirección no existe.")));

// ── La web ───────────────────────────────────────────────────

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = [path.join(here, "../dist"), path.join(process.cwd(), "dist")].find((dir) => existsSync(path.join(dir, "index.html")));
if (dist) {
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.use((req, res, next) => (req.method === "GET" ? res.sendFile(path.join(dist, "index.html")) : next()));
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof Problem) return res.status(error.status).json({ error: error.message });
  if (error instanceof SyntaxError) return res.status(400).json({ error: "La petición no se entiende." });
  console.error(error);
  res.status(500).json({ error: "Algo falló en el servidor. Inténtalo de nuevo." });
});

await createTables();
app.listen(PORT, () => console.log(`Red Level web escuchando en el puerto ${PORT}`));
