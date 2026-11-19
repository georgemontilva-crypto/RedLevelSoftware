import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Mark } from "../../Mark";

type Store = "steam" | "epic" | "local";
interface DemoGame {
  title: string;
  store: Store;
  hours: number;
  unlocked?: number;
  total?: number;
  last: string;
  colors: [string, string];
}

// Juegos inventados: sirven para enseñar cómo se ve la biblioteca.
const games: DemoGame[] = [
  { title: "Halcyon Drift", store: "steam", hours: 124, unlocked: 8, total: 25, last: "Jugaste hoy", colors: ["#17534b", "#081813"] },
  { title: "Emberfall", store: "steam", hours: 52, unlocked: 19, total: 30, last: "Jugaste ayer", colors: ["#7a2a12", "#1a0906"] },
  { title: "Nocturne Protocol", store: "epic", hours: 14, last: "Jugaste hace 3 días", colors: ["#274566", "#0b131d"] },
  { title: "Saltwind", store: "steam", hours: 22, unlocked: 11, total: 18, last: "Jugaste hace 6 días", colors: ["#46306e", "#120c1d"] },
  { title: "Tetra", store: "local", hours: 3, last: "Jugaste hace 9 días", colors: ["#664514", "#1a1106"] },
  { title: "Ironroot Tactics", store: "steam", hours: 264, unlocked: 27, total: 31, last: "Jugaste hace 2 semanas", colors: ["#3d4653", "#0e1116"] },
  { title: "Vanta Circuit", store: "epic", hours: 0, last: "Sin estrenar", colors: ["#6b1428", "#1c080e"] },
];

const tabs: { id: "all" | Store; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "steam", label: "Steam" },
  { id: "epic", label: "Epic" },
  { id: "local", label: "Locales" },
];
const storeName: Record<Store, string> = { steam: "Steam", epic: "Epic Games", local: "Instalado en este PC" };

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/// Red Level en pequeño y funcionando: filtrar por tienda, recorrer los juegos y "jugar".
export function Demo() {
  const [tab, setTab] = useState<"all" | Store>("all");
  const [focus, setFocus] = useState(games[0].title);
  const [playing, setPlaying] = useState<number | null>(null);
  const shown = useMemo(() => games.filter((g) => tab === "all" || g.store === tab), [tab]);
  const game = shown.find((g) => g.title === focus) ?? shown[0];

  useEffect(() => {
    if (playing === null) return;
    const timer = setInterval(() => setPlaying((s) => (s === null ? null : s + 1)), 1000);
    return () => clearInterval(timer);
  }, [playing !== null]);

  return (
    <div className="demo" aria-label="Demostración interactiva de Red Level">
      <div className="demo-screen">
        <div className="demo-glow" style={{ background: `radial-gradient(120% 90% at 78% 18%, ${game.colors[0]}, ${game.colors[1]} 62%, #000)` }} />
        <div className="demo-bar">
          <Mark size={22} />
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? "is-on" : ""} onClick={() => setTab(t.id)}>
              {t.label}
              <small>{games.filter((g) => t.id === "all" || g.store === t.id).length}</small>
              {tab === t.id && <motion.i layoutId="demo-line" />}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={game.title} className="demo-hero" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <span className="demo-store">{storeName[game.store]}</span>
            <strong>{game.title}</strong>
            <div className="demo-stats">
              <span>
                <small>Tiempo jugado</small>
                {game.hours} h
              </span>
              {game.total && (
                <span>
                  <small>Logros</small>
                  {game.unlocked} de {game.total}
                  <i className="demo-level">
                    <motion.b initial={{ scaleX: 0 }} animate={{ scaleX: (game.unlocked ?? 0) / game.total }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
                  </i>
                </span>
              )}
              <span>
                <small>Última partida</small>
                <em>{game.last}</em>
              </span>
            </div>
            <button className="demo-play" onClick={() => setPlaying(0)}>
              ▶ Jugar
            </button>
          </motion.div>
        </AnimatePresence>

        <div className="demo-shelf">
          {shown.map((g) => (
            <button
              key={g.title}
              className={g.title === game.title ? "is-on" : ""}
              style={{ background: `linear-gradient(160deg, ${g.colors[0]}, ${g.colors[1]} 78%)` }}
              onMouseEnter={() => setFocus(g.title)}
              onFocus={() => setFocus(g.title)}
              onClick={() => setFocus(g.title)}
              aria-label={g.title}
            >
              <b aria-hidden="true">{g.title[0]}</b>
              <span>{g.title}</span>
            </button>
          ))}
        </div>

        <AnimatePresence>
          {playing !== null && (
            <motion.div className="demo-playing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="demo-store">Jugando ahora</span>
              <strong>{game.title}</strong>
              <b>{clock(playing)}</b>
              <p>Red Level cuenta el tiempo y vuelve solo cuando cierras el juego.</p>
              <button className="demo-play is-quiet" onClick={() => setPlaying(null)}>
                Cerrar el juego
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="fine center">Juegos de muestra. En tu PC verás los tuyos, con sus carátulas.</p>
    </div>
  );
}
