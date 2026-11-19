import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { Achievements, Game, Running } from "../lib/api";
import { clock, playtime } from "../lib/format";
import { Cover } from "./Art";

function useElapsed(since: number): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    // El reloj va segundo a segundo solo si Red Level está delante. Detrás del juego nadie lo mira:
    // se pone al día cada medio minuto y, entre tanto, la pantalla no se vuelve a dibujar.
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      if (document.hasFocus() || ticks % 30 === 0) setNow(Date.now() / 1000);
    }, 1000);
    const catchUp = () => setNow(Date.now() / 1000);
    window.addEventListener("focus", catchUp);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", catchUp);
    };
  }, []);
  return now - since;
}

function Timer({ since }: { since: number }) {
  return <p className="session-clock">{clock(useElapsed(since))}</p>;
}

interface Props {
  game: Game;
  running: Running | null;
  achievements: Achievements | null | undefined;
  onBrowse: () => void;
  onCancel: () => void;
}

/// Pantalla mientras un juego se abre o está abierto. Queda detrás del juego, tapando el escritorio.
export function Session({ game, running, achievements, onBrowse, onCancel }: Props) {
  return (
    <motion.div className="session" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
      <motion.div className="session-cover" initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
        <Cover game={game} />
      </motion.div>
      <div className="session-text">
        <p className="hero-store">{running ? "Jugando ahora" : "Abriendo"}</p>
        <h2 className={`hero-title ${game.title.length > 22 ? "is-long" : ""}`}>{game.title}</h2>
        {running ? <Timer since={running.since} /> : <div className="session-wait" aria-hidden="true" />}
        <p className="muted">
          Llevas {playtime(game.minutes)} en este juego
          {achievements ? ` y ${achievements.unlocked} de ${achievements.total} logros.` : "."}
        </p>
        <div className="hero-actions">
          {running ? (
            <button className="btn btn-ghost" onClick={onBrowse}>
              Ver la biblioteca
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={onCancel}>
              Volver
            </button>
          )}
        </div>
        {running && <p className="muted small">Red Level vuelve solo cuando cierres el juego.</p>}
      </div>
    </motion.div>
  );
}
