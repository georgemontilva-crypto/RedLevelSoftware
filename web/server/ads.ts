// Publicidad: los banners que se enseñan en Novedades, dentro del programa. Los sube el equipo desde /admin,
// cada uno con su enlace y, si se quiere, con fecha de fin. Se cuenta cuántas veces se ve y se pulsa cada uno,
// que es lo que se le enseña al anunciante. No se guarda nada de quién lo vio.

import type { Express, Request } from "express";
import type { User } from "./auth";
import { now, pool } from "./db";
import { deleteMedia, isMediaKey, isVideoKey, mediaEnabled, sendMedia } from "./media";

type Row = Record<string, unknown>;
const rows = async (query: string, params: unknown[] = []) => ((await pool.query(query, params)) as unknown as [Row[]])[0];
const n = (value: unknown) => Number(value ?? 0);

/// Como mucho, estos banners a la vez (activos o en pausa).
const MAX_ADS = 30;
/// Peso máximo de la imagen de un banner.
const MAX_BYTES = 700_000;

interface Deps {
  requireAdmin: (req: Request) => Promise<User>;
  limit: (req: Request, max?: number, windowSeconds?: number) => void;
  problem: (status: number, message: string) => Error;
  text: (value: unknown, max: number) => string;
}

interface PublicAd {
  id: number;
  name: string;
  link: string;
}

// La lista la piden todos los programas abiertos: se guarda un minuto en memoria para no ir a la base cada vez.
let cached: { at: number; ads: PublicAd[] } | null = null;
const forget = () => (cached = null);

// Las vistas se suman en memoria y se apuntan juntas cada medio minuto: miles de programas abiertos no son
// miles de escrituras.
const seen = new Map<number, number>();
async function flushSeen() {
  const batch = [...seen];
  seen.clear();
  for (const [id, count] of batch) await pool.query(`UPDATE ads SET views = views + ? WHERE id = ?`, [count, id]).catch(() => {});
}
setInterval(() => void flushSeen(), 30_000).unref();

async function activeAds(): Promise<PublicAd[]> {
  const t = now();
  if (cached && t - cached.at < 60) return cached.ads;
  const list = await rows(`SELECT id, name, link FROM ads WHERE active = 1 AND (ends_at IS NULL OR ends_at > ?) ORDER BY id DESC`, [t]);
  cached = { at: t, ads: list.map((ad) => ({ id: n(ad.id), name: String(ad.name), link: String(ad.link) })) };
  return cached.ads;
}

const linkOf = (value: string) => (/^https:\/\/[^\s"<>]+$/.test(value) ? value : null);
/// Días que le quedan a un banner, convertidos en su fecha de fin. Cero o vacío: sin fecha de fin.
const endsFrom = (days: unknown) => {
  const count = Math.trunc(Number(days));
  return Number.isFinite(count) && count > 0 ? now() + Math.min(count, 3650) * 86_400 : null;
};

export function registerAds(app: Express, { requireAdmin, limit, problem, text }: Deps) {
  /// Los banners que toca enseñar ahora.
  app.get("/api/ads", async (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ ads: await activeAds() });
  });

  app.get("/api/ads/:id/image", async (req, res) => {
    const [found] = await rows(`SELECT mime, image FROM ads WHERE id = ?`, [Number(req.params.id) || 0]);
    if (!found) throw problem(404, "Ese anuncio ya no existe.");
    // Con la imagen en R2, en la columna va su clave en vez de la imagen.
    if (found.mime === "r2") return sendMedia(res, (found.image as Buffer).toString("utf8"));
    res.setHeader("Content-Type", String(found.mime));
    res.setHeader("Access-Control-Allow-Origin", "*");
    // La imagen de un banner no cambia (si se cambia, es otro banner): se puede guardar para siempre.
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(found.image as Buffer);
  });

  /// El programa avisa de qué banners enseñó al abrir Novedades.
  app.post("/api/ads/seen", async (req, res) => {
    limit(req, 60, 300);
    const live = new Set((await activeAds()).map((ad) => ad.id));
    const ids: unknown[] = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, MAX_ADS) : [];
    for (const id of new Set(ids.map((raw) => Number(raw)))) if (live.has(id)) seen.set(id, (seen.get(id) ?? 0) + 1);
    res.status(204).end();
  });

  app.post("/api/ads/:id/click", async (req, res) => {
    limit(req, 40, 300);
    await pool.query(`UPDATE ads SET clicks = clicks + 1 WHERE id = ? AND active = 1`, [Number(req.params.id) || 0]);
    res.status(204).end();
  });

  // ── Administración ──

  app.get("/api/admin/ads", async (req, res) => {
    await requireAdmin(req);
    await flushSeen();
    const list = await rows(`SELECT id, name, link, active, ends_at AS endsAt, views, clicks, created_at AS createdAt FROM ads ORDER BY id DESC`);
    res.json({ uploads: mediaEnabled, ads: list.map((ad) => ({ id: n(ad.id), name: String(ad.name), link: String(ad.link), active: n(ad.active) === 1, endsAt: ad.endsAt === null ? null : n(ad.endsAt), views: n(ad.views), clicks: n(ad.clicks), createdAt: n(ad.createdAt) })) });
  });

  app.post("/api/admin/ads", async (req, res) => {
    await requireAdmin(req);
    const name = text(req.body?.name, 80);
    const link = linkOf(text(req.body?.link, 400));
    if (!name) throw problem(400, "Pon el nombre del anunciante.");
    if (!link) throw problem(400, "El enlace tiene que empezar por https://");
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
    const [count] = await rows(`SELECT COUNT(*) AS total FROM ads`);
    if (n(count.total) >= MAX_ADS) throw problem(400, `Caben hasta ${MAX_ADS} banners. Borra alguno para subir más.`);
    const t = now();
    const endsAt = endsFrom(req.body?.days);
    const [result] = (await pool.query(`INSERT INTO ads (name, link, mime, image, active, ends_at, views, clicks, created_at) VALUES (?, ?, ?, ?, 1, ?, 0, 0, ?)`, [name, link, mime, image, endsAt, t])) as unknown as [{ insertId: number }];
    forget();
    res.json({ ad: { id: result.insertId, name, link, active: true, endsAt, views: 0, clicks: 0, createdAt: t } });
  });

  /// Pausa o reanuda un banner, o le cambia los días que le quedan.
  app.patch("/api/admin/ads/:id", async (req, res) => {
    await requireAdmin(req);
    const id = Number(req.params.id) || 0;
    if (typeof req.body?.active === "boolean") await pool.query(`UPDATE ads SET active = ? WHERE id = ?`, [req.body.active ? 1 : 0, id]);
    if (req.body?.days !== undefined) await pool.query(`UPDATE ads SET ends_at = ? WHERE id = ?`, [endsFrom(req.body.days), id]);
    forget();
    res.json({ ok: true });
  });

  app.delete("/api/admin/ads/:id", async (req, res) => {
    await requireAdmin(req);
    const [gone] = await rows(`SELECT mime, image FROM ads WHERE id = ?`, [Number(req.params.id) || 0]);
    if (gone?.mime === "r2") await deleteMedia((gone.image as Buffer).toString("utf8"));
    await pool.query(`DELETE FROM ads WHERE id = ?`, [Number(req.params.id) || 0]);
    forget();
    res.json({ ok: true });
  });
}
