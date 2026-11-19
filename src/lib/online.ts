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

export interface FeedNews {
  title: string;
  url: string;
  source: string;
  summary: string;
  image: string | null;
  at: number;
}

export interface FeedUpcoming {
  id: number;
  name: string;
  date: string;
  image: string | null;
  url: string;
}

/// Novedades: últimas noticias de videojuegos y próximos lanzamientos, tal como las reúne la web de Red Level.
export async function loadFeed(): Promise<{ news: FeedNews[]; upcoming: FeedUpcoming[] } | null> {
  const server = await findServer();
  if (!server) return null;
  try {
    const response = await fetch(`${server}/api/feed`);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/// Un banner de publicidad de los que se enseñan en Novedades.
export interface Ad {
  id: number;
  name: string;
  link: string;
  image: string;
}

/// Los banners que toca enseñar ahora. Sin web conectada o sin anuncios, una lista vacía.
export async function loadAds(): Promise<{ ads: Ad[]; server: string | null }> {
  const server = await findServer();
  if (!server) return { ads: [], server: null };
  try {
    const response = await fetch(`${server}/api/ads`);
    const data = response.ok ? ((await response.json()) as { ads: { id: number; name: string; link: string }[] }) : { ads: [] };
    return { ads: data.ads.map((ad) => ({ ...ad, image: `${server}/api/ads/${ad.id}/image` })), server };
  } catch {
    return { ads: [], server };
  }
}

/// Cuenta que esos banners se vieron, o que uno se pulsó. Si falla, no pasa nada.
export function countAds(server: string | null, what: "seen" | "click", ids: number[]) {
  if (!server || ids.length === 0) return;
  const url = what === "seen" ? `${server}/api/ads/seen` : `${server}/api/ads/${ids[0]}/click`;
  void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(what === "seen" ? { ids } : {}) }).catch(() => {});
}

/// Avisos al instante: una conexión abierta con la web de Red Level por la que llega "tienes un mensaje",
/// "cambió algo de tus amigos" o "hay una orden para este PC" en cuanto pasa. Devuelve cómo cerrarla.
function openLive(server: string, onTopic: (topic: string) => void, onState: (connected: boolean) => void): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  const run = async () => {
    while (!stopped) {
      controller = new AbortController();
      const current = controller;
      let wait = 3000 + Math.random() * 2000;
      // El servidor manda algo cada 20 segundos: si en 45 no llega nada, la conexión está muerta y se reabre.
      let watchdog = setTimeout(() => current.abort(), 45_000);
      try {
        const response = await fetch(`${server}/api/live?device=pc`, { headers: { Accept: "text/event-stream", ...(memoryToken ? { Authorization: `Bearer ${memoryToken}` } : {}) }, cache: "no-store", signal: current.signal });
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
              if (topic === "hello") onState(true);
              onTopic(topic);
            }
          }
        }
      } catch {
        /* sin conexión o cortada: se reintenta */
      }
      clearTimeout(watchdog);
      onState(false);
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
  /// Para "Mi PC" en la web: lo que se publica de este ordenador.
  remote: () => { enabled: boolean; device: string; running: string | null; games: { id: string; title: string; store: string; cover: string | null; minutes: number; lastPlayed: number | null }[] };
  /// Ejecuta una orden llegada desde el teléfono: abrir o cerrar un juego.
  onRemote: (action: "play" | "close" | "uninstall", game: string) => Promise<string | void>;
}

/// Mantiene la sesión, el latido y las conversaciones. `playing` es el juego abierto ahora.
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

  // Avisos al instante. Con la conexión abierta, lo nuevo llega con su aviso y solo se pregunta de vez en cuando
  // por si acaso; sin ella, se pregunta cada 4 segundos como siempre.
  const [live, setLive] = useState(false);

  // Mi PC desde el teléfono: se publican los juegos de este ordenador, se dice a qué se juega y se recogen las
  // órdenes de abrir, cerrar o desinstalar que haya mandado el dueño de la cuenta desde la web.
  const published = useRef("");
  const remoteDone = useRef<{ id: number; result: string | null }[]>([]);
  const toldRunning = useRef<string | null | undefined>(undefined);
  const remoteBusy = useRef(false);
  const remoteAgain = useRef(false);
  const remoteTick = useCallback(async () => {
    if (!server || !memoryToken) return;
    // Si ya hay una ronda en marcha, se apunta que hace falta otra al terminar: no se pisan ni se pierde el aviso.
    if (remoteBusy.current) {
      remoteAgain.current = true;
      return;
    }
    remoteBusy.current = true;
    try {
      const done = remoteDone.current;
      const info = handlers.current.remote();
      const key = JSON.stringify([info.enabled, info.device, info.games.map((g) => g.id + g.title + (g.cover ?? "") + Math.floor(g.minutes / 30))]);
      if (key !== published.current && info.games.length > 0) {
        await request(server, "POST", "/remote/library", { device: info.device, games: info.games, enabled: info.enabled })
          .then(() => (published.current = key))
          .catch(() => {});
      }
      const sending = done.splice(0);
      const changed = toldRunning.current !== undefined && toldRunning.current !== info.running;
      const data = await request<{ commands: { id: number; action: "play" | "close" | "uninstall"; game: string }[] }>(server, "POST", "/remote/poll", { running: info.running, done: sending, changed }).catch(() => {
        done.unshift(...sending);
        return null;
      });
      if (data) toldRunning.current = info.running;
      for (const command of data?.commands ?? []) {
        // Al terminar cada orden se cuenta enseguida cómo fue, sin esperar a la siguiente ronda.
        const report = (result: string | null) => {
          done.push({ id: command.id, result });
          void remoteTickRef.current();
        };
        if (!info.enabled) {
          report("El control desde el teléfono está apagado en este PC.");
          continue;
        }
        handlers.current
          .onRemote(command.action, command.game)
          .then((note) => report(note ? `ok:${note}` : null))
          .catch((e) => report(e instanceof Error ? e.message : String(e)));
      }
    } finally {
      remoteBusy.current = false;
      if (remoteAgain.current) {
        remoteAgain.current = false;
        void remoteTickRef.current();
      }
    }
  }, [server]);
  const remoteTickRef = useRef(remoteTick);
  remoteTickRef.current = remoteTick;
  useEffect(() => {
    if (!server || !signed) return;
    void remoteTick();
    const timer = setInterval(() => void remoteTick(), live ? 25_000 : 4000);
    return () => clearInterval(timer);
  }, [server, signed, live, remoteTick]);

  const beatBusy = useRef(false);
  const beatAgain = useRef(false);
  const beat = useCallback(async () => {
    if (!server || !memoryToken) return;
    // Dos latidos a la vez traerían los mismos mensajes dos veces: el segundo espera a que acabe el primero.
    if (beatBusy.current) {
      beatAgain.current = true;
      return;
    }
    beatBusy.current = true;
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
    } finally {
      beatBusy.current = false;
      if (beatAgain.current) {
        beatAgain.current = false;
        void beatLater.current();
      }
    }
  }, [server]);
  const beatLater = useRef(beat);
  beatLater.current = beat;

  useEffect(() => {
    if (!server || !signed) return;
    void beat();
    const timer = setInterval(() => void beat(), live ? 30_000 : 4000);
    return () => clearInterval(timer);
  }, [server, signed, live, beat]);

  // Al empezar o terminar de jugar se avisa enseguida, sin esperar al siguiente latido.
  useEffect(() => {
    if (!signed) return;
    void beat();
    void remoteTickRef.current();
  }, [playing, signed, beat]);

  // La conexión de avisos: cada aviso hace pedir en el momento lo que cambió.
  const beatRef = useRef(beat);
  beatRef.current = beat;
  const walletRef = useRef(refreshWallet);
  walletRef.current = refreshWallet;
  useEffect(() => {
    if (!server || !signed) return;
    const close = openLive(
      server,
      (topic) => {
        if (topic === "hello" || topic === "chat" || topic === "social") void beatRef.current();
        if (topic === "hello" || topic === "remote") void remoteTickRef.current();
        if (topic === "wallet") void walletRef.current();
      },
      setLive,
    );
    return () => {
      close();
      setLive(false);
    };
  }, [server, signed]);

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
