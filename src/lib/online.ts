// Parte en línea de Red Level: la cuenta, los amigos y el chat. Habla con la web de Red Level.
// La dirección de esa web no va grabada en el programa: se lee de un archivo del repositorio,
// así se puede cambiar de dominio sin que nadie tenga que reinstalar.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

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
  avatarId: number | null;
}

/// Un avatar de la galería de Red Level.
export interface GalleryAvatar {
  id: number;
  name: string;
}

/// Lo que se cuenta de cada juego si el usuario acepta compartir su biblioteca.
export interface SyncGame {
  id: string;
  title: string;
  store: string;
  minutes: number;
  lastPlayed: number | null;
}

const SEEN_AVATARS_KEY = "rl_avatares_vistos";

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
  me: { id: number; name: string; code: string; avatarId: number | null; consentLibrary: boolean; admin?: boolean };
  friends: Friend[];
  requests: { id: number; name: string }[];
  sent: { id: number; name: string }[];
  messages: ChatMessage[];
  last: number;
}

/// Copia en la nube de las partidas de un juego.
export interface CloudSave {
  game: string;
  name: string;
  size: number;
  updatedAt: number;
}

export interface Cloud {
  /// La web tiene el guardado en la nube activo y hay sesión iniciada.
  enabled: boolean;
  saves: CloudSave[];
  usedBytes: number;
  totalBytes: number;
  /// La copia de ese juego, si la hay.
  of: (game: CloudGame) => CloudSave | null;
  backup: (game: CloudGame) => Promise<CloudSave>;
  /// Devuelve cuántos archivos se han restaurado.
  restore: (game: CloudGame) => Promise<number>;
  remove: (game: CloudGame) => Promise<void>;
}

type CloudGame = { id: string; store: string; title: string };

/// Con qué nombre se guarda la copia de un juego en la cuenta. Los de tienda, por su identificador;
/// los locales, por su título, para que la copia sirva en otro PC aunque el juego esté en otra carpeta.
export function saveKey(game: CloudGame): string {
  if (game.store !== "local") return game.id;
  return `local:${game.title.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim()}`;
}

/// Artículo de Red Level Store, con su precio en RLC.
export interface StoreItem {
  id: string;
  kind: "theme" | "look";
  name: string;
  price: number;
}

/// Wallet de la cuenta: saldo en RLC, lo comprado y los últimos movimientos. Es el mismo en la web.
export interface WalletState {
  balance: number;
  /// Identificadores de lo comprado: "theme:hielo", "look:cristal"…
  owned: string[];
  moves: { amount: number; kind: string; note: string; at: number; balance: number }[];
  /// Catálogo de la tienda con precios; vacío si la web no está conectada.
  items: StoreItem[];
  refresh: () => Promise<void>;
  buy: (item: string) => Promise<void>;
}

const OWNED_KEY = "rl_owned";
/// Lo comprado, tal como se supo la última vez: sirve para pintar el tema al arrancar, antes de preguntar a la web.
function ownedFromLastTime(): string[] {
  try {
    const list = JSON.parse(read(OWNED_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export interface Social {
  cloud: Cloud;
  wallet: WalletState;
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
  /// Dirección de la imagen de un avatar de la galería.
  avatarUrl: (id: number) => string;
  /// Avatares de la galería, del más nuevo al más viejo.
  avatars: GalleryAvatar[];
  /// Cuántos avatares han llegado desde la última vez que el usuario abrió la galería.
  newAvatars: number;
  seeAvatars: () => void;
  /// Solo para el equipo de Red Level: sube una imagen (data URL) a la galería de avatares.
  uploadAvatar: (name: string, image: string) => Promise<void>;
  /// Descarga ese avatar y devuelve su imagen en base64, y avisa a la web de cuál lleva el usuario.
  chooseAvatar: (id: number) => Promise<{ image: string; extension: string }>;
  setConsent: (share: boolean) => Promise<void>;
  signIn: (email: string, password: string, name?: string, share?: boolean) => Promise<void>;
  signOut: () => void;
  addFriend: (target: string) => Promise<string>;
  accept: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  openChat: (id: number | null) => Promise<void>;
  send: (to: number, body: string) => Promise<void>;
  invite: (to: number, game: string) => Promise<void>;
}

interface Events {
  /// Versión del programa y juegos de la biblioteca, para el envío de uso.
  usage: () => { appVersion: string; games: SyncGame[] };
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
  const [avatars, setAvatars] = useState<GalleryAvatar[]>([]);
  const [cloud, setCloud] = useState<{ enabled: boolean; saves: CloudSave[]; usedBytes: number; totalBytes: number }>({ enabled: false, saves: [], usedBytes: 0, totalBytes: 0 });

  const [wallet, setWallet] = useState<Pick<WalletState, "balance" | "owned" | "moves">>(() => ({ balance: 0, owned: ownedFromLastTime(), moves: [] }));
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const takeWallet = useCallback((next: Pick<WalletState, "balance" | "owned" | "moves">) => {
    write(OWNED_KEY, JSON.stringify(next.owned));
    setWallet(next);
  }, []);
  const refreshWallet = useCallback(async () => {
    if (!server || !memoryToken) return;
    await request<Pick<WalletState, "balance" | "owned" | "moves">>(server, "GET", "/wallet")
      .then(takeWallet)
      .catch(() => {});
  }, [server, takeWallet]);
  useEffect(() => {
    if (!server) return;
    request<{ items: StoreItem[] }>(server, "GET", "/store")
      .then(({ items }) => setStoreItems(items))
      .catch(() => {});
  }, [server]);
  useEffect(() => {
    if (signed) void refreshWallet();
  }, [signed, refreshWallet]);

  // Las copias en la nube de la cuenta se leen al entrar.
  const refreshCloud = useCallback(async () => {
    if (!server || !memoryToken) return;
    await request<typeof cloud>(server, "GET", "/saves")
      .then(setCloud)
      .catch(() => {});
  }, [server]);
  useEffect(() => {
    if (signed) void refreshCloud();
    else setCloud({ enabled: false, saves: [], usedBytes: 0, totalBytes: 0 });
  }, [signed, refreshCloud]);
  const [seenAvatar, setSeenAvatar] = useState(() => Number(read(SEEN_AVATARS_KEY) ?? -1));

  // La galería de avatares se lee al abrir el programa y cada minuto: los nuevos aparecen sin reiniciar.
  const [avatarTick, setAvatarTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setAvatarTick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!server) return;
    request<{ avatars: GalleryAvatar[] }>(server, "GET", "/avatars")
      .then(({ avatars }) => {
        setAvatars(avatars);
        // La primera vez no hay nada "nuevo": se parte de lo que haya.
        if (read(SEEN_AVATARS_KEY) === null) {
          const top = avatars[0]?.id ?? 0;
          write(SEEN_AVATARS_KEY, String(top));
          setSeenAvatar(top);
        }
      })
      .catch(() => {});
  }, [server, avatarTick]);

  // Uso del programa: al entrar y cada 15 minutos. La biblioteca solo se guarda si el usuario dio permiso.
  const sync = useCallback(async () => {
    if (!server || !memoryToken) return;
    await request(server, "POST", "/app/sync", handlers.current.usage()).catch(() => {});
  }, [server]);
  useEffect(() => {
    if (!server || !signed) return;
    const first = setTimeout(() => void sync(), 8000);
    const timer = setInterval(() => void sync(), 15 * 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [server, signed, sync]);

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
    avatarUrl: (id) => `${server ?? ""}/api/avatars/${id}/image`,
    avatars,
    newAvatars: avatars.filter((a) => a.id > seenAvatar).length,
    uploadAvatar: async (name, image) => {
      await request(need(), "POST", "/admin/avatars", { name, image });
      setAvatarTick((n) => n + 1);
    },
    seeAvatars: () => {
      const top = avatars[0]?.id ?? 0;
      if (top > seenAvatar) {
        write(SEEN_AVATARS_KEY, String(top));
        setSeenAvatar(top);
      }
    },
    chooseAvatar: async (id) => {
      const response = await fetch(`${need()}/api/avatars/${id}/image`).catch(() => null);
      if (!response?.ok) throw new OnlineError(response?.status ?? 0, "No se pudo descargar ese avatar.");
      const blob = await response.blob();
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new OnlineError(0, "No se pudo leer ese avatar."));
        reader.readAsDataURL(blob);
      });
      if (memoryToken) await request(need(), "POST", "/social/avatar", { avatarId: id }).catch(() => {});
      return { image, extension: blob.type.split("/")[1] ?? "png" };
    },
    wallet: {
      ...wallet,
      items: storeItems,
      refresh: refreshWallet,
      buy: async (item) => {
        takeWallet(await request<Pick<WalletState, "balance" | "owned" | "moves">>(need(), "POST", "/store/buy", { item }));
      },
    },
    cloud: {
      ...cloud,
      enabled: cloud.enabled && signed,
      of: (game) => cloud.saves.find((s) => s.game === saveKey(game)) ?? null,
      backup: async (game) => {
        const key = saveKey(game);
        const ticket = await request<{ url: string; maxBytes: number }>(need(), "POST", "/saves/upload", { game: key, name: game.title });
        await api.cloudBackup(game.id, ticket.url, ticket.maxBytes);
        const { save } = await request<{ save: CloudSave }>(need(), "POST", "/saves/done", { game: key, name: game.title });
        await refreshCloud();
        return save;
      },
      restore: async (game) => {
        const ticket = await request<{ url: string }>(need(), "POST", "/saves/download", { game: saveKey(game) });
        return api.cloudRestore(game.id, ticket.url);
      },
      remove: async (game) => {
        await request(need(), "POST", "/saves/delete", { game: saveKey(game) });
        await refreshCloud();
      },
    },
    setConsent: async (share) => {
      await request(need(), "PATCH", "/me", { consentLibrary: share });
      await beat();
      await sync();
    },
    signIn: async (email, password, name, share) => {
      const data = await request<{ token: string }>(need(), "POST", name ? "/auth/register" : "/auth/login", { email, password, name, client: "app", device: "Red Level para Windows" });
      memoryToken = data.token;
      write(TOKEN_KEY, data.token);
      if (name && share) await request(need(), "PATCH", "/me", { consentLibrary: true }).catch(() => {});
      last.current = null;
      seenRequests.current = null;
      setSigned(true);
    },
    signOut: () => {
      if (server && memoryToken) void request(server, "POST", "/auth/logout").catch(() => {});
      memoryToken = null;
      write(TOKEN_KEY, null);
      takeWallet({ balance: 0, owned: [], moves: [] });
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
