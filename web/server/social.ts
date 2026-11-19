// Amigos, presencia y chat entre usuarios del programa.
// El programa llama a /api/social/pulse cada pocos segundos: con eso avisa de que sigue abierto (y a qué se juega)
// y recibe de vuelta amigos, solicitudes y mensajes nuevos.

import type { Express, Request } from "express";
import type { User } from "./auth";
import { now, pool } from "./db";

type Row = Record<string, unknown>;
const rows = async (query: string, params: unknown[] = []) => ((await pool.query(query, params)) as unknown as [Row[]])[0];
const n = (value: unknown) => Number(value ?? 0);

/// Quien abrió el programa en el último minuto y medio cuenta como conectado.
const ONLINE_SECONDS = 90;

/// Código para que te añadan sin dar tu correo: "RL-" y tu número en letras y cifras.
export const friendCode = (id: number) => `RL-${(id * 7919 + 100_003).toString(36).toUpperCase()}`;
const idFromCode = (code: string) => {
  const value = parseInt(code.replace(/^RL-/i, ""), 36);
  const id = (value - 100_003) / 7919;
  return Number.isInteger(id) && id > 0 ? id : null;
};

interface Deps {
  requireUser: (req: Request) => Promise<User>;
  limit: (req: Request, max?: number, windowSeconds?: number) => void;
  problem: (status: number, message: string) => Error;
  text: (value: unknown, max: number) => string;
}

async function friendshipBetween(a: number, b: number) {
  const [found] = await rows(`SELECT id, user_a AS userA, user_b AS userB, status FROM friendships WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?) LIMIT 1`, [a, b, b, a]);
  return found ? { id: n(found.id), userA: n(found.userA), userB: n(found.userB), status: String(found.status) } : null;
}

export function registerSocial(app: Express, { requireUser, limit, problem, text }: Deps) {
  /// Latido del programa: actualiza la presencia y devuelve el estado social y los mensajes nuevos.
  app.post("/api/social/pulse", async (req, res) => {
    const user = await requireUser(req);
    const t = now();
    const playing = text(req.body?.playing, 190) || null;
    await pool.query(`INSERT INTO presence (user_id, online_at, playing) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE online_at = VALUES(online_at), playing = VALUES(playing)`, [user.id, t, playing]);

    const links = await rows(
      `SELECT f.id, f.status, f.user_a AS userA, u.id AS otherId, u.name, p.online_at AS onlineAt, p.playing
       FROM friendships f
       JOIN users u ON u.id = IF(f.user_a = ?, f.user_b, f.user_a)
       LEFT JOIN presence p ON p.user_id = u.id
       WHERE f.user_a = ? OR f.user_b = ?
       ORDER BY u.name`,
      [user.id, user.id, user.id],
    );
    const friends = [];
    const requests = [];
    const sent = [];
    for (const link of links) {
      const online = n(link.onlineAt) > t - ONLINE_SECONDS;
      const person = { id: n(link.otherId), name: String(link.name) };
      if (link.status === "accepted") friends.push({ ...person, online, playing: online && link.playing ? String(link.playing) : null });
      else if (n(link.userA) === user.id) sent.push(person);
      else requests.push(person);
    }

    // Sin "after" es el primer latido: no se mandan mensajes antiguos, solo se dice por dónde va la cuenta.
    // Con "after" (aunque sea 0, cuando todavía no hay ningún mensaje) llegan los posteriores.
    const starting = req.body?.after === undefined || req.body?.after === null;
    const after = Math.max(0, Math.floor(Number(req.body?.after) || 0));
    const [top] = await rows(`SELECT COALESCE(MAX(id), 0) AS last FROM chat_messages WHERE to_id = ? OR from_id = ?`, [user.id, user.id]);
    const fresh = starting ? [] : await rows(`SELECT id, from_id AS fromId, to_id AS toId, kind, body, game, created_at AS createdAt FROM chat_messages WHERE id > ? AND (to_id = ? OR from_id = ?) ORDER BY id LIMIT 200`, [after, user.id, user.id]);
    res.json({ me: { id: user.id, name: user.name, code: friendCode(user.id) }, friends, requests, sent, messages: fresh, last: Math.max(n(top?.last), after) });
  });

  /// Pide amistad a alguien por su correo o por su código de amigo.
  app.post("/api/social/friends", async (req, res) => {
    limit(req, 20, 600);
    const user = await requireUser(req);
    const target = text(req.body?.target, 190);
    const byCode = /^RL-/i.test(target) ? idFromCode(target) : null;
    const [other] = byCode ? await rows(`SELECT id, name FROM users WHERE id = ?`, [byCode]) : await rows(`SELECT id, name FROM users WHERE email = ?`, [target.toLowerCase()]);
    // El mismo mensaje exista o no: así no se puede averiguar qué correos tienen cuenta.
    if (!other || n(other.id) === user.id) return res.json({ ok: true, state: "sent" });
    const existing = await friendshipBetween(user.id, n(other.id));
    if (existing?.status === "accepted") return res.json({ ok: true, state: "friends" });
    if (existing && existing.userB === user.id) {
      // Esa persona ya te lo había pedido a ti: quedáis como amigos.
      await pool.query(`UPDATE friendships SET status = 'accepted' WHERE id = ?`, [existing.id]);
      return res.json({ ok: true, state: "friends" });
    }
    if (!existing) await pool.query(`INSERT INTO friendships (user_a, user_b, status, created_at) VALUES (?, ?, 'pending', ?)`, [user.id, n(other.id), now()]);
    res.json({ ok: true, state: "sent" });
  });

  /// Acepta la solicitud que te envió esa persona.
  app.post("/api/social/friends/:id/accept", async (req, res) => {
    const user = await requireUser(req);
    const link = await friendshipBetween(user.id, Number(req.params.id) || 0);
    if (!link || link.userB !== user.id || link.status !== "pending") throw problem(404, "Esa solicitud ya no existe.");
    await pool.query(`UPDATE friendships SET status = 'accepted' WHERE id = ?`, [link.id]);
    res.json({ ok: true });
  });

  /// Rechaza una solicitud, cancela la tuya o deja de ser amigo de esa persona.
  app.delete("/api/social/friends/:id", async (req, res) => {
    const user = await requireUser(req);
    const link = await friendshipBetween(user.id, Number(req.params.id) || 0);
    if (link) await pool.query(`DELETE FROM friendships WHERE id = ?`, [link.id]);
    res.json({ ok: true });
  });

  /// Los últimos mensajes con un amigo, del más viejo al más nuevo.
  app.get("/api/social/messages/:id", async (req, res) => {
    const user = await requireUser(req);
    const other = Number(req.params.id) || 0;
    const list = await rows(
      `SELECT id, from_id AS fromId, to_id AS toId, kind, body, game, created_at AS createdAt FROM chat_messages
       WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id DESC LIMIT 80`,
      [user.id, other, other, user.id],
    );
    res.json({ messages: list.reverse() });
  });

  /// Envía un mensaje o una invitación a jugar a un amigo.
  app.post("/api/social/messages", async (req, res) => {
    limit(req, 90, 60);
    const user = await requireUser(req);
    const to = Number(req.body?.to) || 0;
    const kind = req.body?.kind === "invite" ? "invite" : "text";
    const game = kind === "invite" ? text(req.body?.game, 190) : "";
    const body = kind === "invite" ? `Te invita a jugar a ${game}` : text(req.body?.body, 1000);
    if (kind === "invite" && !game) throw problem(400, "Elige a qué juego quieres invitar.");
    if (!body) throw problem(400, "Escribe un mensaje.");
    const link = await friendshipBetween(user.id, to);
    if (link?.status !== "accepted") throw problem(403, "Solo puedes escribir a tus amigos.");
    const t = now();
    const [result] = (await pool.query(`INSERT INTO chat_messages (from_id, to_id, kind, body, game, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [user.id, to, kind, body, game || null, t])) as unknown as [{ insertId: number }];
    res.json({ message: { id: result.insertId, fromId: user.id, toId: to, kind, body, game: game || null, createdAt: t } });
  });
}
