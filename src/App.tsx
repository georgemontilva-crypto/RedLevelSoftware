import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  api,
  errorText,
  onRunningChanged,
  type Achievements,
  type Bootstrap,
  type Game,
  type GuardReport,
  type PowerAction,
  type Profile,
  type Running,
  type Settings,
  type WifiStatus,
} from "./lib/api";
import { sortGames } from "./lib/format";
import { GameSheet } from "./components/GameSheet";
import { MonitorPanel } from "./components/MonitorPanel";
import { PowerMenu } from "./components/PowerMenu";
import { ProfilePanel } from "./components/ProfilePanel";
import { Session } from "./components/Session";
import { Splash } from "./components/Splash";
import { Stage } from "./components/Stage";
import { TopBar, type Tab } from "./components/TopBar";
import { Welcome } from "./components/Welcome";
import { WifiPanel } from "./components/WifiPanel";

type Panel = null | "wifi" | "monitor" | "profile" | "power" | "game";

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
  const [achievements, setAchievements] = useState<Record<string, Achievements | null>>({});
  const requested = useRef(new Set<string>());

  const notify = useCallback((text: string) => setToast(text), []);

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
  }, []);

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

  const counts = useMemo(
    () => ({
      all: games.length,
      steam: games.filter((g) => g.store === "steam").length,
      epic: games.filter((g) => g.store === "epic").length,
      local: games.filter((g) => g.store === "local").length,
    }),
    [games],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = games.filter((g) => (tab === "all" || g.store === tab) && (!needle || g.title.toLowerCase().includes(needle)));
    return sortGames(filtered, settings?.sort ?? "recent");
  }, [games, tab, query, settings?.sort]);

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

  // Teclado: flechas para recorrer la biblioteca, Enter para jugar, Esc para cerrar lo que esté abierto.
  useEffect(() => {
    if (!home || !splashDone) return;
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement;
      if (event.key === "Escape") {
        if (panel) setPanel(null);
        else if (typing) (event.target as HTMLInputElement).blur();
        return;
      }
      if (panel || typing || sessionGame) return;
      const index = focused ? visible.findIndex((g) => g.id === focused.id) : -1;
      if (event.key === "ArrowRight" && index < visible.length - 1) {
        setFocusId(visible[index + 1].id);
        event.preventDefault();
      } else if (event.key === "ArrowLeft" && index > 0) {
        setFocusId(visible[index - 1].id);
        event.preventDefault();
      } else if (event.key === "Enter" && focused && !(event.target instanceof HTMLButtonElement)) {
        play(focused);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [home, splashDone, panel, sessionGame, focused, visible, play]);

  const detailGame = panel === "game" ? focused : null;
  const emptyText = games.length === 0 ? "Tu biblioteca está vacía" : query ? `Nada coincide con «${query.trim()}»` : "No hay juegos en esta tienda";

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        {home && settings && boot && (
          <div className="home">
            <TopBar tab={tab} counts={counts} onTab={setTab} query={query} onQuery={setQuery} profile={profile} wifiOn={wifiOn} onOpen={setPanel} />
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
                />
              )}
              {panel === "wifi" && <WifiPanel key="wifi" onClose={() => setPanel(null)} onStatus={onWifiStatus} />}
              {panel === "monitor" && <MonitorPanel key="monitor" monitors={boot.monitors} settings={settings} onSettings={saveSettings} onClose={() => setPanel(null)} />}
              {panel === "profile" && (
                <ProfilePanel key="profile" boot={boot} profile={profile} settings={settings} guard={guard} onName={saveName} onAvatar={pickAvatar} onSettings={saveSettings} onClose={() => setPanel(null)} />
              )}
              {panel === "power" && <PowerMenu key="power" onAction={power} onClose={() => setPanel(null)} />}
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
