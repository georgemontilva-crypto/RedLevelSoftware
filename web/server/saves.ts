// Guardado en la nube: una copia de las partidas de cada juego, por usuario, en Cloudflare R2.
// El servidor nunca ve los archivos: firma una dirección de un solo uso y el programa sube o baja
// el .zip directamente contra R2. Aquí se lleva la lista, el tamaño y el límite de cada cuenta.

import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
import type { Express, Request } from "express";
import type { User } from "./auth";
import { now, pool } from "./db";

type Row = Record<string, unknown>;
const rows = async (query: string, params: unknown[] = []) => ((await pool.query(query, params)) as unknown as [Row[]])[0];
const n = (value: unknown) => Number(value ?? 0);
const MB = 1024 * 1024;

const env = process.env;
const bucket = env.R2_BUCKET ?? "";
/// Sin las cuatro variables de R2 el guardado en la nube queda apagado y el programa no lo ofrece.
export const savesEnabled = Boolean(env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && bucket);
/// Tamaño máximo de la copia de un juego y espacio total de cada cuenta.
const MAX_BYTES = (Number(env.CLOUD_SAVE_MAX_MB) || 200) * MB;
const TOTAL_BYTES = (Number(env.CLOUD_SAVE_TOTAL_MB) || 1024) * MB;
/// Las direcciones firmadas valen un cuarto de hora: de sobra para subir o bajar una copia.
const URL_SECONDS = 900;

const client = savesEnabled
  ? new S3Client({
      region: "auto",
      endpoint: env.R2_ENDPOINT,
      forcePathStyle: true,
      // R2 no admite las sumas de comprobación que el SDK añade por defecto a las direcciones firmadas.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID ?? "", secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "" },
    })
  : null;

const hash = (game: string) => createHash("sha256").update(game).digest("hex").slice(0, 32);
const objectKey = (userId: number, game: string) => `saves/${userId}/${hash(game)}.zip`;
const pendingKey = (userId: number, game: string) => `saves/${userId}/${hash(game)}.subiendo.zip`;

async function remove(key: string) {
  await client?.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
}

/// Borra todas las copias de una cuenta: se llama al eliminar la cuenta.
export async function deleteSavesOf(userId: number) {
  const found = await rows(`SELECT game_hash AS hash FROM cloud_saves WHERE user_id = ?`, [userId]);
  for (const row of found) await remove(`saves/${userId}/${String(row.hash)}.zip`);
  await pool.query(`DELETE FROM cloud_saves WHERE user_id = ?`, [userId]);
}

interface Deps {
  requireUser: (req: Request) => Promise<User>;
  limit: (req: Request, max?: number, windowSeconds?: number) => void;
  problem: (status: number, message: string) => Error;
  text: (value: unknown, max: number) => string;
}

export function registerSaves(app: Express, { requireUser, limit, problem, text }: Deps) {
  const s3 = () => {
    if (!client) throw problem(503, "El guardado en la nube todavía no está disponible.");
    return client;
  };
  const gameOf = (req: Request) => {
    const game = text(req.body?.game, 200);
    if (!game) throw problem(400, "Falta el juego.");
    return game;
  };
  const list = async (userId: number) =>
    (await rows(`SELECT game_key AS game, name, size, updated_at AS updatedAt FROM cloud_saves WHERE user_id = ? ORDER BY updated_at DESC`, [userId])).map((r) => ({
      game: String(r.game),
      name: String(r.name),
      size: n(r.size),
      updatedAt: n(r.updatedAt),
    }));

  /// Las copias de la cuenta y cuánto espacio ocupan.
  app.get("/api/saves", async (req, res) => {
    const user = await requireUser(req);
    if (!savesEnabled) return void res.json({ enabled: false, maxBytes: MAX_BYTES, totalBytes: TOTAL_BYTES, usedBytes: 0, saves: [] });
    const saves = await list(user.id);
    res.json({ enabled: true, maxBytes: MAX_BYTES, totalBytes: TOTAL_BYTES, usedBytes: saves.reduce((sum, s) => sum + s.size, 0), saves });
  });

  /// Pide dónde subir la copia de un juego. Se sube aparte de la que ya hubiera: no la pisa hasta confirmarla.
  app.post("/api/saves/upload", async (req, res) => {
    const user = await requireUser(req);
    limit(req, 40, 600);
    const game = gameOf(req);
    const others = (await list(user.id)).filter((s) => s.game !== game).reduce((sum, s) => sum + s.size, 0);
    if (others >= TOTAL_BYTES) throw problem(413, "No te queda espacio en la nube. Borra la copia de algún juego.");
    const url = await getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket, Key: pendingKey(user.id, game) }), { expiresIn: URL_SECONDS });
    res.json({ url, maxBytes: Math.min(MAX_BYTES, TOTAL_BYTES - others) });
  });

  /// Confirma una subida: se comprueba el tamaño real y, si cabe, pasa a ser la copia del juego.
  app.post("/api/saves/done", async (req, res) => {
    const user = await requireUser(req);
    const game = gameOf(req);
    const name = text(req.body?.name, 120) || game;
    const pending = pendingKey(user.id, game);
    const head = await s3()
      .send(new HeadObjectCommand({ Bucket: bucket, Key: pending }))
      .catch(() => null);
    if (!head) throw problem(404, "La copia no llegó a subirse. Inténtalo de nuevo.");
    const size = n(head.ContentLength);
    const others = (await list(user.id)).filter((s) => s.game !== game).reduce((sum, s) => sum + s.size, 0);
    if (size <= 0 || size > MAX_BYTES || others + size > TOTAL_BYTES) {
      await remove(pending);
      throw problem(413, size > MAX_BYTES ? `La copia pesa más de ${MAX_BYTES / MB} MB.` : "No te queda espacio en la nube para esta copia.");
    }
    await s3().send(new CopyObjectCommand({ Bucket: bucket, Key: objectKey(user.id, game), CopySource: `${bucket}/${pending}` }));
    await remove(pending);
    const t = now();
    await pool.query(
      `INSERT INTO cloud_saves (user_id, game_hash, game_key, name, size, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE game_key = VALUES(game_key), name = VALUES(name), size = VALUES(size), updated_at = VALUES(updated_at)`,
      [user.id, hash(game), game, name, size, t],
    );
    res.json({ save: { game, name, size, updatedAt: t } });
  });

  /// Pide de dónde bajar la copia de un juego.
  app.post("/api/saves/download", async (req, res) => {
    const user = await requireUser(req);
    limit(req, 40, 600);
    const game = gameOf(req);
    const [found] = await rows(`SELECT size, updated_at AS updatedAt FROM cloud_saves WHERE user_id = ? AND game_hash = ?`, [user.id, hash(game)]);
    if (!found) throw problem(404, "No hay copia en la nube de este juego.");
    const url = await getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket, Key: objectKey(user.id, game) }), { expiresIn: URL_SECONDS });
    res.json({ url, size: n(found.size), updatedAt: n(found.updatedAt) });
  });

  /// Borra la copia de un juego.
  app.post("/api/saves/delete", async (req, res) => {
    const user = await requireUser(req);
    const game = gameOf(req);
    if (client) await remove(objectKey(user.id, game));
    await pool.query(`DELETE FROM cloud_saves WHERE user_id = ? AND game_hash = ?`, [user.id, hash(game)]);
    res.json({ ok: true });
  });
}
