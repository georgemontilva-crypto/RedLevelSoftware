// Mi PC desde el teléfono: la web enseña los juegos del ordenador y manda abrir o cerrar uno.
// El programa publica su biblioteca y pregunta cada pocos segundos si hay órdenes para él; solo valen
// las de la misma cuenta, para juegos que el propio programa publicó, y caducan si no se recogen enseguida.

import type { Express, Request } from "express";
import type { User } from "./auth";
import { now, pool } from "./db";

type Row = Record<string, unknown>;
const rows = async (query: string, params: unknown[] = []) => ((await pool.query(query, params)) as unknown as [Row[]])[0];
const n = (value: unknown) => Number(value ?? 0);

/// El programa pregunta cada 4 segundos: si lleva 15 sin hacerlo, el PC se da por desconectado.
const ONLINE_SECONDS = 15;
/// Una orden que el PC no recoge en este tiempo ya no se ejecuta.
const COMMAND_SECONDS = 45;

interface RemoteGame {
  id: string;
  title: string;
  store: string;
  cover: string | null;
  minutes: number;
  lastPlayed: number | null;
}

export async function deleteRemoteOf(userId: number) {
  await pool.query(`DELETE FROM remote_pcs WHERE user_id = ?`, [userId]);
  await pool.query(`DELETE FROM remote_commands WHERE user_id = ?`, [userId]);
}

interface Deps {
  requireUser: (req: Request) => Promise<User>;
  limit: (req: Request, max?: number, windowSeconds?: number) => void;
  problem: (status: number, message: string) => Error;
  text: (value: unknown, max: number) => string;
}

export function registerRemote(app: Express, { requireUser, limit, problem, text }: Deps) {
  const gamesOf = (raw: unknown): RemoteGame[] => {
    try {
      const list = JSON.parse(String(raw ?? "[]"));
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  };

  /// El programa publica los juegos del PC (y si el dueño permite manejarlo desde el teléfono).
  app.post("/api/remote/library", async (req, res) => {
    const user = await requireUser(req);
    const list: unknown[] = Array.isArray(req.body?.games) ? req.body.games.slice(0, 800) : [];
    const games: RemoteGame[] = list
      .map((raw) => raw as Record<string, unknown>)
      .map((g) => ({ id: text(g?.id, 190), title: text(g?.title, 160), store: text(g?.store, 20), cover: /^https:\/\//.test(String(g?.cover ?? "")) ? String(g.cover).slice(0, 400) : null, minutes: Math.max(0, Math.trunc(n(g?.minutes))), lastPlayed: n(g?.lastPlayed) || null }))
      .filter((g) => g.id && g.title);
    await pool.query(
      `INSERT INTO remote_pcs (user_id, device, games, enabled, updated_at) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE device = VALUES(device), games = VALUES(games), enabled = VALUES(enabled), updated_at = VALUES(updated_at)`,
      [user.id, text(req.body?.device, 80) || "Mi PC", JSON.stringify(games), req.body?.enabled === false ? 0 : 1, now()],
    );
    res.json({ ok: true, games: games.length });
  });

  /// Latido del programa: dice a qué se juega, da por hechas las órdenes que ejecutó y recoge las nuevas.
  app.post("/api/remote/poll", async (req, res) => {
    const user = await requireUser(req);
    const t = now();
    await pool.query(`UPDATE remote_pcs SET running_id = ?, updated_at = ? WHERE user_id = ?`, [text(req.body?.running, 190) || null, t, user.id]);
    const done: unknown[] = Array.isArray(req.body?.done) ? req.body.done.slice(0, 20) : [];
    for (const raw of done) {
      const item = raw as Record<string, unknown>;
      await pool.query(`UPDATE remote_commands SET done_at = ?, result = ? WHERE id = ? AND user_id = ?`, [t, text(item?.result, 160) || null, n(item?.id), user.id]);
    }
    const pending = await rows(`SELECT id, action, game_id AS game FROM remote_commands WHERE user_id = ? AND taken_at IS NULL AND created_at > ? ORDER BY id`, [user.id, t - COMMAND_SECONDS]);
    if (pending.length > 0) await pool.query(`UPDATE remote_commands SET taken_at = ? WHERE user_id = ? AND taken_at IS NULL`, [t, user.id]);
    res.json({ commands: pending.map((c) => ({ id: n(c.id), action: String(c.action), game: String(c.game) })) });
  });

  /// Lo que ve el teléfono: si el PC está conectado, a qué se juega, los juegos y qué pasó con la última orden.
  app.get("/api/remote", async (req, res) => {
    const user = await requireUser(req);
    const t = now();
    const [pc] = await rows(`SELECT device, games, enabled, running_id AS running, updated_at AS updatedAt FROM remote_pcs WHERE user_id = ?`, [user.id]);
    const [last] = await rows(`SELECT id, action, game_id AS game, created_at AS createdAt, taken_at AS takenAt, done_at AS doneAt, result FROM remote_commands WHERE user_id = ? ORDER BY id DESC LIMIT 1`, [user.id]);
    const games = pc ? gamesOf(pc.games) : [];
    const online = Boolean(pc) && t - n(pc.updatedAt) <= ONLINE_SECONDS;
    res.json({
      pc: pc ? { device: String(pc.device), online, enabled: n(pc.enabled) === 1, running: online && pc.running ? String(pc.running) : null, games } : null,
      last: last
        ? {
            id: n(last.id),
            action: String(last.action),
            game: String(last.game),
            // Un resultado que empieza por "ok:" es un aviso de que salió bien (por ejemplo, qué falta confirmar en el PC).
            state: last.doneAt ? (last.result && !String(last.result).startsWith("ok:") ? "error" : "done") : last.takenAt ? "running" : t - n(last.createdAt) > COMMAND_SECONDS ? "expired" : "pending",
            result: last.result ? String(last.result).replace(/^ok:/, "") : null,
          }
        : null,
    });
  });

  /// El teléfono manda abrir o cerrar un juego.
  app.post("/api/remote/command", async (req, res) => {
    const user = await requireUser(req);
    limit(req, 30, 300);
    const action = text(req.body?.action, 12);
    const game = text(req.body?.game, 190);
    if (action !== "play" && action !== "close" && action !== "uninstall") throw problem(400, "Esa orden no existe.");
    const [pc] = await rows(`SELECT games, enabled, updated_at AS updatedAt FROM remote_pcs WHERE user_id = ?`, [user.id]);
    if (!pc || now() - n(pc.updatedAt) > ONLINE_SECONDS) throw problem(409, "Tu PC no está conectado. Abre Red Level en él.");
    if (n(pc.enabled) !== 1) throw problem(403, "El control desde el teléfono está apagado en los ajustes de Red Level de tu PC.");
    if (!gamesOf(pc.games).some((g) => g.id === game)) throw problem(404, "Ese juego no está en tu PC.");
    const [result] = (await pool.query(`INSERT INTO remote_commands (user_id, action, game_id, created_at) VALUES (?, ?, ?, ?)`, [user.id, action, game, now()])) as unknown as [{ insertId: number }];
    res.json({ id: result.insertId });
  });
}
