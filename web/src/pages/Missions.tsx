import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, Coins, Gamepad2, Lock, Play, X } from "lucide-react";
import { api, errorText, type Mission } from "../api";
import { useFresh } from "../live";

const rlc = (amount: number) => `${amount.toLocaleString("es")} RLC`;

/// "2 min", "45 s", "1 h 30 min".
function span(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

const ends = (at: number | null) => (at === null ? null : `Termina el ${new Date(at * 1000).toLocaleDateString("es", { day: "numeric", month: "numeric" })}`);
const ask = (mission: Mission) => (mission.kind === "video" ? `Mira el vídeo y gana ${rlc(mission.reward)}.` : `Juega a ${mission.game} durante ${span(mission.goalSeconds)} en tu PC y gana ${rlc(mission.reward)}.`);

/// El vídeo de una misión, a pantalla completa. Solo cuenta el tiempo que de verdad se reproduce.
function Player({ mission, onProgress, onClaim, onClose }: { mission: Mission; onProgress: (seconds: number) => void; onClaim: () => Promise<void>; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const pending = useRef(0);
  const [claiming, setClaiming] = useState(false);
  const [failed, setFailed] = useState(false);
  const done = mission.seconds >= mission.goalSeconds;
  const report = useRef(onProgress);
  report.current = onProgress;

  useEffect(() => {
    const flush = () => {
      if (pending.current <= 0) return;
      report.current(pending.current);
      pending.current = 0;
    };
    const timer = setInterval(() => {
      const player = video.current;
      if (player && !player.paused && !player.ended && player.readyState > 2) pending.current += 1;
      if (pending.current >= 5) flush();
    }, 1000);
    return () => {
      clearInterval(timer);
      flush();
    };
  }, [mission.id]);

  return (
    <div className="quest-player" role="dialog" aria-label={`Vídeo de la misión ${mission.title}`}>
      <button className="quest-player-close" onClick={onClose} aria-label="Cerrar el vídeo">
        <X size={24} />
      </button>
      <div className="quest-player-video">
        {failed ? <p>El vídeo de esta misión no se pudo cargar.</p> : <video ref={video} src={mission.video ?? undefined} poster={`/api/missions/${mission.id}/image`} controls autoPlay playsInline onError={() => setFailed(true)} />}
      </div>
      <footer>
        <span className="quest-coin" aria-hidden="true">
          <Coins size={20} />
        </span>
        <div className="quest-player-info">
          <strong>Misión {mission.title}</strong>
          <small>
            <BadgeCheck size={14} aria-hidden="true" /> {mission.sponsor} · {done ? "Misión cumplida" : `Llevas ${span(mission.seconds)} de ${span(mission.goalSeconds)}`}
          </small>
          <div className="quest-bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (mission.seconds / mission.goalSeconds) * 100)}%` }} />
          </div>
        </div>
        <div className="quest-actions">
          {mission.link && (
            <a className="quest-btn" href={mission.link} target="_blank" rel="noreferrer">
              {mission.linkLabel ?? "Más información"}
            </a>
          )}
          <button
            className="quest-btn is-main"
            disabled={!done || mission.claimed || claiming}
            onClick={async () => {
              setClaiming(true);
              await onClaim();
              setClaiming(false);
            }}
          >
            {!done && <Lock size={16} aria-hidden="true" />}
            {mission.claimed ? "Reclamada" : done ? `Reclamar ${rlc(mission.reward)}` : "Reclamar recompensa"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function Card({ mission, busy, onWatch, onClaim, onPc }: { mission: Mission; busy: boolean; onWatch: () => void; onClaim: () => void; onPc: () => void }) {
  const done = mission.seconds >= mission.goalSeconds;
  const deadline = ends(mission.endsAt);
  const video = mission.kind === "video";

  let action: { label: string; run?: () => void };
  if (mission.claimed) action = { label: "Reclamada" };
  else if (done) action = mission.soldOut ? { label: "Recompensas agotadas" } : { label: `Reclamar ${rlc(mission.reward)}`, run: onClaim };
  else if (mission.soldOut) action = { label: "Recompensas agotadas" };
  else if (video) action = { label: mission.seconds > 0 ? `Reanudar · ${span(mission.goalSeconds - mission.seconds)}` : `Ver ${span(mission.goalSeconds)}`, run: onWatch };
  else action = { label: "Se juega en tu PC", run: onPc };

  return (
    <li className={`quest ${mission.claimed ? "is-claimed" : ""}`}>
      <button className="quest-art" onClick={video && !done && !mission.claimed && !mission.soldOut ? onWatch : undefined} disabled={!video || done || mission.claimed || mission.soldOut} aria-label={video ? `Ver el vídeo de ${mission.title}` : mission.title}>
        <img src={`/api/missions/${mission.id}/image`} alt="" loading="lazy" />
        <b className="quest-play" aria-hidden="true">
          {video ? <Play size={18} /> : <Gamepad2 size={18} />}
        </b>
      </button>
      <div className="quest-meta">
        <span>
          Patrocinado por <BadgeCheck size={15} aria-hidden="true" /> <b>{mission.sponsor}</b>
        </span>
        {deadline && <span>{deadline}</span>}
      </div>
      <div className="quest-box">
        <span className="quest-coin" aria-hidden="true">
          <Coins size={22} />
        </span>
        <div>
          <small>Misión {mission.title}</small>
          <strong>
            {mission.claimed ? "Reclamaste" : "Reclamar"} {rlc(mission.reward)}
          </strong>
          <p>{mission.body || ask(mission)}</p>
        </div>
      </div>
      {mission.seconds > 0 && !done && (
        <div className="quest-bar" aria-label={`Llevas ${span(mission.seconds)} de ${span(mission.goalSeconds)}`}>
          <i style={{ width: `${Math.min(100, (mission.seconds / mission.goalSeconds) * 100)}%` }} />
        </div>
      )}
      <div className="quest-actions">
        {mission.link && (
          <a className="quest-btn" href={mission.link} target="_blank" rel="noreferrer">
            {mission.linkLabel ?? "Más información"}
          </a>
        )}
        <button className={`quest-btn ${action.run ? "is-main" : ""}`} disabled={!action.run || busy} onClick={action.run}>
          {action.label}
        </button>
      </div>
    </li>
  );
}

/// Misiones de patrocinantes en la app: ver el vídeo desde el teléfono y cobrar los RLC ahí mismo.
export function Missions({ go }: { go: (path: string) => void }) {
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [tab, setTab] = useState<"all" | "claimed">("all");
  const [watching, setWatching] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(
    () =>
      void api
        .missions()
        .then(({ missions }) => setMissions(missions))
        .catch(() => setMissions((current) => current ?? [])),
    [],
  );
  // Las misiones nuevas llegan con su aviso, al momento.
  useFresh(load, ["missions"], 120_000, 300_000);

  const patch = (id: number, changes: Partial<Mission>) => setMissions((list) => (list ?? []).map((m) => (m.id === id ? { ...m, ...changes } : m)));
  const guard = async (id: number, work: () => Promise<void>) => {
    setBusy(id);
    setNote(null);
    await work().catch((e) => setNote(errorText(e)));
    setBusy(null);
  };
  const watch = (mission: Mission) =>
    guard(mission.id, async () => {
      if (!mission.accepted) {
        await api.acceptMission(mission.id);
        patch(mission.id, { accepted: true });
      }
      setWatching(mission.id);
    });
  const claim = (mission: Mission) =>
    guard(mission.id, async () => {
      const { reward } = await api.claimMission(mission.id);
      patch(mission.id, { claimed: true });
      setWatching(null);
      setNote(`+${rlc(reward)} en tu wallet por «${mission.title}».`);
    });

  const shown = (missions ?? []).filter((m) => (tab === "claimed" ? m.claimed : !m.claimed));
  const watched = (missions ?? []).find((m) => m.id === watching) ?? null;
  return (
    <div className="appx-page">
      <div className="quest-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "is-on" : ""} onClick={() => setTab("all")}>
          Todas las misiones
        </button>
        <button role="tab" aria-selected={tab === "claimed"} className={tab === "claimed" ? "is-on" : ""} onClick={() => setTab("claimed")}>
          Reclamadas
        </button>
      </div>
      {note && (
        <p className="quest-note" role="status">
          {note}
        </p>
      )}
      {missions === null ? (
        <p className="fine">Buscando misiones…</p>
      ) : shown.length === 0 ? (
        <p className="fine">{tab === "claimed" ? "Todavía no has reclamado ninguna misión." : "Ahora mismo no hay misiones. Cuando un patrocinante proponga una, aparece aquí al momento."}</p>
      ) : (
        <ul className="quests">
          {shown.map((mission) => (
            <Card key={mission.id} mission={mission} busy={busy === mission.id} onWatch={() => void watch(mission)} onClaim={() => void claim(mission)} onPc={() => go("/mi-pc")} />
          ))}
        </ul>
      )}
      {watched && (
        <Player
          mission={watched}
          onProgress={(seconds) =>
            void api
              .missionProgress(watched.id, seconds)
              .then((data) => patch(watched.id, { seconds: data.seconds }))
              .catch(() => {})
          }
          onClaim={() => claim(watched)}
          onClose={() => setWatching(null)}
        />
      )}
    </div>
  );
}
