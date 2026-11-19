import { useState } from "react";
import { Eye, EyeOff, ImagePlus, Lock, PackageX, Pencil, Play, Trash2, Trophy } from "lucide-react";
import { MILESTONES, type Achievements, type Game, type LibraryMeta } from "../lib/api";
import { diskSize, lastPlayed, playtime, shortDate, storeNames } from "../lib/format";
import { Cover } from "./Art";
import { Drawer } from "./Drawer";
import { CloudSaves } from "./CloudSaves";
import type { Cloud } from "../lib/online";

interface Props {
  game: Game;
  achievements: Achievements | null | undefined;
  onClose: () => void;
  onPlay: (game: Game) => void;
  onRename: (game: Game, title: string) => void;
  onCover: (game: Game) => void;
  onRemove: (game: Game) => void;
  meta: LibraryMeta;
  onHide: (game: Game, hide: boolean) => void;
  onToggleCollection: (collection: string, game: Game) => void;
  onNewCollection: (name: string, game: Game) => void;
  /// Pone en marcha la desinstalación y devuelve qué va a pasar.
  onUninstall: (game: Game) => Promise<string | null>;
  cloud: Cloud;
  signedIn: boolean;
  saveFolder: string | undefined;
  onSaveFolders: (folders: Record<string, string>) => void;
}

export function GameSheet({ game, achievements, onClose, onPlay, onRename, onCover, onRemove, meta, onHide, onToggleCollection, onNewCollection, onUninstall, cloud, signedIn, saveFolder, onSaveFolders }: Props) {
  const [title, setTitle] = useState(game.title);
  const [confirming, setConfirming] = useState(false);
  const [library, setLibrary] = useState("");
  const [uninstalling, setUninstalling] = useState(false);
  const [uninstallNote, setUninstallNote] = useState<string | null>(null);
  const isHidden = meta.hidden.includes(game.id);
  const reached = MILESTONES.filter((m) => game.minutes >= m.minutes).length;
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
        <h4>Organizar</h4>
        <div className="row">
          <button className="btn btn-ghost" onClick={() => onHide(game, !isHidden)}>
            {isHidden ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
            {isHidden ? "Volver a mostrar" : "Ocultar de la biblioteca"}
          </button>
          {uninstalling ? (
            <button
              className="btn btn-danger"
              onClick={async () => {
                setUninstallNote(await onUninstall(game));
                setUninstalling(false);
              }}
            >
              Sí, desinstalar
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={() => setUninstalling(true)}>
              <PackageX size={16} aria-hidden="true" />
              Desinstalar
            </button>
          )}
        </div>
        {uninstallNote && <p className="note">{uninstallNote}</p>}
        <ul className="checks">
          {meta.collections.map((collection) => (
            <li key={collection.id}>
              <label>
                <input type="checkbox" checked={collection.games.includes(game.id)} onChange={() => onToggleCollection(collection.id, game)} />
                {collection.name}
              </label>
            </li>
          ))}
        </ul>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (library.trim()) onNewCollection(library.trim(), game);
            setLibrary("");
          }}
        >
          <input className="field" value={library} onChange={(e) => setLibrary(e.target.value)} placeholder="Nueva biblioteca con este juego" aria-label="Nombre de la biblioteca nueva" maxLength={30} />
          <button className="btn btn-ghost" type="submit" disabled={!library.trim()}>
            Crear
          </button>
        </form>
      </section>

      <CloudSaves game={game} cloud={cloud} signedIn={signedIn} folder={saveFolder} onFolders={onSaveFolders} />

      <section className="sheet-section">
        <h4>Logros de Red Level</h4>
        <div className="sheet-progress">
          <span>
            {reached} de {MILESTONES.length}
          </span>
          <div className="level">
            <span style={{ transform: `scaleX(${reached / MILESTONES.length})` }} />
          </div>
        </div>
        <ul className="achievements">
          {MILESTONES.map((milestone) => {
            const done = game.minutes >= milestone.minutes;
            return (
              <li key={milestone.id} className={done ? "is-unlocked" : ""}>
                <span className="ach-icon">{done ? <Trophy size={17} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}</span>
                <span className="ach-text">
                  <strong>{milestone.name}</strong>
                  <small>{done ? "Conseguido" : `Te faltan ${playtime(milestone.minutes - game.minutes)}`}</small>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="sheet-section">
        <h4>{game.store === "steam" ? "Logros de Steam" : "Logros de la tienda"}</h4>
        {achievements === undefined && game.hasAchievements && <p className="muted">Leyendo los logros…</p>}
        {achievements === null && game.hasAchievements && <p className="muted">Steam todavía no ha guardado los logros de este juego en el PC. Ábrelo una vez y vuelve.</p>}
        {!game.hasAchievements && (
          <p className="muted">
            {game.store === "steam"
              ? "Este juego no tiene logros, o Steam aún no los ha descargado. Ábrelo una vez y vuelve."
              : game.store === "epic"
                ? "Epic no comparte los logros con otras apps."
                : "Este juego no viene de una tienda con logros. Los suyos son los de Red Level, arriba."}
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
