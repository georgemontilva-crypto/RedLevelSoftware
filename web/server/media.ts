// Archivos del equipo en Cloudflare R2: las imágenes y los vídeos de las misiones y los banners de publicidad.
// El panel los sube aquí tal cual, del tamaño que sean, y el servidor los pasa a R2 sin guardarlos en memoria ni
// en la base de datos. Para enseñarlos se firma una dirección temporal y se manda allí a quien lo pide.
//
// Sin las variables R2_* esto queda apagado: las imágenes van entonces a la base de datos (pequeñas, con tope)
// y los vídeos tienen que estar alojados en otra parte.

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { User } from "./auth";
import { r2, savesEnabled } from "./saves";

export const mediaEnabled = savesEnabled;

const MB = 1024 * 1024;
/// Tope de cordura, no de uso normal: un archivo mayor que esto casi seguro es un error. Se cambia con MEDIA_MAX_MB.
const MAX_BYTES = (Number(process.env.MEDIA_MAX_MB) || 2048) * MB;
/// Lo que se admite y con qué extensión se guarda.
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
/// Las direcciones firmadas valen seis horas: un vídeo largo se puede ver entero, pausas incluidas, con la misma.
const URL_SECONDS = 6 * 3600;

/// ¿Es la clave de un archivo subido por aquí? Lo que llega del panel se comprueba antes de guardarlo.
export const isMediaKey = (value: unknown): value is string => typeof value === "string" && /^media\/\d{6}\/[a-f0-9]{24}\.(png|jpg|webp|mp4|webm|mov)$/.test(value);
export const isVideoKey = (key: string) => /\.(mp4|webm|mov)$/.test(key);

export async function deleteMedia(key: string | null | undefined) {
  if (!key || !isMediaKey(key) || !r2.client) return;
  await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key })).catch(() => {});
}

/// Manda a quien lo pide a la dirección temporal del archivo en R2. El navegador la recuerda una hora.
export async function sendMedia(res: Response, key: string) {
  if (!r2.client) return res.status(503).json({ error: "El almacén de archivos no está configurado." });
  const url = await getSignedUrl(r2.client, new GetObjectCommand({ Bucket: r2.bucket, Key: key }), { expiresIn: URL_SECONDS });
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.redirect(302, url);
}

interface Deps {
  requireAdmin: (req: Request) => Promise<User>;
  problem: (status: number, message: string) => Error;
}

export function registerMedia(app: Express, { requireAdmin, problem }: Deps) {
  /// El panel sube un archivo: el cuerpo de la petición es el archivo tal cual, y su tipo va en la cabecera.
  app.post("/api/admin/media", async (req, res) => {
    await requireAdmin(req);
    if (!r2.client) throw problem(503, "Para subir archivos hace falta conectar Cloudflare R2 (las variables R2_* del servidor).");
    const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    const extension = TYPES[type];
    if (!extension) throw problem(400, "Ese tipo de archivo no vale. Imágenes: PNG, JPG o WebP. Vídeos: MP4, WebM o MOV.");
    const size = Number(req.headers["content-length"]);
    if (!Number.isFinite(size) || size <= 0) throw problem(411, "No se sabe cuánto pesa el archivo. Vuelve a elegirlo.");
    if (size > MAX_BYTES) throw problem(413, `El archivo pesa más de ${Math.round(MAX_BYTES / MB)} MB.`);
    const month = new Date().toISOString().slice(0, 7).replace("-", "");
    const key = `media/${month}/${randomBytes(12).toString("hex")}.${extension}`;
    // El archivo pasa de la petición a R2 según llega: no se guarda entero en la memoria del servidor.
    await r2.client.send(new PutObjectCommand({ Bucket: r2.bucket, Key: key, Body: req, ContentLength: size, ContentType: type }));
    res.json({ key, size });
  });
}
