// Misiones de patrocinantes. Una marca propone algo (jugar un rato a su juego, ver su vídeo) y quien lo cumple
// cobra RLC en su wallet. Las sube el equipo desde /admin; el programa las enseña en su sección Misiones,
// lleva la cuenta del progreso y deja reclamar la recompensa una sola vez.
//
// El progreso lo cuenta el programa, pero el servidor no se fía a ciegas: nunca apunta más segundos de los que
// han pasado de verdad desde el último aviso. Nadie completa una misión de quince minutos en uno.

import { randomBytes } from "node:crypto";
import type { Express, Request } from "express";
import type { User } from "./auth";
import { now, pool } from "./db";
import { poke, pokeAll } from "./live";
import { deleteMedia, isMediaKey, isVideoKey, mediaEnabled, sendMedia } from "./media";
import { move } from "./wallet";

type Row = Record<string, unknown>;
const rows = async (query: string, params: unknown[] = []) => ((await pool.query(query, params)) as unknown as [Row[]])[0];
const n = (value: unknown) => Number(value ?? 0);

const MAX_MISSIONS = 60;
const MAX_BYTES = 700_000;
/// Margen, en segundos, sobre el tiempo real transcurrido entre dos avisos de progreso.
const SLACK = 1;
/// Lo máximo que suma un solo aviso: quien acepta una misión y vuelve al día siguiente no trae un día de ventaja.
const MAX_STEP = 120;

interface Deps {
  requireUser: (req: Request) => Promise<User>;
  requireAdmin: (req: Request) => Promise<User>;
  limit: (req: Request, max?: number, windowSeconds?: number) => void;
  problem: (status: number, message: string) => Error;
  text: (value: unknown, max: number) => string;
}

export async function deleteMissionsOf(userId: number) {
  await pool.query(`DELETE FROM mission_progress WHERE user_id = ?`, [userId]);
}

const httpsOf = (value: string) => (/^https:\/\/[^\s"<>]+$/.test(value) ? value : null);
const endsFrom = (days: unknown) => {
  const count = Math.trunc(Number(days));
  return Number.isFinite(count) && count > 0 ? now() + Math.min(count, 3650) * 86_400 : null;
};

const FIELDS = `m.id, m.sponsor, m.title, m.body, m.kind, m.target, m.goal_seconds AS goalSeconds, m.reward, m.link, m.link_label AS linkLabel, m.active, m.ends_at AS endsAt, m.max_claims AS maxClaims, m.created_at AS createdAt`;

export function registerMissions(app: Express, { requireUser, requireAdmin, limit, problem, text }: Deps) {
  /// Las misiones en marcha, con lo que lleva de cada una quien pregunta, y las que ya reclamó.
  app.get("/api/missions", async (req, res) => {
    const user = await requireUser(req);
    const t = now();
    const list = await rows(
      `SELECT ${FIELDS}, p.seconds, p.started_at AS startedAt, p.claimed_at AS claimedAt,
              (SELECT COUNT(*) FROM mission_progress c WHERE c.mission_id = m.id AND c.claimed_at IS NOT NULL) AS claims
       FROM missions m LEFT JOIN mission_progress p ON p.mission_id = m.id AND p.user_id = ?
       WHERE (m.active = 1 AND (m.ends_at IS NULL OR m.ends_at > ?)) OR p.claimed_at IS NOT NULL
       ORDER BY m.id DESC`,
      [user.id, t],
    );
    res.json({
      missions: list.map((m) => ({
        id: n(m.id),
        sponsor: String(m.sponsor),
        title: String(m.title),
        body: String(m.body),
        kind: String(m.kind),
        // De una misión de jugar, a qué juego; de una de vídeo, dónde está el vídeo.
        game: m.kind === "play" ? String(m.target) : null,
        // Si el vídeo se subió al almacén de Red Level, se pide a este servidor, que manda a su dirección temporal.
        video: m.kind === "video" ? (String(m.target).startsWith("r2:") ? `/api/missions/${n(m.id)}/video` : String(m.target)) : null,
        goalSeconds: n(m.goalSeconds),
        reward: n(m.reward),
        link: m.link ? String(m.link) : null,
        linkLabel: m.linkLabel ? String(m.linkLabel) : null,
        endsAt: m.endsAt === null ? null : n(m.endsAt),
        accepted: m.startedAt !== null && m.startedAt !== undefined,
        seconds: Math.min(n(m.seconds), n(m.goalSeconds)),
        claimed: m.claimedAt !== null && m.claimedAt !== undefined,
        // Recompensas agotadas: el patrocinante puso un tope y ya se repartieron todas.
        soldOut: m.maxClaims !== null && n(m.claims) >= n(m.maxClaims),
      })),
    });
  });

  app.get("/api/missions/:id/image", async (req, res) => {
    const [found] = await rows(`SELECT mime, image FROM missions WHERE id = ?`, [Number(req.params.id) || 0]);
    if (!found) throw problem(404, "Esa misión ya no existe.");
    // Con la imagen en R2, en la columna va su clave en vez de la imagen.
    if (found.mime === "r2") return sendMedia(res, (found.image as Buffer).toString("utf8"));
    res.setHeader("Content-Type", String(found.mime));
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(found.image as Buffer);
  });

  /// El vídeo de una misión subido al almacén de Red Level.
  app.get("/api/missions/:id/video", async (req, res) => {
    const [found] = await rows(`SELECT target FROM missions WHERE id = ? AND kind = 'video'`, [Number(req.params.id) || 0]);
    const key = found ? String(found.target).replace(/^r2:/, "") : "";
    if (!found || !String(found.target).startsWith("r2:") || !isMediaKey(key)) throw problem(404, "Esa misión no tiene vídeo aquí.");
    await sendMedia(res, key);
  });

  const openMission = async (id: number) => {
    const [mission] = await rows(`SELECT id, title, goal_seconds AS goalSeconds, reward, max_claims AS maxClaims FROM missions WHERE id = ? AND active = 1 AND (ends_at IS NULL OR ends_at > ?)`, [id, now()]);
    if (!mission) throw problem(404, "Esa misión ya terminó.");
    return mission;
  };

  /// Aceptar la misión: desde aquí empieza a contar.
  app.post("/api/missions/:id/accept", async (req, res) => {
    const user = await requireUser(req);
    const mission = await openMission(Number(req.params.id) || 0);
    const t = now();
    await pool.query(`INSERT IGNORE INTO mission_progress (user_id, mission_id, seconds, started_at, updated_at) VALUES (?, ?, 0, ?, ?)`, [user.id, n(mission.id), t, t]);
    res.json({ ok: true });
  });

  /// El programa avisa de que se jugó o se vio un rato más. Se apunta, como mucho, el tiempo real que ha pasado.
  app.post("/api/missions/:id/progress", async (req, res) => {
    const user = await requireUser(req);
    limit(req, 240, 300);
    const mission = await openMission(Number(req.params.id) || 0);
    const [progress] = await rows(`SELECT seconds, updated_at AS updatedAt, claimed_at AS claimedAt FROM mission_progress WHERE user_id = ? AND mission_id = ?`, [user.id, n(mission.id)]);
    if (!progress) throw problem(409, "Acepta la misión antes de empezarla.");
    const t = now();
    const asked = Math.max(0, Math.trunc(Number(req.body?.seconds) || 0));
    const real = Math.max(0, t - n(progress.updatedAt)) + SLACK;
    const seconds = Math.min(n(mission.goalSeconds), n(progress.seconds) + Math.min(asked, real, MAX_STEP));
    await pool.query(`UPDATE mission_progress SET seconds = ?, updated_at = ? WHERE user_id = ? AND mission_id = ?`, [seconds, t, user.id, n(mission.id)]);
    res.json({ seconds, done: seconds >= n(mission.goalSeconds) });
  });

  /// Reclamar la recompensa: una vez, con la misión cumplida y mientras queden recompensas.
  app.post("/api/missions/:id/claim", async (req, res) => {
    const user = await requireUser(req);
    limit(req, 30, 300);
    const mission = await openMission(Number(req.params.id) || 0);
    const [progress] = await rows(`SELECT seconds, claimed_at AS claimedAt FROM mission_progress WHERE user_id = ? AND mission_id = ?`, [user.id, n(mission.id)]);
    if (!progress || n(progress.seconds) < n(mission.goalSeconds)) throw problem(409, "Todavía no has completado esta misión.");
    if (progress.claimedAt !== null) throw problem(409, "Ya reclamaste esta recompensa.");
    if (mission.maxClaims !== null) {
      const [count] = await rows(`SELECT COUNT(*) AS total FROM mission_progress WHERE mission_id = ? AND claimed_at IS NOT NULL`, [n(mission.id)]);
      if (n(count.total) >= n(mission.maxClaims)) throw problem(409, "Las recompensas de esta misión se agotaron.");
    }
    // Se marca primero como reclamada, con una señal propia, y luego se mira de quién es la señal que quedó:
    // aunque lleguen dos peticiones a la vez, solo una encuentra la suya y solo esa paga.
    const token = randomBytes(9).toString("hex");
    await pool.query(`UPDATE mission_progress SET claimed_at = ?, claim_token = ? WHERE user_id = ? AND mission_id = ? AND claimed_at IS NULL`, [now(), token, user.id, n(mission.id)]).catch(() => {});
    const [after] = await rows(`SELECT claim_token AS token FROM mission_progress WHERE user_id = ? AND mission_id = ?`, [user.id, n(mission.id)]);
    if (!after || after.token !== token) throw problem(409, "Ya reclamaste esta recompensa.");
    const balance = await move(user.id, n(mission.reward), "mision", `Misión: ${String(mission.title)}`.slice(0, 160));
    poke(user.id, "wallet");
    res.json({ reward: n(mission.reward), balance });
  });

  // ── Administración ──

  app.get("/api/admin/missions", async (req, res) => {
    await requireAdmin(req);
    const list = await rows(
      `SELECT ${FIELDS},
              (SELECT COUNT(*) FROM mission_progress p WHERE p.mission_id = m.id) AS accepted,
              (SELECT COUNT(*) FROM mission_progress p WHERE p.mission_id = m.id AND p.seconds >= m.goal_seconds) AS completed,
              (SELECT COUNT(*) FROM mission_progress p WHERE p.mission_id = m.id AND p.claimed_at IS NOT NULL) AS claimed
       FROM missions m ORDER BY m.id DESC`,
    );
    res.json({
      // Con R2 conectado, el panel puede subir vídeos e imágenes del tamaño que sean.
      uploads: mediaEnabled,
      missions: list.map((m) => ({
        id: n(m.id),
        sponsor: String(m.sponsor),
        title: String(m.title),
        kind: String(m.kind),
        target: String(m.target).startsWith("r2:") ? "vídeo subido" : String(m.target),
        goalSeconds: n(m.goalSeconds),
        reward: n(m.reward),
        active: n(m.active) === 1,
        endsAt: m.endsAt === null ? null : n(m.endsAt),
        maxClaims: m.maxClaims === null ? null : n(m.maxClaims),
        accepted: n(m.accepted),
        completed: n(m.completed),
        claimed: n(m.claimed),
      })),
    });
  });

  app.post("/api/admin/missions", async (req, res) => {
    await requireAdmin(req);
    const sponsor = text(req.body?.sponsor, 80);
    const title = text(req.body?.title, 120);
    const body = text(req.body?.body, 400);
    const kind = req.body?.kind === "video" ? "video" : "play";
    // El vídeo puede venir subido al almacén (su clave) o como dirección de otra parte.
    const videoKey = kind === "video" && isMediaKey(req.body?.videoKey) && isVideoKey(req.body.videoKey) ? (req.body.videoKey as string) : null;
    const target = videoKey ? `r2:${videoKey}` : text(req.body?.target, 400);
    const minutes = Number(req.body?.minutes);
    const reward = Math.trunc(Number(req.body?.reward));
    if (!sponsor) throw problem(400, "Pon el nombre del patrocinante.");
    if (!title) throw problem(400, "Pon el título de la misión.");
    if (kind === "play" && !target) throw problem(400, "Indica a qué juego hay que jugar, con el nombre que tiene en la biblioteca.");
    if (kind === "video" && !videoKey && !httpsOf(target)) throw problem(400, mediaEnabled ? "Sube el vídeo o pon una dirección https a un archivo .mp4." : "El vídeo tiene que ser una dirección https a un archivo .mp4 o .webm.");
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 600) throw problem(400, "Indica cuántos minutos hay que jugar o ver (hasta 600).");
    if (!Number.isFinite(reward) || reward < 1 || reward > 100_000) throw problem(400, "La recompensa tiene que estar entre 1 y 100 000 RLC.");
    const rawLink = text(req.body?.link, 400);
    const link = rawLink ? httpsOf(rawLink) : null;
    if (rawLink && !link) throw problem(400, "El enlace tiene que empezar por https://");
    // La imagen, igual: subida al almacén (sin tope de peso) o, sin almacén, dentro de la petición y pequeña.
    const imageKey = isMediaKey(req.body?.imageKey) && !isVideoKey(req.body.imageKey) ? (req.body.imageKey as string) : null;
    let mime = "r2";
    let image = Buffer.from(imageKey ?? "", "utf8");
    if (!imageKey) {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.image ?? ""));
      if (!match) throw problem(400, "La imagen tiene que ser PNG, JPG o WebP.");
      mime = match[1];
      image = Buffer.from(match[2], "base64");
      if (image.length < 100 || image.length > MAX_BYTES) throw problem(400, "La imagen pesa demasiado. Súbela más pequeña.");
    }
    const [count] = await rows(`SELECT COUNT(*) AS total FROM missions`);
    if (n(count.total) >= MAX_MISSIONS) throw problem(400, `Caben hasta ${MAX_MISSIONS} misiones. Borra alguna para subir más.`);
    const maxClaims = Math.trunc(Number(req.body?.maxClaims));
    const t = now();
    const [result] = (await pool.query(
      `INSERT INTO missions (sponsor, title, body, kind, target, goal_seconds, reward, link, link_label, mime, image, active, ends_at, max_claims, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [sponsor, title, body, kind, target, Math.round(minutes * 60), reward, link, link ? text(req.body?.linkLabel, 30) || "Más información" : null, mime, image, endsFrom(req.body?.days), Number.isFinite(maxClaims) && maxClaims > 0 ? maxClaims : null, t],
    )) as unknown as [{ insertId: number }];
    // Quien tenga el programa abierto la ve aparecer sin reiniciar nada.
    pokeAll("missions");
    res.json({ id: result.insertId });
  });

  /// Pausa o reanuda una misión, o le cambia los días que le quedan.
  app.patch("/api/admin/missions/:id", async (req, res) => {
    await requireAdmin(req);
    const id = Number(req.params.id) || 0;
    if (typeof req.body?.active === "boolean") await pool.query(`UPDATE missions SET active = ? WHERE id = ?`, [req.body.active ? 1 : 0, id]);
    if (req.body?.days !== undefined) await pool.query(`UPDATE missions SET ends_at = ? WHERE id = ?`, [endsFrom(req.body.days), id]);
    pokeAll("missions");
    res.json({ ok: true });
  });

  /// Borra una misión con todo su progreso. Lo que ya se cobró, cobrado queda.
  app.delete("/api/admin/missions/:id", async (req, res) => {
    await requireAdmin(req);
    const id = Number(req.params.id) || 0;
    const [gone] = await rows(`SELECT mime, image, target FROM missions WHERE id = ?`, [id]);
    if (gone?.mime === "r2") await deleteMedia((gone.image as Buffer).toString("utf8"));
    if (gone && String(gone.target).startsWith("r2:")) await deleteMedia(String(gone.target).slice(3));
    await pool.query(`DELETE FROM missions WHERE id = ?`, [id]);
    await pool.query(`DELETE FROM mission_progress WHERE mission_id = ?`, [id]);
    pokeAll("missions");
    res.json({ ok: true });
  });
}
