// Datos de muestra para ver la interfaz en un navegador. Los juegos son inventados.

import type { Achievements, Bootstrap, Game, Running, SecondState, Settings, WifiStatus } from "./api";

const now = Math.floor(Date.now() / 1000);
const day = 86400;

function game(id: string, store: Game["store"], title: string, minutes: number, daysAgo: number | null, achievements = false): Game {
  return {
    id,
    store,
    title,
    launch: "",
    installDir: null,
    exe: null,
    minutes,
    lastPlayed: daysAgo === null ? null : now - daysAgo * day - 3600,
    sizeBytes: Math.round((8 + (title.length * 7) % 90) * 1024 ** 3),
    coverFile: null,
    heroFile: null,
    coverUrls: [],
    heroUrls: [],
    hoursSource: store === "steam" ? "steam" : "redlevel",
    hasAchievements: achievements,
  };
}

let games: Game[] = [
  game("steam:1", "steam", "Halcyon Drift", 7462, 0, true),
  game("steam:2", "steam", "Emberfall", 3120, 1, true),
  game("epic:a", "epic", "Nocturne Protocol", 845, 3),
  game("steam:3", "steam", "Saltwind", 1290, 6, true),
  game("local:x", "local", "Tetra", 38, 9),
  game("steam:4", "steam", "Ironroot Tactics", 15840, 14, true),
  game("epic:b", "epic", "Vanta Circuit", 0, null),
  game("steam:5", "steam", "Paper Kingdoms", 402, 31, true),
  game("local:y", "local", "Deepline", 2210, 45),
  game("steam:6", "steam", "Marrow & Moss", 96, 80, true),
  game("epic:c", "epic", "Signal Lost", 310, 120),
  game("steam:7", "steam", "Kiln", 0, null, true),
];

let settings: Settings = {
  blockKeys: true,
  blockAltTabInGame: false,
  hideTaskbar: true,
  silenceNotifications: true,
  secondMonitor: "free",
  sort: "recent",
  theme: new URLSearchParams(location.search).get("tema") ?? "red-level",
  sounds: true,
  view: (new URLSearchParams(location.search).get("vista") as Settings["view"]) ?? "shelf",
};

const params = new URLSearchParams(location.search);
let profile = { name: params.has("nuevo") ? "" : "Jorge", avatarFile: null as string | null };
let onboarded = !params.has("nuevo");
let second: SecondState = {
  available: !params.has("un-monitor"),
  mode: "free",
  active: params.get("ventana") === "second-bar" && !params.has("division") ? "app:2" : null,
  layout: Number(params.get("division") ?? 1),
  theme: params.get("tema") ?? "red-level",
  apps: [
    { id: "app:1", name: "Chat de voz", open: params.has("ventana"), icon: null },
    { id: "app:2", name: "Música", open: params.has("ventana"), icon: null },
    { id: "app:3", name: "Navegador", open: params.has("division"), icon: null },
  ],
};

let folders: string[] = [];
let meta: { hidden: string[]; collections: { id: string; name: string; games: string[] }[] } = { hidden: [], collections: [] };

function setSecond(next: SecondState): SecondState {
  second = next;
  window.dispatchEvent(new CustomEvent("mock-second", { detail: second }));
  return second;
}
let running: Running | null = null;

const achievementNames = [
  ["Primer vuelo", "Completa el tutorial."],
  ["Sin rozar la pared", "Termina una pista sin chocar."],
  ["Coleccionista", "Encuentra los 40 fragmentos."],
  ["Madrugador", "Juega antes de las 6 de la mañana."],
  ["Viento de cola", "Alcanza la velocidad máxima."],
  ["Contra el reloj", "Bate el tiempo del desarrollador."],
  ["Final verdadero", "Descubre lo que hay tras la última puerta."],
  ["Manos de seda", "Encadena 50 derrapes perfectos."],
];

function achievementsFor(id: string): Achievements | null {
  const item = games.find((g) => g.id === id);
  if (!item?.hasAchievements) return null;
  const seed = Number(id.split(":")[1]);
  const total = 18 + seed * 7;
  const unlocked = item.minutes === 0 ? 0 : Math.min(total, Math.round(total * (0.2 + seed * 0.11)));
  return {
    total,
    unlocked,
    items: Array.from({ length: total }, (_, i) => {
      const [name, description] = achievementNames[i % achievementNames.length];
      const hidden = i % 9 === 8;
      return {
        name: i < achievementNames.length ? name : `${name} ${Math.floor(i / achievementNames.length) + 1}`,
        description,
        unlocked: i < unlocked,
        unlockedAt: i < unlocked ? now - i * day * 2 : null,
        hidden,
        iconUrl: null,
      };
    }),
  };
}

const wifi: WifiStatus = {
  available: true,
  connectedSsid: "Casa Montilva 5G",
  signal: 88,
  message: null,
  networks: [
    { ssid: "Casa Montilva 5G", signal: 88, secured: true, security: "WPA2-Personal", known: true, connected: true },
    { ssid: "Casa Montilva", signal: 71, secured: true, security: "WPA2-Personal", known: true, connected: false },
    { ssid: "Vecinos_2.4", signal: 46, secured: true, security: "WPA3-Personal", known: false, connected: false },
    { ssid: "Plaza Libre", signal: 22, secured: false, security: "Abierta", known: false, connected: false },
  ],
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function mockCall(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
  await wait(60);
  switch (command) {
    case "bootstrap":
      return {
        version: "0.1.0",
        onboarded,
        profile,
        windowsName: "Jorge Montilva",
        settings,
        monitors: params.has("un-monitor")
          ? [{ name: "Principal", x: 0, y: 0, width: 2560, height: 1440, primary: true }]
          : [
              { name: "Principal", x: 0, y: 0, width: 2560, height: 1440, primary: true },
              { name: "Secundario", x: 2560, y: 180, width: 1920, height: 1080, primary: false },
            ],
        guard: { keyboardHook: true, taskbarsFound: 2, notifications: "ok" },
        guardEnabled: true,
        running,
      } satisfies Bootstrap;
    case "scan_library":
      return params.has("vacio") ? [] : games;
    case "achievements":
      return achievementsFor(args.id as string);
    case "launch_game": {
      const id = args.id as string;
      setTimeout(() => {
        running = { id, since: Math.floor(Date.now() / 1000) };
        window.dispatchEvent(new CustomEvent("mock-running", { detail: running }));
      }, 2500);
      return null;
    }
    case "add_local_game": {
      const id = `local:${Date.now()}`;
      games = [...games, game(id, "local", "Juego nuevo", 0, null)];
      return id;
    }
    case "rename_local_game":
      games = games.map((g) => (g.id === args.id ? { ...g, title: args.title as string } : g));
      return null;
    case "remove_local_game":
      games = games.filter((g) => g.id !== args.id);
      return null;
    case "set_local_cover":
      return false;
    case "pick_avatar":
      return profile;
    case "save_profile":
      profile = { ...profile, name: args.name as string };
      onboarded = true;
      return profile;
    case "save_settings":
      settings = args.settings as Settings;
      setSecond({ ...second, mode: settings.secondMonitor, theme: settings.theme });
      return { keyboardHook: true, taskbarsFound: 2, notifications: "ok" };
    case "wifi_status":
      await wait(500);
      return wifi;
    case "wifi_connect":
      await wait(900);
      if (args.password === "mal") throw "Windows no pudo conectarse. Revisa la clave.";
      wifi.networks = wifi.networks.map((n) => ({ ...n, connected: n.ssid === args.ssid, known: n.known || n.ssid === args.ssid }));
      wifi.connectedSsid = args.ssid as string;
      return null;
    case "wifi_disconnect":
      wifi.networks = wifi.networks.map((n) => ({ ...n, connected: false }));
      wifi.connectedSsid = null;
      return null;
    case "monitors":
      return [];
    case "second_state":
      return second;
    case "second_open":
      return setSecond({
        ...second,
        mode: "free",
        active: second.layout === 1 || second.apps.find((a) => a.id === args.id)?.open ? (args.id as string) : null,
        apps: second.apps.map((a) => (a.id === args.id ? { ...a, open: true } : a)),
      });
    case "second_close":
      return setSecond({
        ...second,
        active: second.active === args.id ? null : second.active,
        apps: second.apps.map((a) => (a.id === args.id ? { ...a, open: false } : a)),
      });
    case "second_set_layout":
      return setSecond({ ...second, layout: args.count as number, active: null });
    case "second_add_app":
      return setSecond({ ...second, apps: [...second.apps, { id: `app:${Date.now()}`, name: ["Navegador", "Notas", "Grabadora"][second.apps.length % 3], open: false, icon: null }] });
    case "installed_apps":
      await wait(500);
      return ["Bloc de notas", "Calculadora", "Chat de voz", "Editor de vídeo", "Explorador de archivos", "Grabadora", "Música", "Navegador", "Películas y series", "Reproductor", "Retransmisión en directo", "Vídeos en línea"].map((name, i) => ({ name, id: `demo.${i}`, icon: null }));
    case "second_add_installed": {
      const chosen = args.chosen as { name: string; id: string };
      return setSecond({ ...second, apps: [...second.apps, { id: `app:${chosen.id}`, name: chosen.name, open: false, icon: null }] });
    }
    case "second_picker":
      return undefined;
    case "disks":
      return [
        { letter: "C", freeBytes: 182 * 2 ** 30, totalBytes: 476 * 2 ** 30 },
        { letter: "D", freeBytes: 611 * 2 ** 30, totalBytes: 931 * 2 ** 30 },
      ];
    case "minimize":
      return undefined;
    case "library_meta":
      return meta;
    case "set_hidden":
      meta = { ...meta, hidden: args.hidden ? [...meta.hidden.filter((h) => h !== args.id), args.id as string] : meta.hidden.filter((h) => h !== args.id) };
      return meta;
    case "save_collection":
      meta = args.id
        ? { ...meta, collections: meta.collections.map((c) => (c.id === args.id ? { ...c, name: args.name as string } : c)) }
        : { ...meta, collections: [...meta.collections, { id: `b${Date.now()}`, name: (args.name as string).trim(), games: [] }] };
      return meta;
    case "delete_collection":
      meta = { ...meta, collections: meta.collections.filter((c) => c.id !== args.id) };
      return meta;
    case "toggle_in_collection":
      meta = { ...meta, collections: meta.collections.map((c) => (c.id === args.collection ? { ...c, games: c.games.includes(args.game as string) ? c.games.filter((g) => g !== args.game) : [...c.games, args.game as string] } : c)) };
      return meta;
    case "uninstall_game":
      return "Steam te pedirá confirmar la desinstalación.";
    case "game_folders":
      return { chosen: folders, usual: ["D:\\Juegos"] };
    case "add_game_folder":
      folders = [...folders, `E:\\Mis juegos ${folders.length + 1}`];
      return true;
    case "remove_game_folder":
      folders = folders.filter((f) => f !== args.path);
      return undefined;
    case "second_remove_app":
      return setSecond({ ...second, active: second.active === args.id ? null : second.active, apps: second.apps.filter((a) => a.id !== args.id) });
    case "second_hide":
      return setSecond({ ...second, active: null });
    case "check_update":
      return params.has("actualizacion") ? { version: "0.4.0", url: "https://github.com/georgemontilva-crypto/RedLevelSoftware/releases/download/v0.4.0/RedLevel-Setup-0.4.0.exe", size: 2_700_000 } : null;
    case "install_update":
      await wait(2500);
      throw "En el navegador no se instala nada: esto es solo una muestra.";
    case "power":
      if (running) {
        running = null;
        window.dispatchEvent(new CustomEvent("mock-running", { detail: null }));
      }
      return null;
    default:
      throw `Comando desconocido: ${command}`;
  }
}
