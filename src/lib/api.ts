// Puente con el programa de Windows. En un navegador normal (sin Tauri) usa datos de muestra,
// para poder diseñar y revisar la interfaz sin instalar nada.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type StoreId = "steam" | "epic" | "local";

export interface Game {
  id: string;
  store: StoreId;
  title: string;
  launch: string;
  installDir: string | null;
  exe: string | null;
  minutes: number;
  lastPlayed: number | null;
  sizeBytes: number | null;
  coverFile: string | null;
  heroFile: string | null;
  coverUrls: string[];
  heroUrls: string[];
  hoursSource: "steam" | "redlevel";
  hasAchievements: boolean;
}

export interface Achievement {
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt: number | null;
  hidden: boolean;
  iconUrl: string | null;
}

export interface Achievements {
  total: number;
  unlocked: number;
  items: Achievement[];
}

export interface Settings {
  blockKeys: boolean;
  blockAltTabInGame: boolean;
  hideTaskbar: boolean;
  silenceNotifications: boolean;
  secondMonitor: "free" | "black";
  sort: "recent" | "played" | "name";
}

export interface Profile {
  name: string;
  avatarFile: string | null;
}

export interface MonitorInfo {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  primary: boolean;
}

export interface GuardReport {
  keyboardHook: boolean;
  taskbarsFound: number;
  notifications: string;
}

export interface Running {
  id: string;
  since: number;
}

export interface Bootstrap {
  version: string;
  onboarded: boolean;
  profile: Profile;
  windowsName: string;
  settings: Settings;
  monitors: MonitorInfo[];
  guard: GuardReport;
  guardEnabled: boolean;
  running: Running | null;
}

export interface WifiNetwork {
  ssid: string;
  signal: number;
  secured: boolean;
  security: string;
  known: boolean;
  connected: boolean;
}

export interface WifiStatus {
  available: boolean;
  connectedSsid: string | null;
  signal: number | null;
  networks: WifiNetwork[];
  message: string | null;
}

export type CompanionId = "discord" | "spotify" | "youtube";

export interface SecondApp {
  id: CompanionId;
  name: string;
  open: boolean;
  kind: "app" | "web" | null;
}

export interface SecondState {
  available: boolean;
  mode: "free" | "black";
  active: CompanionId | null;
  apps: SecondApp[];
}
export type PowerAction = "exit" | "restart" | "shutdown";

export const inTauri = "__TAURI_INTERNALS__" in window;

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (inTauri) return invoke<T>(command, args);
  const { mockCall } = await import("./mock");
  return mockCall(command, args) as Promise<T>;
}

export const api = {
  bootstrap: () => call<Bootstrap>("bootstrap"),
  scanLibrary: () => call<Game[]>("scan_library"),
  achievements: (id: string) => call<Achievements | null>("achievements", { id }),
  launchGame: (id: string) => call<void>("launch_game", { id }),
  addLocalGame: () => call<string | null>("add_local_game"),
  renameLocalGame: (id: string, title: string) => call<void>("rename_local_game", { id, title }),
  removeLocalGame: (id: string) => call<void>("remove_local_game", { id }),
  setLocalCover: (id: string) => call<boolean>("set_local_cover", { id }),
  pickAvatar: () => call<Profile>("pick_avatar"),
  saveProfile: (name: string) => call<Profile>("save_profile", { name }),
  saveSettings: (settings: Settings) => call<GuardReport>("save_settings", { settings }),
  wifiStatus: () => call<WifiStatus>("wifi_status"),
  wifiConnect: (network: WifiNetwork, password: string | null) =>
    call<void>("wifi_connect", { ssid: network.ssid, password, security: network.security, known: network.known }),
  wifiDisconnect: () => call<void>("wifi_disconnect"),
  monitors: () => call<MonitorInfo[]>("monitors"),
  secondState: () => call<SecondState>("second_state"),
  secondOpen: (id: CompanionId) => call<SecondState>("second_open", { id }),
  secondClose: (id: CompanionId) => call<SecondState>("second_close", { id }),
  secondHide: () => call<SecondState>("second_hide"),
  power: (action: PowerAction) => call<void>("power", { action }),
};

function subscribe<T>(event: string, mockEvent: string, handler: (payload: T) => void): () => void {
  if (!inTauri) {
    const listener = (e: Event) => handler((e as CustomEvent<T>).detail);
    window.addEventListener(mockEvent, listener);
    return () => window.removeEventListener(mockEvent, listener);
  }
  let stop: (() => void) | undefined;
  let cancelled = false;
  listen<T>(event, (e) => handler(e.payload)).then((unlisten) => {
    if (cancelled) unlisten();
    else stop = unlisten;
  });
  return () => {
    cancelled = true;
    stop?.();
  };
}

/// Avisa cuando se abre o se cierra un juego. Devuelve la función para dejar de escuchar.
export function onRunningChanged(handler: (running: Running | null) => void): () => void {
  return subscribe("running-changed", "mock-running", handler);
}

/// Avisa cuando cambia lo que hay en el segundo monitor.
export function onSecondChanged(handler: (state: SecondState) => void): () => void {
  return subscribe("second-changed", "mock-second", handler);
}

/// Qué ventana de Red Level es esta: la principal o una de las del segundo monitor.
export function windowLabel(): string {
  if (!inTauri) return new URLSearchParams(location.search).get("ventana") ?? "main";
  const internals = (window as unknown as { __TAURI_INTERNALS__: { metadata: { currentWindow: { label: string } } } }).__TAURI_INTERNALS__;
  return internals.metadata.currentWindow.label;
}

/// Dirección que la ventana puede cargar para un archivo del disco.
export function fileSrc(path: string): string {
  return inTauri ? convertFileSrc(path) : path;
}

export function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Algo falló. Inténtalo de nuevo.";
}
