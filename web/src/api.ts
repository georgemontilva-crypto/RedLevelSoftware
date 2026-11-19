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

export interface AdminGame {
  title: string;
  store: string;
  minutes: number;
  lastPlayed: number | null;
  achUnlocked: number | null;
  achTotal: number | null;
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
  release: () => request<{ release: Release | null }>("GET", "/release"),
  download: () => request<{ url: string; version: string }>("POST", "/download"),
  config: () => request<{ contactEmail: string | null }>("GET", "/config"),
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
