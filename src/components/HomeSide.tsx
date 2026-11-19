import { ChevronRight, Coins, Play, Plus, Trophy, Users } from "lucide-react";
import { api, type Achievements, type Game } from "../lib/api";
import { lastPlayed, playtime, storeNames } from "../lib/format";
import type { FeedUpcoming, Social } from "../lib/online";
import { Backdrop, Cover } from "./Art";

interface Props {
  social: Social;
  focused: Game | null;
  achievements: Achievements | null | undefined;
  upcoming: FeedUpcoming[];
  onPlay: (game: Game) => void;
  onOpen: (panel: "store" | "friends" | "profile" | "news") => void;
  onDetails: (game: Game) => void;
}

/// Columna derecha de la pantalla principal: el wallet, lo próximo que sale y el juego elegido, listo para jugar.
export function HomeSide({ social, focused, achievements, upcoming, onPlay, onOpen, onDetails }: Props) {
  const signedIn = social.status === "in";
  const percent = achievements && achievements.total > 0 ? Math.round((achievements.unlocked / achievements.total) * 100) : null;

  return (
    <aside className="side" aria-label="Tu wallet, próximos lanzamientos y el juego elegido">
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

      {upcoming.length > 0 && (
        <section className="side-card">
          <header>
            <h3>
              Lanzamientos <small>{upcoming.length} próximos</small>
            </h3>
            <button onClick={() => onOpen("news")}>Ver todos</button>
          </header>
          <ul className="side-releases">
            {upcoming.slice(0, 3).map((item) => (
              <li key={item.id}>
                <button onClick={() => void api.openUrl(item.url).catch(() => {})}>
                  <span className="side-thumb">{item.image && <img src={item.image} alt="" loading="lazy" />}</span>
                  <span>
                    <b>{item.name}</b>
                    <em>{item.date}</em>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {focused && (
        <section className="side-card side-game">
          <span className="side-art">
            <Backdrop game={focused} />
          </span>
          <div className="side-game-head">
            <b>{focused.title}</b>
            <button className="btn btn-play btn-small" onClick={() => onPlay(focused)}>
              <Play size={15} aria-hidden="true" /> Jugar
            </button>
          </div>
          <small>
            {storeNames[focused.store]} · {focused.minutes > 0 ? `${playtime(focused.minutes)} jugadas` : "Sin estrenar"} · {lastPlayed(focused.lastPlayed)}
          </small>
          {percent !== null && achievements && (
            <span className="side-progress" title={`${achievements.unlocked} de ${achievements.total} logros`}>
              <Trophy size={14} aria-hidden="true" />
              <i>
                <i style={{ width: `${percent}%` }} />
              </i>
              {achievements.unlocked} de {achievements.total}
            </span>
          )}
          <button className="btn btn-ghost btn-small" onClick={() => onDetails(focused)}>
            Detalles y logros
          </button>
        </section>
      )}
    </aside>
  );
}

/// Tira de amigos, al borde derecho: quién está, quién te ha escrito, y un toque para abrir el chat.
export function BuddyRail({ social, onOpen }: { social: Social; onOpen: () => void }) {
  const friends = [...social.friends].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, "es")).slice(0, 7);
  const pending = social.requests.length;
  return (
    <nav className="buddies" aria-label="Amigos">
      <button className="buddies-head has-badge" onClick={onOpen} aria-label={pending > 0 ? `Amigos: ${pending} solicitudes` : "Abrir amigos"}>
        <Users size={20} aria-hidden="true" />
        {pending > 0 && <b className="badge">{pending}</b>}
      </button>
      {friends.map((friend) => (
        <button key={friend.id} className="has-badge" onClick={onOpen} title={friend.playing ? `${friend.name} · Jugando ${friend.playing}` : friend.name} aria-label={`Chat con ${friend.name}`}>
          <span className={`side-face ${friend.online ? "is-on" : ""}`}>{friend.avatarId ? <img src={social.avatarUrl(friend.avatarId)} alt="" /> : friend.name.slice(0, 1).toUpperCase()}</span>
          {(social.unread[friend.id] ?? 0) > 0 && <b className="badge">{social.unread[friend.id]}</b>}
        </button>
      ))}
      <button className="buddies-add" onClick={onOpen} aria-label="Añadir un amigo" title="Añadir un amigo">
        <Plus size={18} aria-hidden="true" />
      </button>
    </nav>
  );
}

/// Barra de "seguir jugando": lo último que se jugó, con su botón para abrirlo.
export function ResumeBar({ games, onPlay }: { games: Game[]; onPlay: (game: Game) => void }) {
  const last = games.filter((g) => g.lastPlayed).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0];
  if (!last) return null;
  return (
    <section className="resume" aria-label="Seguir jugando">
      <span className="resume-cover">
        <Cover game={last} />
      </span>
      <div className="resume-text">
        <small>Seguir jugando</small>
        <b>{last.title}</b>
      </div>
      <div className="resume-time">
        <b>{playtime(last.minutes)}</b>
        <small>{lastPlayed(last.lastPlayed)}</small>
      </div>
      <button className="side-play" onClick={() => onPlay(last)} aria-label={`Jugar a ${last.title}`}>
        <Play size={18} aria-hidden="true" />
      </button>
    </section>
  );
}
