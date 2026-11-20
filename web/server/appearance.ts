// Aspecto de la cuenta: el tema de color, la interfaz (aspecto) y el Motion Pack que tiene puesto el usuario.
// Va con la cuenta, así que lo que se elige en el PC se ve igual en el teléfono, y al revés. Al cambiar algo se
// avisa al instante por la conexión de avisos, con el tema "look", para que la otra pantalla se ponga al día sola.

import type { Express, Request } from "express";
import type { User } from "./auth";
import { now, pool } from "./db";
import { poke } from "./live";

type Row = Record<string, unknown>;
const rows = async (q: string, p: unknown[] = []) => ((await pool.query(q, p)) as unknown as [Row[]])[0];

const DEFAULT = { theme: "red-level", look: "clasico", motion: "quieto" };
// Texto corto de id (letras, números y guiones). No se valida contra una lista cerrada para no atar el servidor
// a los temas que existan en cada versión del programa: cada pantalla ya ignora lo que no conoce.
const clean = (value: unknown, fallback: string) => {
  const s = typeof value === "string" ? value.trim() : "";
  return /^[a-z0-9-]{1,40}$/.test(s) ? s : fallback;
};

export async function deleteAppearanceOf(userId: number) {
  await pool.query(`DELETE FROM appearance WHERE user_id = ?`, [userId]).catch(() => {});
}

interface Deps {
  requireUser: (req: Request) => Promise<User>;
  limit: (req: Request, max?: number, windowSeconds?: number) => void;
}

export function registerAppearance(app: Express, { requireUser, limit }: Deps) {
  /// El aspecto que tiene puesto la cuenta (el mismo en el PC y en el teléfono).
  app.get("/api/appearance", async (req, res) => {
    const user = await requireUser(req);
    const [row] = await rows(`SELECT theme, look, motion FROM appearance WHERE user_id = ?`, [user.id]);
    // null cuando la cuenta todavía no ha guardado un aspecto: así el programa sabe que debe mandar el suyo en vez
    // de pisarlo con el de serie.
    res.json({ appearance: row ? { theme: String(row.theme), look: String(row.look), motion: String(row.motion) } : null });
  });

  /// Guardar el aspecto elegido. Lo llama el programa y la web al cambiar el tema, la interfaz o el Motion Pack.
  app.put("/api/appearance", async (req, res) => {
    const user = await requireUser(req);
    limit(req, 60, 300);
    const theme = clean(req.body?.theme, DEFAULT.theme);
    const look = clean(req.body?.look, DEFAULT.look);
    const motion = clean(req.body?.motion, DEFAULT.motion);
    const t = now();
    await pool.query(
      `INSERT INTO appearance (user_id, theme, look, motion, updated_at) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE theme = ?, look = ?, motion = ?, updated_at = ?`,
      [user.id, theme, look, motion, t, theme, look, motion, t],
    );
    poke(user.id, "look");
    res.json({ theme, look, motion });
  });
}
