import type { Game, StoreId } from "./api";

export const storeNames: Record<StoreId, string> = { steam: "Steam", epic: "Epic Games", local: "Instalado en este PC" };
export const storeShort: Record<StoreId, string> = { steam: "Steam", epic: "Epic", local: "Locales" };

const decimal = new Intl.NumberFormat("es", { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("es", { maximumFractionDigits: 0 });

/// "38 min", "3,5 h", "124 h".
export function playtime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours < 10 ? decimal.format(hours) : whole.format(hours)} h`;
}

/// "hoy", "ayer", "hace 5 días", "el 3 de marzo de 2025".
export function lastPlayed(seconds: number | null): string {
  if (!seconds) return "Sin estrenar";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.ceil((startOfToday.getTime() / 1000 - seconds) / 86400);
  if (days <= 0) return "Jugaste hoy";
  if (days === 1) return "Jugaste ayer";
  if (days < 30) return `Jugaste hace ${days} días`;
  const date = new Date(seconds * 1000);
  return `Jugaste el ${date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}`;
}

export function shortDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

export function diskSize(bytes: number | null): string | null {
  if (!bytes) return null;
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${decimal.format(gb)} GB` : `${whole.format(bytes / 1024 ** 2)} MB`;
}

/// Cronómetro de la partida: "1:04:09" o "04:09".
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = Math.floor(s / 3600);
  return hours > 0 ? `${hours}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

export function sortGames(games: Game[], sort: "recent" | "played" | "name"): Game[] {
  const byName = (a: Game, b: Game) => a.title.localeCompare(b.title, "es", { sensitivity: "base" });
  const sorted = [...games];
  if (sort === "name") return sorted.sort(byName);
  if (sort === "played") return sorted.sort((a, b) => b.minutes - a.minutes || byName(a, b));
  return sorted.sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || byName(a, b));
}

/// Número estable a partir de un texto, para dar a cada juego sin carátula su propio color.
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}
