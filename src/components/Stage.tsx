import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Eye, EyeOff, Play, Plus, Trophy } from "lucide-react";
import type { Achievements, Game, Settings } from "../lib/api";
import { lastPlayed, playtime, storeNames } from "../lib/format";
import { Backdrop, Cover } from "./Art";

interface Props {
  games: Game[];
  focused: Game | null;
  achievements: Achievements | null | undefined;
  onFocus: (id: string) => void;
  onPlay: (game: Game) => void;
  onDetails: (game: Game) => void;
  onAddLocal: () => void;
  showAdd: boolean;
  emptyText: string;
  view: Settings["view"];
  /// El juego elegido está oculto (se está viendo la sección de ocultos).
  hidden: boolean;
  onHide: (game: Game, hide: boolean) => void;
}

export function Stage({ games, focused, achievements, onFocus, onPlay, onDetails, onAddLocal, showAdd, emptyText, view, hidden, onHide }: Props) {
  const shelf = useRef<HTMLDivElement>(null);

  // La rueda del ratón mueve la fila de carátulas de lado.
  useEffect(() => {
    const el = shelf.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      // En cuadrícula y en lista la rueda baja por la página, como siempre.
      if (el.dataset.view !== "shelf") return;
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        el.scrollLeft += event.deltaY;
        event.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (!focused) return;
    shelf.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(focused.id)}"]`)?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [focused?.id]);

  const percent = achievements && achievements.total > 0 ? Math.round((achievements.unlocked / achievements.total) * 100) : 0;

  return (
    <main className={`stage is-${view}`}>
      <div className="backdrop" aria-hidden="true">
        <AnimatePresence>
          {focused && (
            <motion.div key={focused.id} className="backdrop-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
              <Backdrop game={focused} />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="backdrop-shade" />
      </div>

      <section className="hero" aria-live="polite">
        <AnimatePresence mode="wait">
          {focused ? (
            <motion.div
              key={focused.id}
              className="hero-inner"
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <p className="hero-store">{storeNames[focused.store]}</p>
              <h2 className={`hero-title ${focused.title.length > 22 ? "is-long" : ""}`}>{focused.title}</h2>
              <dl className="stats">
                <div>
                  <dt>Tiempo jugado</dt>
                  <dd>{playtime(focused.minutes)}</dd>
                </div>
                {achievements && (
                  <div className="stat-level">
                    <dt>Logros</dt>
                    <dd>
                      {achievements.unlocked} de {achievements.total}
                    </dd>
                    <div className="level" role="img" aria-label={`${percent}% de los logros`}>
                      <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: percent / 100 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.12 }} />
                    </div>
                  </div>
                )}
                <div>
                  <dt>Última partida</dt>
                  <dd className="stat-soft">{lastPlayed(focused.lastPlayed)}</dd>
                </div>
              </dl>
              <div className="hero-actions">
                <button className="btn btn-play" onClick={() => onPlay(focused)}>
                  <Play size={20} fill="currentColor" aria-hidden="true" />
                  Jugar
                </button>
                <button className="btn btn-ghost" onClick={() => onDetails(focused)}>
                  {focused.hasAchievements && <Trophy size={18} aria-hidden="true" />}
                  {focused.hasAchievements ? "Ver logros" : "Detalles"}
                </button>
                <button className="btn btn-ghost btn-icon" onClick={() => onHide(focused, !hidden)} aria-label={hidden ? "Volver a mostrar este juego" : "Ocultar este juego"} title={hidden ? "Volver a mostrar" : "Ocultar de la biblioteca"}>
                  {hidden ? <Eye size={19} /> : <EyeOff size={19} />}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="empty" className="hero-inner hero-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h2 className="hero-title is-long">{emptyText}</h2>
              <p className="hero-hint">Red Level busca solo los juegos de Steam y Epic. Los demás los añades tú con su ejecutable.</p>
              <div className="hero-actions">
                <button className="btn btn-play" onClick={onAddLocal}>
                  <Plus size={20} aria-hidden="true" />
                  Añadir un juego
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <div className={view === "list" ? "game-list" : `shelf ${view === "grid" ? "is-grid" : ""}`} data-view={view} ref={shelf} role="listbox" aria-label="Biblioteca">
        {games.map((game) =>
          view === "list" ? (
            <button
              key={game.id}
              data-id={game.id}
              role="option"
              aria-selected={focused?.id === game.id}
              className={`game-row ${focused?.id === game.id ? "is-focused" : ""}`}
              onClick={() => (focused?.id === game.id ? onDetails(game) : onFocus(game.id))}
              onDoubleClick={() => onPlay(game)}
            >
              <span className="game-row-art">
                <Cover game={game} />
              </span>
              <strong>{game.title}</strong>
              <span>{storeNames[game.store]}</span>
              <span>{playtime(game.minutes)}</span>
              <span>{lastPlayed(game.lastPlayed)}</span>
            </button>
          ) : (
            <button
              key={game.id}
              data-id={game.id}
              role="option"
              aria-selected={focused?.id === game.id}
              className={`tile ${focused?.id === game.id ? "is-focused" : ""}`}
              onClick={() => (focused?.id === game.id ? onDetails(game) : onFocus(game.id))}
              onDoubleClick={() => onPlay(game)}
              title={game.title}
            >
              <span className="tile-art">
                <Cover game={game} />
              </span>
              <span className="tile-level" />
            </button>
          ),
        )}
        {showAdd && games.length > 0 && view !== "list" && (
          <button className="tile tile-add" onClick={onAddLocal}>
            <span className="tile-art">
              <Plus size={30} aria-hidden="true" />
              <span>Añadir un juego</span>
            </span>
          </button>
        )}
      </div>
    </main>
  );
}
