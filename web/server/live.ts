// Avisos al instante. El programa y la web dejan una conexión abierta con el servidor, y por ella se les dice
// "tienes un mensaje", "cambió algo de tus amigos" o "hay una orden para tu PC" en cuanto pasa. Con el aviso,
// cada uno pide lo nuevo como siempre: por aquí no viaja ningún dato, solo el toque.
//
// Así los mensajes llegan en décimas de segundo, y nadie tiene que preguntar cada pocos segundos si hay algo:
// con la conexión abierta, el programa pregunta una vez cada medio minuto en vez de cada cuatro segundos.
//
// Las conexiones viven en la memoria de este servidor. Mientras la web corra en una sola máquina, vale tal cual;
// el día que haga falta repartirla entre varias, los avisos tendrán que pasar por un canal común (Redis).

import type { Express, Request, Response } from "express";
import type { User } from "./auth";

export type Topic = "chat" | "social" | "remote" | "wallet" | "missions" | "look";

interface Line {
  res: Response;
  /// "pc" si es el programa de Windows; "web" si es la web o la app del teléfono.
  device: "pc" | "web";
}

const lines = new Map<number, Set<Line>>();
/// Una cuenta abierta en muchos sitios a la vez no puede acaparar conexiones.
const MAX_PER_USER = 8;
/// Cuánto se espera, al cortarse la última conexión de alguien, antes de darlo por desconectado
/// (las conexiones se cortan y se reabren solas cada pocos minutos).
const GONE_AFTER_MS = 12_000;

let whenGone: (userId: number) => void = () => {};
/// Lo que hay que hacer cuando alguien cierra todo: lo usa la parte social para avisar a sus amigos.
export const onGone = (handler: (userId: number) => void) => (whenGone = handler);

/// Avisa a todas las ventanas abiertas de esa cuenta.
export function poke(userId: number, topic: Topic) {
  const open = lines.get(userId);
  if (!open) return;
  for (const line of open) line.res.write(`data: ${topic}\n\n`);
}

/// Avisa a todo el que esté conectado (por ejemplo, de que hay una misión nueva).
export function pokeAll(topic: Topic) {
  for (const open of lines.values()) for (const line of open) line.res.write(`data: ${topic}\n\n`);
}

/// ¿Tiene esa cuenta el programa de Windows abierto y conectado ahora mismo?
export const pcConnected = (userId: number) => [...(lines.get(userId) ?? [])].some((line) => line.device === "pc");
export const isConnected = (userId: number) => lines.has(userId);
export const liveCount = () => [...lines.values()].reduce((total, open) => total + open.size, 0);

export function registerLive(app: Express, { requireUser }: { requireUser: (req: Request) => Promise<User> }) {
  app.get("/api/live", async (req, res) => {
    const user = await requireUser(req);
    const open = lines.get(user.id) ?? new Set<Line>();
    lines.set(user.id, open);
    if (open.size >= MAX_PER_USER) {
      const oldest = open.values().next().value as Line;
      open.delete(oldest);
      oldest.res.end();
    }
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Para que ningún intermediario junte los avisos antes de entregarlos.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write("retry: 3000\n\ndata: hello\n\n");

    const line: Line = { res, device: req.query.device === "pc" ? "pc" : "web" };
    open.add(line);
    // Un comentario cada 20 segundos mantiene viva la conexión y deja ver al otro lado que sigue ahí.
    const beat = setInterval(() => res.write(": sigo aquí\n\n"), 20_000);
    req.on("close", () => {
      clearInterval(beat);
      open.delete(line);
      if (open.size > 0) return;
      if (lines.get(user.id) === open) lines.delete(user.id);
      setTimeout(() => {
        if (!lines.has(user.id)) whenGone(user.id);
      }, GONE_AFTER_MS).unref();
    });
  });
}
