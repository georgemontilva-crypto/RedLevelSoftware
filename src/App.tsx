import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  api,
  errorText,
  onLibraryChanged,
  onMilestone,
  onRunningChanged,
  type Achievements,
  type Bootstrap,
  type Disk,
  type Game,
  type GuardReport,
  type LibraryMeta,
  type PowerAction,
  type Profile,
  type Running,
  type Settings,
  type Update,
  type WifiStatus,
} from "./lib/api";
import { sortGames } from "./lib/format";
import { GameSheet } from "./components/GameSheet";
import { MonitorPanel } from "./components/MonitorPanel";
import { PowerMenu } from "./components/PowerMenu";
import { SettingsScreen } from "./components/SettingsScreen";
import { Session } from "./components/Session";
import { Splash } from "./components/Splash";
import { FriendsPanel, SignIn } from "./components/FriendsPanel";
import { Mark } from "./components/Logo";
import { StoreScreen } from "./components/StoreScreen";
import { useSocial } from "./lib/online";
import { focusedIn, moveFocus, useInput } from "./lib/input";
import { setSounds, sfx } from "./lib/sound";
import { applyTheme, canKeep, canKeepLook } from "./lib/themes";
import { Stage } from "./components/Stage";
import { TopBar, type Tab, type TabInfo } from "./components/TopBar";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { Welcome } from "./components/Welcome";
import { WifiPanel } from "./components/WifiPanel";

type Panel = null | "wifi" | "monitor" | "profile" | "power" | "game" | "update" | "store" | "friends";

const LAUNCH_TIMEOUT_MS = 90_000;

export function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [splashDone, setSplashDone] = useState(false);
  const [games, setGames] = useState<Game[]>([]);
  const [profile, setProfile] = useState<Profile>({ name: "", avatarFile: null });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [guard, setGuard] = useState<GuardReport>({ keyboardHook: false, taskbarsFound: 0, notifications: "" });
  const [onboarded, setOnboarded] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [running, setRunning] = useState<Running | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [wifiOn, setWifiOn] = useState<boolean | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [disks, setDisks] = useState<Disk[]>([]);
  const [meta, setMeta] = useState<LibraryMeta>({ hidden: [], collections: [] });
  const [achievements, setAchievements] = useState<Record<string, Achievements | null>>({});
  const requested = useRef(new Set<string>());

  const notify = useCallback((text: string) => setToast(text), []);
  // Carpeta de partidas de cada juego en este PC, para el guardado en la nube.
  const [saveFolders, setSaveFolders] = useState<Record<string, string>>({});
  useEffect(() => {
    api.saveFolders().then(setSaveFolders).catch(() => {});
  }, []);

  const rescan = useCallback(async () => {
    try {
      setGames(await api.scanLibrary());
    } catch (e) {
      notify(errorText(e));
    }
  }, [notify]);

  // Arranque: datos y biblioteca se cargan mientras corre la animación de entrada.
  useEffect(() => {
    Promise.all([api.bootstrap(), api.scanLibrary()])
      .then(([b, library]) => {
        setBoot(b);
        setProfile(b.profile);
        setSettings(b.settings);
        setGuard(b.guard);
        setOnboarded(b.onboarded);
        setRunning(b.running);
        setGames(library);
      })
      .catch((e) => setFatal(errorText(e)));
    api.wifiStatus().then((s) => setWifiOn(s.available ? s.connectedSsid !== null : null)).catch(() => {});
    api.disks().then(setDisks).catch(() => {});
    api.libraryMeta().then(setMeta).catch(() => {});
  }, []);

  // Logro de Red Level recién conseguido: aviso y sonido.
  useEffect(
    () =>
      onMilestone(({ game, name }) => {
        notify(`Logro conseguido: ${name} en ${game}`);
        sfx.launch();
      }),
    [notify],
  );

  // Las portadas de los juegos locales llegan después: al tenerlas se vuelve a leer la biblioteca.
  useEffect(() => onLibraryChanged(() => void rescan()), [rescan]);

  useEffect(
    () =>
      onRunningChanged((next) => {
        setRunning(next);
        setLaunching(null);
        if (!next) {
          setBrowsing(false);
          // Steam tarda unos segundos en apuntar las horas de la partida: se vuelve a leer dos veces.
          rescan();
          setTimeout(rescan, 8000);
        }
      }),
    [rescan],
  );

  // Al abrir, y cada tres horas, se mira si hay una versión nueva. Si falla (sin internet), no se molesta.
  useEffect(() => {
    const look = () => api.checkUpdate().then(setUpdate).catch(() => {});
    look();
    const timer = setInterval(look, 3 * 3600 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!launching) return;
    const timer = setTimeout(() => {
      setLaunching(null);
      notify("No vi abrirse el juego. Si ya está abierto, sus horas se contarán igual.");
    }, LAUNCH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [launching, notify]);

  // Pestañas: todo, cada tienda, las bibliotecas propias y, si hay alguno, los juegos ocultos.
  const tabs = useMemo<TabInfo[]>(() => {
    const shown = games.filter((g) => !meta.hidden.includes(g.id));
    const count = (store: string) => shown.filter((g) => g.store === store).length;
    return [
      { id: "all", label: "Todos", count: shown.length },
      { id: "steam", label: "Steam", count: count("steam") },
      { id: "epic", label: "Epic", count: count("epic") },
      { id: "local", label: "Locales", count: count("local") },
      ...meta.collections.map((c) => ({ id: `c:${c.id}`, label: c.name, count: c.games.filter((id) => shown.some((g) => g.id === id)).length })),
      ...(meta.hidden.length > 0 ? [{ id: "hidden", label: "Ocultos", count: games.filter((g) => meta.hidden.includes(g.id)).length }] : []),
    ];
  }, [games, meta]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const collection = tab.startsWith("c:") ? meta.collections.find((c) => `c:${c.id}` === tab) : null;
    const inTab = (g: Game) => {
      const isHidden = meta.hidden.includes(g.id);
      if (tab === "hidden") return isHidden;
      if (isHidden) return false;
      if (collection) return collection.games.includes(g.id);
      return tab === "all" || g.store === tab;
    };
    const filtered = games.filter((g) => inTab(g) && (!needle || g.title.toLowerCase().includes(needle)));
    return sortGames(filtered, settings?.sort ?? "recent");
  }, [games, tab, query, settings?.sort, meta]);

  // Si la pestaña desaparece (se borró la biblioteca o ya no hay ocultos), se vuelve a "Todos".
  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab("all");
  }, [tabs, tab]);

  const focused = visible.find((g) => g.id === focusId) ?? visible[0] ?? null;
  const byId = useCallback((id: string | null | undefined) => games.find((g) => g.id === id) ?? null, [games]);

  // Logros del juego enfocado, con una pequeña espera para no leer cada juego al pasar de largo.
  const loadAchievements = useCallback((game: Game | null) => {
    if (!game?.hasAchievements || requested.current.has(game.id)) return;
    requested.current.add(game.id);
    api
      .achievements(game.id)
      .then((result) => setAchievements((cache) => ({ ...cache, [game.id]: result })))
      .catch(() => requested.current.delete(game.id));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadAchievements(focused), 220);
    return () => clearTimeout(timer);
  }, [focused, loadAchievements]);

  const play = useCallback(
    async (game: Game) => {
      if (running?.id === game.id) {
        setBrowsing(false);
        return;
      }
      setPanel(null);
      setLaunching(game.id);
      try {
        await api.launchGame(game.id);
      } catch (e) {
        setLaunching(null);
        notify(errorText(e));
      }
    },
    [running, notify],
  );


  const saveSettings = useCallback(
    async (next: Settings) => {
      setSettings(next);
      try {
        setGuard(await api.saveSettings(next));
      } catch (e) {
        notify(errorText(e));
      }
    },
    [notify],
  );

  const addLocal = useCallback(async () => {
    try {
      const id = await api.addLocalGame();
      if (!id) return;
      await rescan();
      setQuery("");
      setTab((current) => (current === "all" ? current : "local"));
      setFocusId(id);
    } catch (e) {
      notify(errorText(e));
    }
  }, [rescan, notify]);

  const pickAvatar = useCallback(async () => {
    try {
      setProfile(await api.pickAvatar());
    } catch (e) {
      notify(errorText(e));
    }
  }, [notify]);

  const saveName = useCallback(
    async (name: string) => {
      try {
        setProfile(await api.saveProfile(name));
        setOnboarded(true);
      } catch (e) {
        notify(errorText(e));
      }
    },
    [notify],
  );

  const power = useCallback(
    async (action: PowerAction) => {
      try {
        await api.power(action);
      } catch (e) {
        notify(errorText(e));
      }
    },
    [notify],
  );

  const onWifiStatus = useCallback((status: WifiStatus) => setWifiOn(status.available ? status.connectedSsid !== null : null), []);

  // La biblioteca se monta debajo de la entrada para que se vea a través del aro cuando se abre.
  const home = boot !== null && onboarded;
  const finishSplash = useCallback(() => setSplashDone(true), []);
  const sessionGame = byId(launching ?? (browsing ? null : running?.id));

  // Manejo sin ratón: flechas o WASD, Tab para cambiar de biblioteca y mando.
  // Arriba se pasa a los botones de la barra superior; dentro de un panel se recorre lo que haya en él.
  useInput(
    (action, fromPad) => {
      // Con la pantalla de entrada delante, la biblioteca de detrás no se maneja.
      if (!home || !splashDone || sessionGame || social.status === "out") return;
      // Lo que esté abierto encima de la biblioteca: un panel lateral o una pantalla completa (tienda, ajustes).
      const drawer = document.querySelector<HTMLElement>(".drawer, .screen");
      const top = document.querySelector<HTMLElement>(".topbar-actions");
      const typing = document.activeElement instanceof HTMLInputElement;

      if (action === "nextTab" || action === "prevTab") {
        if (panel) return;
        const order = tabs.map((t) => t.id);
        setTab(order[(Math.max(0, order.indexOf(tab)) + (action === "nextTab" ? 1 : order.length - 1)) % order.length]);
        sfx.tab();
        return;
      }
      if (action === "back") {
        if (panel) setPanel(null);
        else (document.activeElement as HTMLElement | null)?.blur();
        return;
      }
      if (panel && drawer) {
        if (action === "down" || action === "right") moveFocus(drawer, 1) && sfx.move();
        else if (action === "up" || action === "left") moveFocus(drawer, -1) && sfx.move();
        else if (action === "accept" && fromPad) focusedIn(drawer)?.click();
        return;
      }
      if (panel) return;

      const inTop = focusedIn(top);
      if (inTop) {
        if (action === "left") moveFocus(top, -1) && sfx.move();
        else if (action === "right") moveFocus(top, 1) && sfx.move();
        else if (action === "down") inTop.blur();
        else if (action === "accept" && fromPad) inTop.click();
        return;
      }

      const index = focused ? visible.findIndex((g) => g.id === focused.id) : -1;
      // En cuadrícula se sube y se baja por filas; en lista, de uno en uno. En la fila de carátulas, arriba lleva a la barra.
      const view = settings?.view ?? "shelf";
      const tiles = Array.from(document.querySelectorAll<HTMLElement>(".shelf.is-grid > .tile:not(.tile-add)"));
      const columns = view === "list" ? 1 : view === "grid" ? Math.max(1, tiles.filter((t) => t.offsetTop === tiles[0]?.offsetTop).length) : 0;
      const go = (to: number) => {
        setFocusId(visible[to].id);
        sfx.move();
      };
      if (action === "right" && view !== "list" && index < visible.length - 1) go(index + 1);
      else if (action === "left" && view !== "list" && index > 0) go(index - 1);
      else if (action === "down" && columns > 0 && index + columns < visible.length) go(index + columns);
      else if (action === "down" && columns > 0 && index < visible.length - 1) go(visible.length - 1);
      else if (action === "up" && columns > 0 && index - columns >= 0) go(index - columns);
      else if (action === "up") {
        moveFocus(top, 1) && sfx.move();
      } else if (action === "accept" && focused && !typing && (fromPad || !(document.activeElement instanceof HTMLButtonElement))) {
        play(focused);
      } else if (action === "details" && focused) {
        loadAchievements(focused);
        setPanel("game");
      } else if (action === "menu") {
        setPanel("power");
      }
    },
    home && splashDone && !sessionGame,
  );

  // Sonidos: al abrir o cerrar un panel y al lanzar un juego.
  const sounds = settings?.sounds ?? true;
  const soundVolume = settings?.soundVolume ?? 70;
  useEffect(() => setSounds(sounds, soundVolume), [sounds, soundVolume]);
  const panelSeen = useRef<Panel>(null);
  useEffect(() => {
    if (panel && !panelSeen.current) sfx.open();
    else if (!panel && panelSeen.current) sfx.back();
    panelSeen.current = panel;
  }, [panel]);
  useEffect(() => {
    if (launching) sfx.launch();
  }, [launching]);

  // Amigos y chat: mientras hay sesión, Red Level dice a tus amigos si estás conectado y a qué juegas.
  const playingTitle = running ? (byId(running.id)?.title ?? null) : null;
  const social = useSocial(playingTitle, {
    usage: () => ({ appVersion: boot?.version ?? "", games: games.map((g) => ({ id: g.id, title: g.title, store: g.store, minutes: g.minutes, lastPlayed: g.lastPlayed })) }),
    onMessage: (from, message) => {
      sfx.open();
      const invite = message.kind === "invite";
      api.toast(invite ? "invitacion" : "mensaje", invite ? `${from.name} te invita a jugar` : from.name, invite ? (message.game ?? "") : message.body).catch(() => {});
      notify(invite ? `${from.name} te invita a jugar a ${message.game}` : `${from.name}: ${message.body}`);
    },
    onRequest: (from) => {
      sfx.open();
      api.toast("amistad", "Solicitud de amistad", `${from.name} quiere ser tu amigo`).catch(() => {});
      notify(`${from.name} quiere ser tu amigo.`);
    },
  });

  // Avatares nuevos en la galería: se avisa una vez al abrir.
  // El tema y la interfaz elegidos pintan todo el programa. Solo se quedan puestos los incluidos y los comprados
  // con la cuenta; si quedara guardado otro, se usa el de serie.
  const theme = settings?.theme;
  const look = settings?.look;
  const owned = social.wallet.owned;
  useEffect(() => {
    if (theme !== undefined) applyTheme(canKeep(theme, owned) ? theme : "red-level", look && canKeepLook(look, owned) ? look : "clasico");
  }, [theme, look, owned]);

  // Al cerrar un juego que tiene carpeta de partidas, se sube su copia a la nube sin preguntar.
  const cloudNow = useRef({ cloud: social.cloud, saveFolders, games });
  cloudNow.current = { cloud: social.cloud, saveFolders, games };
  const lastRunning = useRef<string | null>(null);
  const runningId = running?.id ?? null;
  useEffect(() => {
    const closed = lastRunning.current;
    lastRunning.current = runningId;
    if (!closed || closed === runningId) return;
    const { cloud, saveFolders, games } = cloudNow.current;
    const game = games.find((g) => g.id === closed);
    if (!game || !cloud.enabled || !saveFolders[closed]) return;
    cloud
      .backup(game)
      .then(() => notify(`Partidas de ${game.title} guardadas en la nube.`))
      .catch((e) => notify(`No se pudo guardar ${game.title} en la nube: ${errorText(e)}`));
  }, [runningId, notify]);

  const announced = useRef(false);
  useEffect(() => {
    if (social.newAvatars > 0 && !announced.current && home && splashDone) {
      announced.current = true;
      notify(social.newAvatars === 1 ? "Hay un avatar nuevo en tu perfil." : `Hay ${social.newAvatars} avatares nuevos en tu perfil.`);
      sfx.open();
    }
  }, [social.newAvatars, home, splashDone, notify]);

  const hideGame = useCallback(
    (game: Game, hide: boolean) => {
      api
        .setHidden(game.id, hide)
        .then((next) => {
          setMeta(next);
          notify(hide ? `${game.title} está en «Ocultos».` : `${game.title} vuelve a tu biblioteca.`);
        })
        .catch((e) => notify(errorText(e)));
    },
    [notify],
  );

  const detailGame = panel === "game" ? focused : null;
  const emptyText = games.length === 0 ? "Tu biblioteca está vacía" : query ? `Nada coincide con «${query.trim()}»` : tab.startsWith("c:") ? "Esta biblioteca está vacía" : "No hay juegos en esta tienda";

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        {/* Interferencias del aspecto Glitch: solo se ven con ese aspecto puesto. */}
        <div className="look-fx" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        {home && settings && boot && (
          <div className="home">
            <TopBar
              tabs={tabs}
              tab={tab}
              onTab={setTab}
              onNewLibrary={(name) =>
                api
                  .saveCollection(null, name)
                  .then((next) => {
                    setMeta(next);
                    const created = next.collections.find((c) => c.name === name);
                    if (created) setTab(`c:${created.id}`);
                  })
                  .catch((e) => notify(errorText(e)))
              }
              onDeleteLibrary={(id) => api.deleteCollection(id.slice(2)).then(setMeta).catch((e) => notify(errorText(e)))}
              query={query}
              onQuery={setQuery}
              view={settings.view ?? "shelf"}
              onView={(view) => saveSettings({ ...settings, view })}
              profile={profile}
              playing={playingTitle}
              wifiOn={wifiOn}
              disks={disks}
              updateVersion={update?.version ?? null}
              socialCount={social.requests.length + Object.values(social.unread).reduce((sum, count) => sum + count, 0)}
              onMinimize={() => api.minimize().catch((e) => notify(errorText(e)))}
              onOpen={setPanel}
            />
            <Stage
              games={visible}
              focused={focused}
              achievements={focused ? achievements[focused.id] : undefined}
              onFocus={setFocusId}
              onPlay={play}
              onDetails={(game) => {
                setFocusId(game.id);
                loadAchievements(game);
                setPanel("game");
              }}
              onAddLocal={addLocal}
              showAdd={tab === "all" || tab === "local"}
              emptyText={emptyText}
              view={settings.view ?? "shelf"}
              hidden={focused ? meta.hidden.includes(focused.id) : false}
              onHide={hideGame}
            />
            {running && browsing && byId(running.id) && (
              <button className="now-playing" onClick={() => setBrowsing(false)}>
                <span className="now-playing-dot" aria-hidden="true" />
                Jugando {byId(running.id)!.title}
              </button>
            )}

            <AnimatePresence>
              {detailGame && (
                <GameSheet
                  key={`game-${detailGame.id}`}
                  game={detailGame}
                  achievements={achievements[detailGame.id]}
                  cloud={social.cloud}
                  signedIn={social.status === "in"}
                  saveFolder={saveFolders[detailGame.id]}
                  onSaveFolders={setSaveFolders}
                  onClose={() => setPanel(null)}
                  onPlay={play}
                  onRename={async (game, title) => {
                    await api.renameLocalGame(game.id, title).catch((e) => notify(errorText(e)));
                    rescan();
                  }}
                  onCover={async (game) => {
                    const changed = await api.setLocalCover(game.id).catch((e) => (notify(errorText(e)), false));
                    if (changed) rescan();
                  }}
                  onRemove={async (game) => {
                    await api.removeLocalGame(game.id).catch((e) => notify(errorText(e)));
                    setPanel(null);
                    rescan();
                  }}
                  meta={meta}
                  onHide={hideGame}
                  onToggleCollection={(collection, game) => api.toggleInCollection(collection, game.id).then(setMeta).catch((e) => notify(errorText(e)))}
                  onNewCollection={(name, game) =>
                    api
                      .saveCollection(null, name)
                      .then((next) => {
                        const created = next.collections.find((c) => c.name === name);
                        return created ? api.toggleInCollection(created.id, game.id) : next;
                      })
                      .then(setMeta)
                      .catch((e) => notify(errorText(e)))
                  }
                  onUninstall={(game) => api.uninstallGame(game.id).catch((e) => (notify(errorText(e)), null))}
                />
              )}
              {panel === "wifi" && <WifiPanel key="wifi" onClose={() => setPanel(null)} onStatus={onWifiStatus} />}
              {panel === "monitor" && <MonitorPanel key="monitor" monitors={boot.monitors} settings={settings} onSettings={saveSettings} onClose={() => setPanel(null)} />}
              {panel === "profile" && (
                <SettingsScreen key="profile" boot={boot} profile={profile} settings={settings} guard={guard} social={social} onName={saveName} onAvatar={pickAvatar} onSettings={saveSettings} onProfile={setProfile} onLibrary={() => void rescan()} onMonitor={() => setPanel("monitor")} onClose={() => setPanel(null)} />
              )}
              {panel === "friends" && <FriendsPanel key="friends" social={social} game={playingTitle ?? focused?.title ?? null} onClose={() => setPanel(null)} />}
              {panel === "store" && <StoreScreen key="store" settings={settings} onSettings={saveSettings} wallet={social.wallet} signedIn={social.status === "in"} onClose={() => setPanel(null)} />}
              {panel === "power" && <PowerMenu key="power" onAction={power} onClose={() => setPanel(null)} />}
              {panel === "update" && update && <UpdatePrompt key="update" update={update} current={boot.version} onClose={() => setPanel(null)} />}
            </AnimatePresence>

            <AnimatePresence>
              {sessionGame && (
                <Session
                  key="session"
                  game={sessionGame}
                  running={running?.id === sessionGame.id ? running : null}
                  achievements={achievements[sessionGame.id]}
                  onBrowse={() => setBrowsing(true)}
                  onCancel={() => setLaunching(null)}
                />
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Con la web conectada, Red Level se usa con cuenta: sin sesión se pide antes de entrar a la biblioteca. */}
        {home && splashDone && social.status === "out" && (
          <div className="gate">
            <div className="gate-card">
              <Mark size={54} />
              <h2>Entra en Red Level</h2>
              <SignIn social={social} intro="Red Level se usa con tu cuenta, la misma de la web. Si aún no tienes, créala aquí en un momento." />
              <button className="btn btn-ghost btn-small" onClick={() => api.power("exit").catch((e) => notify(errorText(e)))}>
                Salir de Red Level
              </button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {boot && !onboarded && <Welcome key="welcome" windowsName={boot.windowsName} profile={profile} gameCount={games.length} onAvatar={pickAvatar} onDone={saveName} />}
        </AnimatePresence>

        {!splashDone && <Splash ready={boot !== null || fatal !== null} onDone={finishSplash} />}

        {fatal && splashDone && (
          <div className="fatal">
            <h2>Red Level no pudo arrancar</h2>
            <p className="muted">{fatal}</p>
            <button className="btn btn-ghost" onClick={() => power("exit")}>
              Salir al escritorio
            </button>
          </div>
        )}

        <AnimatePresence>
          {toast && (
            <motion.div key={toast} className="toast" role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22 }}>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
