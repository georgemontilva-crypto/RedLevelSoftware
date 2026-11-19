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
  /// Tema visual elegido en la tienda.
  theme: string;
  /// Estilo de la interfaz: formas y efectos.
  look: string;
  /// Sonidos de la interfaz al moverse, abrir y cerrar.
  sounds: boolean;
  /// Volumen de esos sonidos, de 0 a 100.
  soundVolume: number;
  /// Cómo se ve la biblioteca: fila de carátulas, cuadrícula o lista.
  view: "shelf" | "grid" | "list";
  /// Dejar abrir y cerrar juegos de este PC desde la web, en el teléfono.
  remoteControl: boolean;
  /// Abrir los juegos locales como administrador.
  localAsAdmin: boolean;
}

/// Una biblioteca personalizada: un nombre y los juegos que el usuario metió en ella.
export interface Collection {
  id: string;
  name: string;
  games: string[];
}

/// Lo que el usuario ha organizado a su gusto: juegos ocultos y bibliotecas propias.
export interface LibraryMeta {
  hidden: string[];
  collections: Collection[];
}

/// Logros propios de Red Level, por tiempo jugado. Los mismos que anuncia el programa.
export const MILESTONES: { id: string; name: string; minutes: number }[] = [
  { id: "primera", name: "Primera partida", minutes: 1 },
  { id: "h1", name: "Una hora de juego", minutes: 60 },
  { id: "h5", name: "5 horas de juego", minutes: 300 },
  { id: "h10", name: "10 horas de juego", minutes: 600 },
  { id: "h25", name: "25 horas de juego", minutes: 1500 },
  { id: "h50", name: "50 horas de juego", minutes: 3000 },
  { id: "h100", name: "100 horas de juego", minutes: 6000 },
  { id: "h250", name: "250 horas de juego", minutes: 15000 },
];

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

export interface Update {
  version: string;
  url: string;
  size: number;
}

/// Un programa del PC que el usuario añadió a la barra del segundo monitor.
export interface SecondApp {
  id: string;
  name: string;
  open: boolean;
  /// Icono en PNG (base64), si se eligió de la lista de programas instalados.
  icon: string | null;
}

/// Un programa instalado en el PC, como sale en el menú Inicio.
export interface InstalledApp {
  name: string;
  id: string;
  icon: string | null;
}

/// Carpetas donde Red Level busca juegos de fuera de las tiendas.
export interface GameFolders {
  /// Las que añadió el usuario.
  chosen: string[];
  /// Las habituales que Red Level encontró solo.
  usual: string[];
}

export interface Disk {
  letter: string;
  freeBytes: number;
  totalBytes: number;
}

export interface SecondState {
  available: boolean;
  mode: "free" | "black";
  /// En pantalla sola, la app que se ve. En cuadrícula, la que está abierta en grande.
  active: string | null;
  /// En cuántos cuadros está dividido el segundo monitor (1 = pantalla sola).
  layout: number;
  theme: string;
  look: string;
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
  closeGame: (id: string) => call<void>("close_game", { id }),
  openUrl: (url: string) => call<void>("open_url", { url }),
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
  secondOpen: (id: string) => call<SecondState>("second_open", { id }),
  secondClose: (id: string) => call<SecondState>("second_close", { id }),
  secondAddApp: () => call<SecondState>("second_add_app"),
  secondSetLayout: (count: number) => call<SecondState>("second_set_layout", { count }),
  secondRemoveApp: (id: string) => call<SecondState>("second_remove_app", { id }),
  secondHide: () => call<SecondState>("second_hide"),
  installedApps: () => call<InstalledApp[]>("installed_apps"),
  secondAddInstalled: (chosen: InstalledApp) => call<SecondState>("second_add_installed", { chosen }),
  secondPicker: (open: boolean) => call<void>("second_picker", { open }),
  disks: () => call<Disk[]>("disks"),
  setGalleryAvatar: (image: string, extension: string) => call<Profile>("set_gallery_avatar", { image, extension }),
  toast: (kind: "mensaje" | "amistad" | "invitacion", title: string, body: string) => call<void>("toast", { kind, title, body }),
  libraryMeta: () => call<LibraryMeta>("library_meta"),
  setHidden: (id: string, hidden: boolean) => call<LibraryMeta>("set_hidden", { id, hidden }),
  saveCollection: (id: string | null, name: string) => call<LibraryMeta>("save_collection", { id, name }),
  deleteCollection: (id: string) => call<LibraryMeta>("delete_collection", { id }),
  toggleInCollection: (collection: string, game: string) => call<LibraryMeta>("toggle_in_collection", { collection, game }),
  uninstallGame: (id: string) => call<string>("uninstall_game", { id }),
  gameFolders: () => call<GameFolders>("game_folders"),
  addGameFolder: () => call<boolean>("add_game_folder"),
  removeGameFolder: (path: string) => call<void>("remove_game_folder", { path }),
  minimize: () => call<void>("minimize"),
  /// Carpeta de partidas de cada juego en este PC (clave: id del juego).
  saveFolders: () => call<Record<string, string>>("save_folders"),
  pickSaveFolder: (gameId: string) => call<Record<string, string>>("pick_save_folder", { gameId }),
  clearSaveFolder: (gameId: string) => call<Record<string, string>>("clear_save_folder", { gameId }),
  cloudBackup: (gameId: string, url: string, maxBytes: number) => call<{ files: number; bytes: number }>("cloud_backup", { gameId, url, maxBytes }),
  cloudRestore: (gameId: string, url: string) => call<number>("cloud_restore", { gameId, url }),
  checkUpdate: () => call<Update | null>("check_update"),
  installUpdate: (url: string) => call<void>("install_update", { url }),
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
/// Avisa cuando la biblioteca cambió por su cuenta (por ejemplo, al llegar las portadas de los juegos locales).
export function onLibraryChanged(handler: () => void): () => void {
  return subscribe<null>("library-changed", "mock-library", handler);
}

/// Avisa cuando se consigue un logro de Red Level.
export function onMilestone(handler: (milestone: { game: string; name: string }) => void): () => void {
  return subscribe("milestone", "mock-milestone", handler);
}

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
