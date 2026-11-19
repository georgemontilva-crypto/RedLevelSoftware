export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: number;
  consentLibrary: boolean;
  admin: boolean;
}

export interface Release {
  version: string;
  size: number;
  publishedAt: string;
  sha256: string | null;
}

export interface Funnel {
  days: number;
  steps: { label: string; total: number }[];
  pages: { label: string; total: number }[];
  sources: { label: string; total: number }[];
  clicks: { label: string; total: number }[];
}

export interface Message {
  id: number;
  kind: string;
  name: string;
  email: string;
  business: string | null;
  seats: number | null;
  body: string;
  createdAt: number;
}

export interface ContactForm {
  kind: string;
  name: string;
  email: string;
  message: string;
  business?: string;
  seats?: number;
  website?: string;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  createdAt: number;
  lastSeenAt: number | null;
  appVersion: string | null;
  consentLibrary: boolean;
  games: number;
  minutes: number;
  downloads: number;
}

export interface AdminStats {
  totals: { users: number; installed: number; activeWeek: number; sharing: number; downloads: number };
  versions: { version: string; users: number }[];
  games: { title: string; store: string; players: number; minutes: number }[];
}

export interface AdminGame {
  title: string;
  store: string;
  minutes: number;
  lastPlayed: number | null;
  achUnlocked: number | null;
  achTotal: number | null;
}

export interface RemoteGame {
  id: string;
  title: string;
  store: string;
  cover: string | null;
  minutes?: number;
  lastPlayed?: number | null;
}

/// Lo que la web sabe del PC del usuario y de la última orden que se le mandó.
export interface RemoteState {
  pc: { device: string; online: boolean; enabled: boolean; running: string | null; games: RemoteGame[] } | null;
  last: { id: number; action: string; game: string; state: "pending" | "running" | "done" | "error" | "expired"; result: string | null } | null;
}

export interface ChatMessage {
  id: number;
  fromId: number;
  toId: number;
  kind: string;
  body: string;
  game: string | null;
  createdAt: number;
}

export interface WebFriend {
  id: number;
  name: string;
  online: boolean;
  playing: string | null;
  avatarId: number | null;
}

/// Latido social: quién eres, tus amigos, las solicitudes y los mensajes nuevos.
export interface Pulse {
  me: { id: number; name: string; code: string; avatarId: number | null };
  friends: WebFriend[];
  requests: { id: number; name: string }[];
  sent: { id: number; name: string }[];
  messages: ChatMessage[];
  last: number;
}

/// Novedades: noticias de videojuegos y próximos lanzamientos.
export interface Feed {
  news: { title: string; url: string; source: string; summary: string; image: string | null; at: number }[];
  upcoming: { id: number; name: string; date: string; image: string | null; url: string }[];
}

export interface StoreItem {
  id: string;
  kind: "theme" | "look";
  name: string;
  about: string;
  /// Precio en RLC.
  price: number;
}

/// Una misión de patrocinante, con lo que se le enseña a la marca: cuántos la aceptaron, la cumplieron y la cobraron.
export interface AdminMission {
  id: number;
  sponsor: string;
  title: string;
  kind: "play" | "video";
  target: string;
  goalSeconds: number;
  reward: number;
  active: boolean;
  endsAt: number | null;
  maxClaims: number | null;
  accepted: number;
  completed: number;
  claimed: number;
}

export interface NewMission {
  sponsor: string;
  title: string;
  body: string;
  kind: "play" | "video";
  target: string;
  minutes: number;
  reward: number;
  link: string;
  linkLabel: string;
  days: number;
  maxClaims: number;
  image: string;
}

/// Un banner de publicidad, con lo que se le enseña al anunciante: cuántas veces se vio y se pulsó.
export interface AdminAd {
  id: number;
  name: string;
  link: string;
  active: boolean;
  endsAt: number | null;
  views: number;
  clicks: number;
  createdAt: number;
}

export interface Wallet {
  balance: number;
  owned: string[];
  moves: { amount: number; kind: string; note: string; at: number; balance: number }[];
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? "No se pudo completar. Inténtalo de nuevo.");
  return data as T;
}

export const api = {
  me: () => request<{ user: User | null }>("GET", "/me"),
  register: (name: string, email: string, password: string, consentLibrary: boolean) => request<{ user: User }>("POST", "/auth/register", { name, email, password, consentLibrary }),
  login: (email: string, password: string) => request<{ user: User }>("POST", "/auth/login", { email, password }),
  logout: () => request<{ ok: true }>("POST", "/auth/logout"),
  update: (changes: { name?: string; consentLibrary?: boolean }) => request<{ user: User }>("PATCH", "/me", changes),
  deleteAccount: () => request<{ ok: true }>("DELETE", "/me"),
  release: () => request<{ release: Release | null; history: { version: string; publishedAt: string }[] }>("GET", "/release"),
  contact: (form: ContactForm) => request<{ ok: true }>("POST", "/contact", form),
  adminFunnel: (days: number) => request<Funnel>("GET", `/admin/funnel?days=${days}`),
  avatars: () => request<{ avatars: { id: number; name: string; createdAt: number }[] }>("GET", "/avatars"),
  adminAddAvatar: (name: string, image: string) => request<{ avatar: { id: number; name: string; createdAt: number } }>("POST", "/admin/avatars", { name, image }),
  adminDeleteAvatar: (id: number) => request<{ ok: true }>("DELETE", `/admin/avatars/${id}`),
  adminMissions: () => request<{ missions: AdminMission[] }>("GET", "/admin/missions"),
  adminAddMission: (mission: NewMission) => request<{ id: number }>("POST", "/admin/missions", mission),
  adminUpdateMission: (id: number, changes: { active?: boolean; days?: number }) => request<{ ok: true }>("PATCH", `/admin/missions/${id}`, changes),
  adminDeleteMission: (id: number) => request<{ ok: true }>("DELETE", `/admin/missions/${id}`),
  adminAds: () => request<{ ads: AdminAd[] }>("GET", "/admin/ads"),
  adminAddAd: (ad: { name: string; link: string; image: string; days: number }) => request<{ ad: AdminAd }>("POST", "/admin/ads", ad),
  adminUpdateAd: (id: number, changes: { active?: boolean; days?: number }) => request<{ ok: true }>("PATCH", `/admin/ads/${id}`, changes),
  adminDeleteAd: (id: number) => request<{ ok: true }>("DELETE", `/admin/ads/${id}`),
  adminMessages: () => request<{ messages: Message[] }>("GET", "/admin/messages"),
  adminDeleteMessage: (id: number) => request<{ ok: true }>("DELETE", `/admin/messages/${id}`),
  download: () => request<{ url: string; version: string }>("POST", "/download"),
  config: () => request<{ contactEmail: string | null; communityUrl: string | null }>("GET", "/config"),
  feed: () => request<Feed>("GET", "/feed"),
  // A qué se juega solo lo dice el programa del PC: la web no manda ese dato para no pisarlo.
  pulse: (after: number | null) => request<Pulse>("POST", "/social/pulse", after === null ? {} : { after }),
  addFriend: (target: string) => request<{ state: string }>("POST", "/social/friends", { target }),
  acceptFriend: (id: number) => request<{ ok: true }>("POST", `/social/friends/${id}/accept`),
  removeFriend: (id: number) => request<{ ok: true }>("DELETE", `/social/friends/${id}`),
  chat: (id: number) => request<{ messages: ChatMessage[] }>("GET", `/social/messages/${id}`),
  sendChat: (to: number, body: string) => request<{ message: ChatMessage }>("POST", "/social/messages", { to, body }),
  remote: () => request<RemoteState>("GET", "/remote"),
  remoteCommand: (action: "play" | "close" | "uninstall", game: string) => request<{ id: number }>("POST", "/remote/command", { action, game }),
  store: () => request<{ items: StoreItem[]; rlcPerUsd: number }>("GET", "/store"),
  wallet: () => request<Wallet>("GET", "/wallet"),
  buy: (item: string) => request<Wallet>("POST", "/store/buy", { item }),
  adminGiveRlc: (email: string, amount: number, note: string) => request<{ name: string; balance: number }>("POST", "/admin/wallet", { email, amount, note }),
  adminStats: () => request<AdminStats>("GET", "/admin/stats"),
  adminUsers: () => request<{ users: AdminUser[] }>("GET", "/admin/users"),
  adminGames: (id: number) => request<{ games: AdminGame[] }>("GET", `/admin/users/${id}/games`),
};

export const errorText = (error: unknown) => (error instanceof Error ? error.message : "No se pudo completar. Inténtalo de nuevo.");

export function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString("es", { maximumFractionDigits: 1 })} MB`;
}

export function day(seconds: number | null): string {
  return seconds ? new Date(seconds * 1000).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export function hours(minutes: number): string {
  return `${Math.round(minutes / 60).toLocaleString("es")} h`;
}

// ── Medición ─────────────────────────────────────────────────
// Cuenta visitas y clics para saber qué funciona. No usa cookies ni identifica a nadie:
// al servidor solo llegan la página o el botón y de dónde vino la visita.

let muted = false;
/// El equipo de Red Level no cuenta en las cifras.
export const muteTracking = (value: boolean) => void (muted = value);

function source(): string {
  try {
    const saved = sessionStorage.getItem("rl_origen");
    if (saved) return saved;
  } catch {
    /* sin almacenamiento: se calcula cada vez */
  }
  let value = new URLSearchParams(location.search).get("utm_source") ?? "";
  if (!value && document.referrer) {
    try {
      const host = new URL(document.referrer).hostname.replace(/^www\./, "");
      if (host !== location.hostname.replace(/^www\./, "")) value = host;
    } catch {
      /* referencia ilegible */
    }
  }
  value = value || "directo";
  try {
    sessionStorage.setItem("rl_origen", value);
  } catch {
    /* sin almacenamiento */
  }
  return value;
}

export function track(kind: "view" | "click", label: string): void {
  if (muted) return;
  fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, label, source: source() }), keepalive: true }).catch(() => {});
}
