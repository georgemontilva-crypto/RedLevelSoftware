// Servidor de Red Level: cuentas, descarga del instalador y la API que usa el programa de Windows.
// Sirve también la web ya compilada (carpeta dist).

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { count, desc, eq, sql, sum } from "drizzle-orm";
import express, { type NextFunction, type Request, type Response } from "express";
import { COOKIE, createSession, destroySession, hashPassword, isAdmin, publicUser, tokenOf, userOf, verifyPassword, type User } from "./auth";
import { createTables, db, downloads, libraryGames, now, pool, sessions, users } from "./db";
import { registerSocial } from "./social";
import { deleteSavesOf, registerSaves, savesEnabled } from "./saves";
import { deleteWalletOf, registerWallet } from "./wallet";
import { deleteRemoteOf, registerRemote } from "./remote";
import { registerFeed } from "./feed";
import { registerAds } from "./ads";
import { registerMedia } from "./media";
import { deleteMissionsOf, registerMissions } from "./missions";
import { liveCount, registerLive } from "./live";

const REPO = process.env.GITHUB_REPO ?? "georgemontilva-crypto/RedLevelSoftware";
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(express.json({ limit: "3mb" }));

// El programa de Windows llama a esta API desde su propia ventana, que es otro origen. Solo se le deja pasar a él
// (y a los orígenes extra de APP_ORIGINS), y siempre con su token en la cabecera: las cookies de la web no viajan.
const appOrigins = new Set(["http://tauri.localhost", "https://tauri.localhost", "tauri://localhost", ...(process.env.APP_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean)]);
app.use("/api", (req, res, next) => {
  const origin = req.get("origin");
  if (origin && appOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") return res.status(204).end();
  }
  next();
});

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
  await pool.query(`DELETE FROM friendships WHERE user_a = ? OR user_b = ?`, [user.id, user.id]);
  await pool.query(`DELETE FROM chat_messages WHERE from_id = ? OR to_id = ?`, [user.id, user.id]);
  await pool.query(`DELETE FROM presence WHERE user_id = ?`, [user.id]);
  await pool.query(`DELETE FROM user_avatar WHERE user_id = ?`, [user.id]);
  await deleteSavesOf(user.id);
  await deleteWalletOf(user.id);
  await deleteRemoteOf(user.id);
  await deleteMissionsOf(user.id);
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
  sha256: string | null;
}
let cached: { at: number; releases: Release[] } = { at: 0, releases: [] };

/// Instaladores publicados en GitHub, del más nuevo al más viejo. Se consulta como mucho cada 5 minutos.
async function releases(): Promise<Release[]> {
  if (now() - cached.at < 300) return cached.releases;
  try {
    // GITHUB_TOKEN es opcional: sin él, GitHub admite pocas consultas por hora desde una misma dirección.
    const token = process.env.GITHUB_TOKEN?.trim();
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=12`, { headers: { "User-Agent": "red-level-web", Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    if (!response.ok) console.error(`GitHub respondió ${response.status} al pedir las versiones.`);
    if (response.ok) {
      const data = (await response.json()) as { tag_name: string; published_at: string; draft: boolean; prerelease: boolean; assets: { name: string; size: number; browser_download_url: string; digest?: string | null }[] }[];
      const list: Release[] = [];
      for (const item of data) {
        const installer = item.assets.find((asset) => asset.name.toLowerCase().endsWith(".exe"));
        if (item.draft || item.prerelease || !installer) continue;
        const digest = installer.digest?.startsWith("sha256:") ? installer.digest.slice(7) : null;
        list.push({ version: item.tag_name.replace(/^v/, ""), url: installer.browser_download_url, size: installer.size, publishedAt: item.published_at, sha256: digest });
      }
      if (list.length > 0) cached = { at: now(), releases: list };
    }
  } catch (error) {
    console.error("No se pudo consultar GitHub:", error);
  }
  if (cached.at === 0) cached.at = now() - 240; // sin respuesta: se reintenta en un minuto
  return cached.releases;
}

const latestRelease = async (): Promise<Release | null> => (await releases())[0] ?? null;

app.get("/api/release", async (_req, res) => {
  const list = await releases();
  const open = ({ version, size, publishedAt, sha256 }: Release) => ({ version, size, publishedAt, sha256 });
  res.json({ release: list[0] ? open(list[0]) : null, history: list.map(({ version, publishedAt }) => ({ version, publishedAt })) });
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

/// Resumen de uso y los juegos más jugados entre quienes comparten su biblioteca.
app.get("/api/admin/stats", async (req, res) => {
  await requireAdmin(req);
  const week = now() - 7 * 86400;
  const [[totals]] = (await pool.query(
    `SELECT COUNT(*) AS users,
            SUM(app_version IS NOT NULL) AS installed,
            SUM(last_seen_at IS NOT NULL AND last_seen_at > ?) AS activeWeek,
            SUM(consent_library) AS sharing,
            (SELECT COUNT(*) FROM downloads) AS downloads
     FROM users`,
    [week],
  )) as unknown as [Record<string, number | null>[]];
  const [versions] = await pool.query(`SELECT app_version AS version, COUNT(*) AS users FROM users WHERE app_version IS NOT NULL GROUP BY app_version ORDER BY users DESC LIMIT 12`);
  const [games] = await pool.query(
    `SELECT title, store, COUNT(*) AS players, SUM(minutes) AS minutes
     FROM library_games GROUP BY title, store ORDER BY players DESC, minutes DESC LIMIT 30`,
  );
  const n = (value: unknown) => Number(value ?? 0);
  res.json({
    totals: { users: n(totals.users), installed: n(totals.installed), activeWeek: n(totals.activeWeek), sharing: n(totals.sharing), downloads: n(totals.downloads) },
    versions: (versions as Record<string, unknown>[]).map((v) => ({ version: String(v.version), users: n(v.users) })),
    games: (games as Record<string, unknown>[]).map((g) => ({ title: String(g.title), store: String(g.store), players: n(g.players), minutes: n(g.minutes) })),
  });
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

// ── Medición de la web y mensajes ────────────────────────────

const PAGES = new Set(["/", "/planes", "/tienda", "/descargas", "/soporte", "/empresas", "/registro", "/entrar", "/cuenta", "/mi-pc", "/inicio", "/wallet", "/amigos", "/noticias", "/misiones", "/privacidad", "/terminos"]);
const CLICKS = new Set(["descargar-portada", "ver-como-funciona", "comparar-planes", "descargar", "interes-pro", "interes-tienda", "pedir-cotizacion"]);
const today = () => Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""));
const dayAgo = (days: number) => Number(new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""));

/// Suma una visita o un clic al contador del día. No guarda IP, cookies ni nada de la persona.
app.post("/api/track", async (req, res) => {
  limit(req, 240, 300);
  const kind = req.body?.kind === "click" ? "click" : "view";
  const label = text(req.body?.label, 60);
  const robot = /bot|crawl|spider|preview|headless|monitor/i.test(req.get("user-agent") ?? "");
  if (!robot && (kind === "view" ? PAGES : CLICKS).has(label)) {
    const source = text(req.body?.source, 60).toLowerCase().replace(/[^a-z0-9.-]/g, "") || "directo";
    await pool.query(`INSERT INTO metrics (day, kind, label, source, total) VALUES (?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE total = total + 1`, [today(), kind, label, source]);
  }
  res.status(204).end();
});

const MESSAGE_KINDS = new Set(["ayuda", "error", "sugerencia", "empresa"]);

/// Formulario de soporte y de cotización para negocios.
app.post("/api/contact", async (req, res) => {
  limit(req, 8, 600);
  const body = req.body ?? {};
  // Campo trampa: las personas no lo ven; si llega relleno, es un robot y se descarta sin avisar.
  if (text(body.website, 200)) return res.json({ ok: true });
  const { email } = credentials(body);
  const kind = text(body.kind, 12);
  const name = text(body.name, 80);
  const message = text(body.message, 4000);
  if (!MESSAGE_KINDS.has(kind)) throw new Problem(400, "Elige de qué se trata tu mensaje.");
  if (name.length < 2) throw new Problem(400, "Escribe tu nombre.");
  if (message.length < 10) throw new Problem(400, "Cuéntanos un poco más para poder ayudarte.");
  const business = kind === "empresa" ? text(body.business, 120) : "";
  if (kind === "empresa" && business.length < 2) throw new Problem(400, "Escribe el nombre de tu negocio.");
  await pool.query(`INSERT INTO messages (kind, name, email, business, seats, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [kind, name, email, business || null, kind === "empresa" ? whole(body.seats, 100_000) : null, message, now()]);
  res.json({ ok: true });
});

/// El recorrido completo de los últimos días: de la visita a abrir el programa.
app.get("/api/admin/funnel", async (req, res) => {
  await requireAdmin(req);
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const fromDay = dayAgo(days - 1);
  const fromSeconds = now() - days * 86400;
  const n = (value: unknown) => Number(value ?? 0);
  const rows = async (query: string, params: unknown[]) => ((await pool.query(query, params)) as unknown as [Record<string, unknown>[]])[0];
  const pages = await rows(`SELECT label, SUM(total) AS total FROM metrics WHERE kind = 'view' AND day >= ? GROUP BY label ORDER BY total DESC`, [fromDay]);
  const sources = await rows(`SELECT source, SUM(total) AS total FROM metrics WHERE kind = 'view' AND day >= ? GROUP BY source ORDER BY total DESC LIMIT 12`, [fromDay]);
  const clicks = await rows(`SELECT label, SUM(total) AS total FROM metrics WHERE kind = 'click' AND day >= ? GROUP BY label ORDER BY total DESC`, [fromDay]);
  const [counts] = await rows(
    `SELECT (SELECT COUNT(*) FROM users WHERE created_at > ?) AS accounts,
            (SELECT COUNT(*) FROM downloads WHERE created_at > ?) AS downloads,
            (SELECT COUNT(*) FROM users WHERE app_version IS NOT NULL AND last_seen_at > ?) AS opened`,
    [fromSeconds, fromSeconds, fromSeconds],
  );
  const clicksOf = (label: string) => n(clicks.find((c) => c.label === label)?.total);
  res.json({
    days,
    steps: [
      { label: "Visitas a la web", total: pages.reduce((sum, p) => sum + n(p.total), 0) },
      { label: "Clics en descargar", total: clicksOf("descargar-portada") + clicksOf("descargar") },
      { label: "Cuentas creadas", total: n(counts.accounts) },
      { label: "Descargas del instalador", total: n(counts.downloads) },
      { label: "Abrieron el programa", total: n(counts.opened) },
    ],
    pages: pages.map((p) => ({ label: String(p.label), total: n(p.total) })),
    sources: sources.map((s) => ({ label: String(s.source), total: n(s.total) })),
    clicks: clicks.map((c) => ({ label: String(c.label), total: n(c.total) })),
  });
});

/// Sube un avatar a la galería. La imagen llega ya recortada y reducida desde el panel.
app.post("/api/admin/avatars", async (req, res) => {
  await requireAdmin(req);
  const name = text(req.body?.name, 60) || "Avatar";
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.image ?? ""));
  if (!match) throw new Problem(400, "La imagen tiene que ser PNG, JPG o WebP.");
  const image = Buffer.from(match[2], "base64");
  if (image.length < 100 || image.length > 400_000) throw new Problem(400, "La imagen pesa demasiado. Súbela más pequeña.");
  const [count] = ((await pool.query(`SELECT COUNT(*) AS total FROM avatars`)) as unknown as [{ total: number }[]])[0];
  if (Number(count.total) >= 300) throw new Problem(400, "La galería admite hasta 300 avatares. Borra alguno para subir más.");
  const [result] = (await pool.query(`INSERT INTO avatars (name, mime, image, created_at) VALUES (?, ?, ?, ?)`, [name, match[1], image, now()])) as unknown as [{ insertId: number }];
  res.json({ avatar: { id: result.insertId, name, createdAt: now() } });
});

app.delete("/api/admin/avatars/:id", async (req, res) => {
  await requireAdmin(req);
  const id = Number(req.params.id) || 0;
  await pool.query(`DELETE FROM avatars WHERE id = ?`, [id]);
  await pool.query(`DELETE FROM user_avatar WHERE avatar_id = ?`, [id]);
  res.json({ ok: true });
});

app.get("/api/admin/messages", async (req, res) => {
  await requireAdmin(req);
  const [list] = await pool.query(`SELECT id, kind, name, email, business, seats, body, created_at AS createdAt FROM messages ORDER BY created_at DESC, id DESC LIMIT 300`);
  res.json({ messages: list });
});

app.delete("/api/admin/messages/:id", async (req, res) => {
  await requireAdmin(req);
  await pool.query(`DELETE FROM messages WHERE id = ?`, [Number(req.params.id) || 0]);
  res.json({ ok: true });
});

registerSocial(app, { requireUser, limit, problem: (status, message) => new Problem(status, message), text });
registerWallet(app, { requireUser, requireAdmin, limit, problem: (status, message) => new Problem(status, message), text });
registerFeed(app);
registerLive(app, { requireUser });
registerMissions(app, { requireUser, requireAdmin, limit, problem: (status, message) => new Problem(status, message), text });
registerMedia(app, { requireAdmin, problem: (status, message) => new Problem(status, message) });
registerAds(app, { requireAdmin, limit, problem: (status, message) => new Problem(status, message), text });
registerRemote(app, { requireUser, limit, problem: (status, message) => new Problem(status, message), text });
registerSaves(app, { requireUser, limit, problem: (status, message) => new Problem(status, message), text });
console.log(`Guardado en la nube (R2): ${savesEnabled ? "activo" : "apagado, faltan las variables R2_*"}`);

app.get("/api/config", (_req, res) => {
  const community = process.env.COMMUNITY_URL?.trim() ?? "";
  res.json({ contactEmail: process.env.CONTACT_EMAIL?.trim() || null, communityUrl: /^https:\/\//.test(community) ? community : null });
});

app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1");
  // "live" son las conexiones de avisos al instante abiertas ahora: más o menos, programas y webs en uso.
  res.json({ ok: true, live: liveCount() });
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
  // Lo enviado pesa más de lo que se admite: casi siempre, una imagen sin reducir.
  if ((error as { type?: string } | null)?.type === "entity.too.large") return res.status(413).json({ error: "La imagen pesa demasiado. Súbela más pequeña." });
  console.error(error);
  res.status(500).json({ error: "Algo falló en el servidor. Inténtalo de nuevo." });
});

await createTables();
app.listen(PORT, () => console.log(`Red Level web escuchando en el puerto ${PORT}`));
