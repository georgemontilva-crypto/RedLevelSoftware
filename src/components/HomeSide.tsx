import { ChevronRight, Coins, Play, Trophy, UserPlus } from "lucide-react";
import type { Achievements, Game } from "../lib/api";
import { playtime, storeNames } from "../lib/format";
import type { Social } from "../lib/online";
import { Cover } from "./Art";

interface Props {
  social: Social;
  focused: Game | null;
  /// Toda la biblioteca, para el resumen y para seguir con lo último que se jugó.
  games: Game[];
  onPlay: (game: Game) => void;
  achievements: Achievements | null | undefined;
  onOpen: (panel: "store" | "friends" | "profile") => void;
  onDetails: (game: Game) => void;
}

/// Columna derecha de la pantalla principal: el wallet, los amigos y el juego elegido, siempre a la vista.
export function HomeSide({ social, focused, achievements, games, onPlay, onOpen, onDetails }: Props) {
  const last = games.filter((g) => g.lastPlayed).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0] ?? null;
  const totalMinutes = games.reduce((sum, g) => sum + g.minutes, 0);
  const signedIn = social.status === "in";
  const friends = [...social.friends].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, "es")).slice(0, 5);
  const online = social.friends.filter((f) => f.online).length;
  const percent = achievements && achievements.total > 0 ? Math.round((achievements.unlocked / achievements.total) * 100) : null;

  return (
    <aside className="side" aria-label="Tu cuenta y tus amigos">
      <button className="side-wallet" onClick={() => onOpen(signedIn ? "profile" : "store")}>
        <small>{signedIn ? "Tu wallet" : "Red Level Store"}</small>
        <strong>
          {signedIn ? (
            <>
              <Coins size={22} aria-hidden="true" /> {social.wallet.balance.toLocaleString("es")} <em>RLC</em>
            </>
          ) : (
            "Temas e interfaces"
          )}
        </strong>
        <span>
          {signedIn ? "Ver saldo y movimientos" : "Personaliza tu Red Level"} <ChevronRight size={16} aria-hidden="true" />
        </span>
      </button>

      <section className="side-card">
        <header>
          <h3>
            Amigos {signedIn && social.friends.length > 0 && <small>{online} en línea</small>}
          </h3>
          <button onClick={() => onOpen("friends")}>{social.friends.length > 0 ? "Ver todos" : "Abrir"}</button>
        </header>
        {friends.length > 0 ? (
          <ul className="side-friends">
            {friends.map((friend) => (
              <li key={friend.id}>
                <button onClick={() => onOpen("friends")}>
                  <span className={`side-face ${friend.online ? "is-on" : ""}`}>
                    {friend.avatarId ? <img src={social.avatarUrl(friend.avatarId)} alt="" /> : friend.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="side-friend-text">
                    <b>{friend.name}</b>
                    <small>{friend.playing ? `Jugando ${friend.playing}` : friend.online ? "En línea" : "Desconectado"}</small>
                  </span>
                  {(social.unread[friend.id] ?? 0) > 0 && <b className="badge">{social.unread[friend.id]}</b>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <button className="side-empty" onClick={() => onOpen("friends")}>
            <UserPlus size={20} aria-hidden="true" />
            <span>{signedIn ? "Añade a tus amigos con su código y chatea con ellos desde aquí." : "Inicia sesión para añadir amigos y chatear."}</span>
          </button>
        )}
      </section>

      {focused && (
        <section className="side-card side-game">
          <span className="side-cover">
            <Cover game={focused} />
          </span>
          <div className="side-game-text">
            <small>{storeNames[focused.store]}</small>
            <b>{focused.title}</b>
            <span>{focused.minutes > 0 ? `${playtime(focused.minutes)} jugadas` : "Sin estrenar"}</span>
            {percent !== null && achievements && (
              <span className="side-progress" title={`${achievements.unlocked} de ${achievements.total} logros`}>
                <Trophy size={14} aria-hidden="true" />
                <i>
                  <i style={{ width: `${percent}%` }} />
                </i>
                {percent}%
              </span>
            )}
          </div>
          <button className="btn btn-ghost btn-small" onClick={() => onDetails(focused)}>
            Detalles
          </button>
        </section>
      )}
      {last && (
        <section className="side-card side-resume">
          <header>
            <h3>Seguir jugando</h3>
          </header>
          <div className="side-resume-row">
            <span className="side-cover">
              <Cover game={last} />
            </span>
            <span className="side-friend-text">
              <b>{last.title}</b>
              <small>{playtime(last.minutes)} jugadas</small>
            </span>
            <button className="side-play" onClick={() => onPlay(last)} aria-label={`Jugar a ${last.title}`}>
              <Play size={18} aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      <dl className="side-totals">
        <div>
          <dt>Juegos</dt>
          <dd>{games.length}</dd>
        </div>
        <div>
          <dt>Tiempo jugado</dt>
          <dd>{playtime(totalMinutes)}</dd>
        </div>
      </dl>
    </aside>
  );
}
