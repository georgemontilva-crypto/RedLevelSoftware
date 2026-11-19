// Avisos al instante en la web: una sola conexión abierta con el servidor, por la que llega "tienes un mensaje",
// "cambió algo de tus amigos" o "tu PC hizo lo que le pediste" en cuanto pasa. Con el aviso, cada pantalla pide
// lo nuevo como siempre. Si la conexión no se puede abrir, todo sigue funcionando preguntando cada pocos segundos.

import { useEffect, useRef, useState } from "react";

type Handler = (topic: string) => void;
type Watcher = (connected: boolean) => void;

const handlers = new Set<Handler>();
const watchers = new Set<Watcher>();
let connected = false;
let stop: (() => void) | null = null;

function setConnected(next: boolean) {
  if (connected === next) return;
  connected = next;
  for (const watcher of watchers) watcher(next);
}

function open(): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  const run = async () => {
    while (!stopped) {
      controller = new AbortController();
      const current = controller;
      let wait = 3000 + Math.random() * 2000;
      // Si en 45 segundos no llega nada (el servidor manda algo cada 20), la conexión está muerta: se reabre.
      let watchdog = setTimeout(() => current.abort(), 45_000);
      try {
        const response = await fetch("/api/live?device=web", { headers: { Accept: "text/event-stream" }, credentials: "same-origin", cache: "no-store", signal: current.signal });
        if (response.status === 401) wait = 30_000;
        if (!response.ok || !response.body) throw new Error(String(response.status));
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          clearTimeout(watchdog);
          watchdog = setTimeout(() => current.abort(), 45_000);
          buffer += decoder.decode(value, { stream: true });
          let cut: number;
          while ((cut = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            for (const line of block.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const topic = line.slice(6).trim();
              // El saludo confirma que la conexión está abierta: quien escucha se pone al día de lo que pudo perderse.
              if (topic === "hello") setConnected(true);
              for (const handler of [...handlers]) handler(topic);
            }
          }
        }
      } catch {
        /* sin conexión o cortada: se reintenta */
      }
      clearTimeout(watchdog);
      setConnected(false);
      if (stopped) return;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  };
  void run();
  return () => {
    stopped = true;
    controller?.abort();
  };
}

function subscribe(handler: Handler, watcher: Watcher): () => void {
  handlers.add(handler);
  watchers.add(watcher);
  if (!stop) stop = open();
  return () => {
    handlers.delete(handler);
    watchers.delete(watcher);
    if (handlers.size === 0 && stop) {
      stop();
      stop = null;
      connected = false;
    }
  };
}

/// Llama a `refresh` al entrar, cada vez que llega un aviso de alguno de esos temas y, por si acaso, cada cierto
/// tiempo: `slowMs` con los avisos funcionando, `fastMs` si no hay conexión de avisos.
export function useFresh(refresh: () => void, topics: string[], fastMs: number, slowMs = 30_000) {
  const [live, setLive] = useState(connected);
  const latest = useRef(refresh);
  latest.current = refresh;
  const wanted = topics.join(",");
  useEffect(() => {
    const list = wanted.split(",");
    return subscribe((topic) => {
      if (topic === "hello" || list.includes(topic)) latest.current();
    }, setLive);
  }, [wanted]);
  useEffect(() => {
    latest.current();
    const timer = setInterval(() => latest.current(), live ? slowMs : fastMs);
    return () => clearInterval(timer);
  }, [live, fastMs, slowMs]);
}
