import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Coins, Gamepad2, Play, Target, X } from "lucide-react";
import { api, type Game } from "../lib/api";
import { plainName, type Mission, type Social } from "../lib/online";
import { Screen, type ScreenTab } from "./Screen";

const tabs: ScreenTab[] = [
  { id: "all", label: "Todas las misiones", icon: Target },
  { id: "claimed", label: "Reclamadas", icon: BadgeCheck },
];

const rlc = (amount: number) => `${amount.toLocaleString("es")} RLC`;

/// "15 min", "45 s", "1 h 30 min".
function span(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function ends(at: number | null): string | null {
  if (at === null) return null;
  return `Termina el ${new Date(at * 1000).toLocaleDateString("es", { day: "numeric", month: "numeric" })}`;
}

/// Qué pide la misión, en una frase, por si el patrocinante no escribió ninguna.
const ask = (mission: Mission) => (mission.kind === "video" ? `Mira el vídeo (${span(mission.goalSeconds)}) y gana ${rlc(mission.reward)}.` : `Juega a ${mission.game} durante ${span(mission.goalSeconds)} y gana ${rlc(mission.reward)}.`);

/// El vídeo de una misión. Solo cuenta el tiempo que de verdad se reproduce: en pausa o adelantando no suma.
function VideoMission({ mission, social, onClose, onError }: { mission: Mission; social: Social; onClose: () => void; onError: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const pending = useRef(0);
  const [claiming, setClaiming] = useState(false);
  const done = mission.seconds >= mission.goalSeconds;

  useEffect(() => {
    const flush = () => {
      const seconds = pending.current;
      if (seconds <= 0) return;
      pending.current = 0;
      social.missions.progress(mission.id, seconds).catch(() => {});
    };
    const timer = setInterval(() => {
      const player = video.current;
      if (player && !player.paused && !player.ended && player.readyState > 2) pending.current += 1;
      // Cada cinco segundos vistos se le cuenta al servidor.
      if (pending.current >= 5) flush();
    }, 1000);
    return () => {
      clearInterval(timer);
      flush();
    };
  }, [mission.id]);

  return (
    <div className="mission-player" role="dialog" aria-label={`Vídeo de la misión ${mission.title}`}>
      <div className="mission-player-box">
        <button className="icon-btn mission-player-close" onClick={onClose} aria-label="Cerrar el vídeo">
          <X size={22} />
        </button>
        {/* El vídeo lo aloja el patrocinante: se reproduce tal cual, con sus controles. */}
        <video ref={video} src={mission.video ?? undefined} poster={mission.image} controls autoPlay playsInline onError={() => onError("El vídeo de esta misión no se pudo cargar.")} />
        <footer>
          <div>
            <strong>{mission.title}</strong>
            <small>
              Patrocinado por <b>{mission.sponsor}</b> · {done ? "Misión cumplida" : `Llevas ${span(mission.seconds)} de ${span(mission.goalSeconds)}`}
            </small>
          </div>
          <div className="mission-bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (mission.seconds / mission.goalSeconds) * 100)}%` }} />
          </div>
          <button
            className="btn btn-play"
            disabled={!done || mission.claimed || claiming}
            onClick={async () => {
              setClaiming(true);
              await social.missions
                .claim(mission.id)
                .then(onClose)
                .catch((e) => onError(e instanceof Error ? e.message : "No se pudo reclamar."));
              setClaiming(false);
            }}
          >
            <Coins size={17} aria-hidden="true" />
            {mission.claimed ? "Reclamada" : `Reclamar ${rlc(mission.reward)}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

interface CardProps {
  mission: Mission;
  big: boolean;
  owned: Game | null;
  playingIt: boolean;
  busy: boolean;
  onAccept: () => void;
  onWatch: () => void;
  onClaim: () => void;
  onPlay: () => void;
}

function Card({ mission, big, owned, playingIt, busy, onAccept, onWatch, onClaim, onPlay }: CardProps) {
  const [broken, setBroken] = useState(false);
  const done = mission.seconds >= mission.goalSeconds;
  const deadline = ends(mission.endsAt);
  const Kind = mission.kind === "video" ? Play : Gamepad2;

  let action: { label: string; run?: () => void; quiet?: boolean };
  if (mission.claimed) action = { label: "Reclamada" };
  else if (done) action = mission.soldOut ? { label: "Recompensas agotadas" } : { label: `Reclamar ${rlc(mission.reward)}`, run: onClaim };
  else if (mission.soldOut) action = { label: "Recompensas agotadas" };
  else if (mission.kind === "video") action = { label: mission.seconds > 0 ? `Seguir viendo · faltan ${span(mission.goalSeconds - mission.seconds)}` : `Ver ${span(mission.goalSeconds)}`, run: onWatch };
  else if (!mission.accepted) action = { label: "Aceptar misión", run: onAccept };
  else if (playingIt) action = { label: "Contando mientras juegas" };
  else if (owned) action = { label: "Jugar ahora", run: onPlay };
  else action = { label: `Abre ${mission.game} para avanzar` };

  return (
    <li className={`mission${big ? " is-big" : ""}${mission.claimed ? " is-claimed" : ""}`}>
      <span className="mission-art">
        {!broken ? <img src={mission.image} alt="" loading="lazy" onError={() => setBroken(true)} /> : <Target size={40} aria-hidden="true" />}
        <b className="mission-kind">
          <Kind size={14} aria-hidden="true" />
          {mission.kind === "video" ? "Vídeo" : "Jugar"}
        </b>
      </span>
      <div className="mission-text">
        <small>
          Patrocinado por <b>{mission.sponsor}</b>
          {deadline && <> · {deadline}</>}
        </small>
        <strong>{mission.title}</strong>
        <span className="mission-reward">
          <Coins size={17} aria-hidden="true" />
          {rlc(mission.reward)}
        </span>
        <p>{mission.body || ask(mission)}</p>
        {mission.accepted && !mission.claimed && (
          <div className="mission-progress">
            <div className="mission-bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (mission.seconds / mission.goalSeconds) * 100)}%` }} />
            </div>
            <span>{done ? "Misión cumplida" : `${span(mission.seconds)} de ${span(mission.goalSeconds)}`}</span>
          </div>
        )}
        <div className="mission-actions">
          {mission.link && (
            <button className="btn btn-ghost btn-small" onClick={() => void api.openUrl(mission.link!).catch(() => {})}>
              {mission.linkLabel ?? "Más información"}
            </button>
          )}
          <button className={`btn btn-small ${action.run ? "btn-play" : "btn-ghost"}`} disabled={!action.run || busy} onClick={action.run}>
            {action.label}
          </button>
        </div>
      </div>
    </li>
  );
}

interface Props {
  social: Social;
  games: Game[];
  /// Título del juego abierto ahora, si hay alguno.
  playing: string | null;
  onPlay: (game: Game) => void;
  onNotify: (text: string) => void;
  onClose: () => void;
}

/// Misiones de los patrocinantes: jugar un rato a un juego o ver un vídeo, y cobrar RLC por ello.
export function MissionsScreen({ social, games, playing, onPlay, onNotify, onClose }: Props) {
  const [tab, setTab] = useState("all");
  const [busy, setBusy] = useState<number | null>(null);
  const [watching, setWatching] = useState<number | null>(null);
  const missions = social.missions.list;
  const shown = tab === "claimed" ? missions.filter((m) => m.claimed) : missions.filter((m) => !m.claimed);
  const watched = missions.find((m) => m.id === watching) ?? null;
  const ownedFor = (mission: Mission) => (mission.game ? (games.find((g) => plainName(g.title).includes(plainName(mission.game!))) ?? null) : null);

  const guard = async (id: number, work: () => Promise<unknown>) => {
    setBusy(id);
    await work().catch((e) => onNotify(e instanceof Error ? e.message : "No se pudo completar. Inténtalo de nuevo."));
    setBusy(null);
  };

  return (
    <Screen
      title="Misiones"
      tabs={tabs}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
      aside={
        social.status === "in" ? (
          <p className="wallet-chip" aria-label={`Tu wallet: ${rlc(social.wallet.balance)}`}>
            <Coins size={17} aria-hidden="true" />
            {rlc(social.wallet.balance)}
          </p>
        ) : undefined
      }
    >
      <h3 className="screen-title">{tab === "claimed" ? "Misiones reclamadas" : "Todas las misiones"}</h3>
      {social.status !== "in" ? (
        <p className="note">Las misiones van con tu cuenta de Red Level: entra en ella para verlas y cobrar sus recompensas.</p>
      ) : shown.length === 0 ? (
        <p className="muted">{tab === "claimed" ? "Todavía no has reclamado ninguna misión." : "Ahora mismo no hay misiones. Cuando un patrocinante proponga una, aparece aquí al momento."}</p>
      ) : (
        <>
          {tab === "all" && <p className="muted">Cumple lo que pide cada patrocinante y cobra la recompensa en tu wallet. Las de jugar cuentan solas mientras juegas.</p>}
          <ul className="missions">
            {shown.map((mission, index) => {
              const owned = ownedFor(mission);
              return (
                <Card
                  key={mission.id}
                  mission={mission}
                  big={tab === "all" && index === 0}
                  owned={owned}
                  playingIt={Boolean(playing && mission.game && plainName(playing).includes(plainName(mission.game)))}
                  busy={busy === mission.id}
                  onAccept={() => void guard(mission.id, () => social.missions.accept(mission.id))}
                  onWatch={() =>
                    void guard(mission.id, async () => {
                      if (!mission.accepted) await social.missions.accept(mission.id);
                      setWatching(mission.id);
                    })
                  }
                  onClaim={() => void guard(mission.id, async () => onNotify(`+${rlc(await social.missions.claim(mission.id))} en tu wallet por «${mission.title}».`))}
                  onPlay={() => owned && onPlay(owned)}
                />
              );
            })}
          </ul>
        </>
      )}
      {watched && <VideoMission mission={watched} social={social} onClose={() => setWatching(null)} onError={onNotify} />}
    </Screen>
  );
}
