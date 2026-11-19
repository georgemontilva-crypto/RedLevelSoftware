// Parte en línea de Red Level: la cuenta, los amigos y el chat. Habla con la web de Red Level.
// La dirección de esa web no va grabada en el programa: se lee de un archivo del repositorio,
// así se puede cambiar de dominio sin que nadie tenga que reinstalar.

import { useCallback, useEffect, useRef, useState } from "react";

const CONFIG_URL = "https://raw.githubusercontent.com/georgemontilva-crypto/RedLevelSoftware/main/servidor.json";
const TOKEN_KEY = "rl_token";
const SERVER_KEY = "rl_servidor";

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento: la sesión dura lo que dure el programa abierto */
  }
};

let memoryToken: string | null = read(TOKEN_KEY);

/// Dirección de la web de Red Level, o null si todavía no se ha publicado ninguna.
export async function findServer(): Promise<string | null> {
  const forced = new URLSearchParams(location.search).get("servidor");
  if (forced) return forced.replace(/\/+$/, "");
  try {
    const response = await fetch(`${CONFIG_URL}?t=${Math.floor(Date.now() / 300_000)}`, { cache: "no-store" });
    const url = String(((await response.json()) as { url?: string }).url ?? "").trim().replace(/\/+$/, "");
    if (/^https:\/\//.test(url)) {
      write(SERVER_KEY, url);
      return url;
    }
    // El archivo existe pero aún no tiene dirección: no hay servidor.
    if (response.ok) return null;
  } catch {
    /* sin conexión: vale la última dirección conocida */
  }
  return read(SERVER_KEY);
}

export class OnlineError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(server: string, method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${server}/api${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(memoryToken ? { Authorization: `Bearer ${memoryToken}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new OnlineError(0, "No hay conexión con Red Level. Revisa tu internet.");
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new OnlineError(response.status, data.error ?? "No se pudo completar. Inténtalo de nuevo.");
  return data as T;
}

export interface Friend {
  id: number;
  name: string;
  online: boolean;
  playing: string | null;
}

export interface ChatMessage {
  id: number;
  fromId: number;
  toId: number;
  kind: "text" | "invite";
  body: string;
  game: string | null;
  createdAt: number;
}

interface Pulse {
  me: { id: number; name: string; code: string };
  friends: Friend[];
  requests: { id: number; name: string }[];
  sent: { id: number; name: string }[];
  messages: ChatMessage[];
  last: number;
}

export interface Social {
  /// "loading" mientras se busca la web; "none" si no hay ninguna publicada; "out" sin sesión; "in" con sesión.
  status: "loading" | "none" | "out" | "in";
  me: Pulse["me"] | null;
  friends: Friend[];
  requests: Pulse["requests"];
  sent: Pulse["sent"];
  /// Mensajes sin leer por amigo.
  unread: Record<number, number>;
  /// Conversaciones ya cargadas, por amigo.
  chats: Record<number, ChatMessage[]>;
  error: string | null;
  signIn: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => void;
  addFriend: (target: string) => Promise<string>;
  accept: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  openChat: (id: number | null) => Promise<void>;
  send: (to: number, body: string) => Promise<void>;
  invite: (to: number, game: string) => Promise<void>;
}

interface Events {
  onMessage: (from: Friend | { id: number; name: string }, message: ChatMessage) => void;
  onRequest: (from: { id: number; name: string }) => void;
}

/// Mantiene la sesión, el latido (cada 4 segundos) y las conversaciones. `playing` es el juego abierto ahora.
export function useSocial(playing: string | null, events: Events): Social {
  const [server, setServer] = useState<string | null | undefined>(undefined);
  const [signed, setSigned] = useState(memoryToken !== null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [unread, setUnread] = useState<Record<number, number>>({});
  const [chats, setChats] = useState<Record<number, ChatMessage[]>>({});
  const [error, setError] = useState<string | null>(null);
  const last = useRef<number | null>(null);
  const open = useRef<number | null>(null);
  const seenRequests = useRef<Set<number> | null>(null);
  const handlers = useRef(events);
  handlers.current = events;
  const playingNow = useRef(playing);
  playingNow.current = playing;

  useEffect(() => {
    findServer().then(setServer);
  }, []);

  const beat = useCallback(async () => {
    if (!server || !memoryToken) return;
    try {
      const data = await request<Pulse>(server, "POST", "/social/pulse", { playing: playingNow.current, after: last.current });
      last.current = data.last;
      setError(null);
      setPulse(data);
      // Solicitudes nuevas desde el último latido (las que ya había al abrir no se anuncian).
      const ids = new Set(data.requests.map((r) => r.id));
      if (seenRequests.current) for (const r of data.requests) if (!seenRequests.current.has(r.id)) handlers.current.onRequest(r);
      seenRequests.current = ids;
      if (data.messages.length > 0) {
        setChats((all) => {
          const next = { ...all };
          for (const message of data.messages) {
            const other = message.fromId === data.me.id ? message.toId : message.fromId;
            if (next[other] && !next[other].some((m) => m.id === message.id)) next[other] = [...next[other], message];
          }
          return next;
        });
        for (const message of data.messages) {
          if (message.fromId === data.me.id) continue;
          const from = data.friends.find((f) => f.id === message.fromId) ?? { id: message.fromId, name: "Un amigo" };
          if (open.current !== message.fromId) setUnread((all) => ({ ...all, [message.fromId]: (all[message.fromId] ?? 0) + 1 }));
          handlers.current.onMessage(from, message);
        }
      }
    } catch (e) {
      if (e instanceof OnlineError && e.status === 401) {
        memoryToken = null;
        write(TOKEN_KEY, null);
        setSigned(false);
        setPulse(null);
      } else {
        setError(e instanceof Error ? e.message : "Sin conexión.");
      }
    }
  }, [server]);

  useEffect(() => {
    if (!server || !signed) return;
    void beat();
    const timer = setInterval(() => void beat(), 4000);
    return () => clearInterval(timer);
  }, [server, signed, beat]);

  // Al empezar o terminar de jugar se avisa enseguida, sin esperar al siguiente latido.
  useEffect(() => {
    if (signed) void beat();
  }, [playing, signed, beat]);

  const need = () => {
    if (!server) throw new OnlineError(0, "Red Level todavía no tiene su web conectada.");
    return server;
  };

  return {
    status: server === undefined ? "loading" : server === null ? "none" : signed ? "in" : "out",
    me: pulse?.me ?? null,
    friends: pulse?.friends ?? [],
    requests: pulse?.requests ?? [],
    sent: pulse?.sent ?? [],
    unread,
    chats,
    error,
    signIn: async (email, password, name) => {
      const data = await request<{ token: string }>(need(), "POST", name ? "/auth/register" : "/auth/login", { email, password, name, client: "app", device: "Red Level para Windows" });
      memoryToken = data.token;
      write(TOKEN_KEY, data.token);
      last.current = null;
      seenRequests.current = null;
      setSigned(true);
    },
    signOut: () => {
      if (server && memoryToken) void request(server, "POST", "/auth/logout").catch(() => {});
      memoryToken = null;
      write(TOKEN_KEY, null);
      setSigned(false);
      setPulse(null);
      setChats({});
      setUnread({});
    },
    addFriend: async (target) => {
      const { state } = await request<{ state: string }>(need(), "POST", "/social/friends", { target });
      await beat();
      return state === "friends" ? "Ya sois amigos." : "Solicitud enviada. Aparecerá en tu lista cuando la acepte.";
    },
    accept: async (id) => {
      await request(need(), "POST", `/social/friends/${id}/accept`);
      await beat();
    },
    remove: async (id) => {
      await request(need(), "DELETE", `/social/friends/${id}`);
      await beat();
    },
    openChat: async (id) => {
      open.current = id;
      if (id === null) return;
      setUnread((all) => ({ ...all, [id]: 0 }));
      const { messages } = await request<{ messages: ChatMessage[] }>(need(), "GET", `/social/messages/${id}`);
      setChats((all) => ({ ...all, [id]: messages }));
    },
    send: async (to, body) => {
      const { message } = await request<{ message: ChatMessage }>(need(), "POST", "/social/messages", { to, body });
      setChats((all) => ({ ...all, [to]: [...(all[to] ?? []).filter((m) => m.id !== message.id), message] }));
    },
    invite: async (to, game) => {
      const { message } = await request<{ message: ChatMessage }>(need(), "POST", "/social/messages", { to, kind: "invite", game });
      setChats((all) => ({ ...all, [to]: [...(all[to] ?? []).filter((m) => m.id !== message.id), message] }));
    },
  };
}
