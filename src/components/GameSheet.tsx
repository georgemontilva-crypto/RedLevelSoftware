import { useState } from "react";
import { EyeOff, ImagePlus, Lock, Pencil, Play, Trash2, Trophy } from "lucide-react";
import type { Achievements, Game } from "../lib/api";
import { diskSize, lastPlayed, playtime, shortDate, storeNames } from "../lib/format";
import { Cover } from "./Art";
import { Drawer } from "./Drawer";

interface Props {
  game: Game;
  achievements: Achievements | null | undefined;
  onClose: () => void;
  onPlay: (game: Game) => void;
  onRename: (game: Game, title: string) => void;
  onCover: (game: Game) => void;
  onRemove: (game: Game) => void;
}

export function GameSheet({ game, achievements, onClose, onPlay, onRename, onCover, onRemove }: Props) {
  const [title, setTitle] = useState(game.title);
  const [confirming, setConfirming] = useState(false);
  const size = diskSize(game.sizeBytes);

  return (
    <Drawer title={game.title} wide onClose={onClose}>
      <div className="sheet-top">
        <div className="sheet-cover">
          <Cover game={game} />
        </div>
        <div className="sheet-facts">
          <p className="hero-store">{storeNames[game.store]}</p>
          <p className="sheet-hours">{playtime(game.minutes)}</p>
          <p className="muted">{lastPlayed(game.lastPlayed)}</p>
          {size && <p className="muted">Ocupa {size}</p>}
          <button className="btn btn-play" onClick={() => onPlay(game)}>
            <Play size={18} fill="currentColor" aria-hidden="true" />
            Jugar
          </button>
        </div>
      </div>

      {game.hoursSource === "redlevel" && (
        <p className="note">
          {game.store === "epic" ? "Epic no comparte las horas con otras apps." : "Este juego no viene de una tienda."} Red Level cuenta el tiempo desde que lo
          instalaste, siempre que esté abierto mientras juegas.
        </p>
      )}

      {game.store === "local" && (
        <section className="sheet-section">
          <h4>Este juego</h4>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim() && title.trim() !== game.title) onRename(game, title.trim());
            }}
          >
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Nombre del juego" maxLength={80} />
            <button className="btn btn-ghost" type="submit" disabled={!title.trim() || title.trim() === game.title}>
              <Pencil size={16} aria-hidden="true" />
              Guardar nombre
            </button>
          </form>
          <div className="row">
            <button className="btn btn-ghost" onClick={() => onCover(game)}>
              <ImagePlus size={16} aria-hidden="true" />
              Cambiar carátula
            </button>
            {confirming ? (
              <button className="btn btn-danger" onClick={() => onRemove(game)}>
                Sí, quitar de Red Level
              </button>
            ) : (
              <button className="btn btn-ghost" onClick={() => setConfirming(true)}>
                <Trash2 size={16} aria-hidden="true" />
                Quitar de la biblioteca
              </button>
            )}
          </div>
          {confirming && <p className="note">Solo se quita de Red Level. El juego sigue instalado en tu PC.</p>}
        </section>
      )}

      <section className="sheet-section">
        <h4>Logros</h4>
        {achievements === undefined && game.hasAchievements && <p className="muted">Leyendo los logros…</p>}
        {achievements === null && game.hasAchievements && <p className="muted">Steam todavía no ha guardado los logros de este juego en el PC. Ábrelo una vez y vuelve.</p>}
        {!game.hasAchievements && (
          <p className="muted">
            {game.store === "steam"
              ? "Este juego no tiene logros, o Steam aún no los ha descargado. Ábrelo una vez y vuelve."
              : game.store === "epic"
                ? "Epic no comparte los logros con otras apps."
                : "Los juegos locales no tienen logros."}
          </p>
        )}
        {achievements && (
          <>
            <div className="sheet-progress">
              <span>
                {achievements.unlocked} de {achievements.total}
              </span>
              <div className="level">
                <span style={{ transform: `scaleX(${achievements.unlocked / achievements.total})` }} />
              </div>
            </div>
            <ul className="achievements">
              {achievements.items.map((item, i) => {
                const secret = item.hidden && !item.unlocked;
                return (
                  <li key={i} className={item.unlocked ? "is-unlocked" : ""}>
                    <span className="ach-icon">
                      {item.iconUrl && !secret ? (
                        <img src={item.iconUrl} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
                      ) : secret ? (
                        <EyeOff size={18} aria-hidden="true" />
                      ) : item.unlocked ? (
                        <Trophy size={17} aria-hidden="true" />
                      ) : (
                        <Lock size={16} aria-hidden="true" />
                      )}
                    </span>
                    <span className="ach-text">
                      <strong>{secret ? "Logro oculto" : item.name}</strong>
                      <small>{secret ? "Sigue jugando para descubrirlo." : item.description}</small>
                    </span>
                    {item.unlocked && <time>{item.unlockedAt ? shortDate(item.unlockedAt) : "Conseguido"}</time>}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </Drawer>
  );
}
