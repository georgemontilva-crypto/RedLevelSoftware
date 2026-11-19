import { useEffect, useMemo, useState } from "react";
import { Monitor, Play, Search, Square, Trash2, X } from "lucide-react";
import { api, errorText, type RemoteGame, type RemoteState } from "../api";
import { Link, type Session } from "../App";

const stores: Record<string, string> = { steam: "Steam", epic: "Epic Games", local: "En tu PC" };

function Cover({ game }: { game: RemoteGame }) {
  const [broken, setBroken] = useState(false);
  if (game.cover && !broken) return <img src={game.cover} alt="" loading="lazy" onError={() => setBroken(true)} />;
  return <span className="pc-letter">{game.title.slice(0, 1).toUpperCase()}</span>;
}

/// Mi PC: los juegos del ordenador, vistos desde el teléfono, con abrir y cerrar.
export function Remote({ session }: { session: Session }) {
  const [state, setState] = useState<RemoteState | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<RemoteGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /// La orden que se acaba de mandar, para contar qué pasó con ella.
  const [sent, setSent] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const look = () =>
      api
        .remote()
        .then((next) => alive && setState(next))
        .catch(() => {});
    look();
    const timer = setInterval(look, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const pc = state?.pc ?? null;
  const games = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (pc?.games ?? []).filter((g) => !text || g.title.toLowerCase().includes(text)).sort((a, b) => a.title.localeCompare(b.title, "es"));
  }, [pc?.games, query]);
  const running = pc?.running ? (pc.games.find((g) => g.id === pc.running) ?? null) : null;
  const canSend = Boolean(pc?.online && pc.enabled);

  const [removing, setRemoving] = useState(false);
  async function send(action: "play" | "close" | "uninstall", game: RemoteGame) {
    setRemoving(false);
    setBusy(true);
    setError("");
    try {
      setSent((await api.remoteCommand(action, game.id)).id);
      setPicked(null);
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(false);
  }

  const last = state?.last && state.last.id === sent ? state.last : null;
  const lastGame = last ? (pc?.games.find((g) => g.id === last.game)?.title ?? "el juego") : "";
  const status = !last
    ? null
    : last.state === "pending"
      ? `Enviando a tu PC…`
      : last.state === "running"
        ? last.action === "play"
          ? `Abriendo ${lastGame} en tu PC…`
          : last.action === "uninstall"
            ? `Desinstalando ${lastGame}…`
            : `Cerrando ${lastGame}…`
        : last.state === "done"
          ? last.action === "play"
            ? `${lastGame} se está abriendo en tu PC.`
            : last.action === "uninstall"
              ? (last.result ?? `Desinstalación de ${lastGame} en marcha en tu PC.`)
              : `${lastGame} se cerró.`
          : last.state === "expired"
            ? "Tu PC no recogió la orden. Comprueba que Red Level sigue abierto."
            : (last.result ?? "No se pudo completar en tu PC.");

  return (
    <main className="wide sub pc">
      <header className="pc-head">
        <div>
          <h1>Mi PC</h1>
          <p className="pc-device">
            <Monitor size={16} aria-hidden="true" /> {pc ? pc.device : `Hola, ${session.user?.name.split(" ")[0] ?? ""}`}
          </p>
        </div>
        <span className={`pc-status ${pc?.online ? "is-on" : ""}`}>
          <i aria-hidden="true" /> {pc?.online ? "Conectado" : "Sin conexión"}
        </span>
      </header>

      {state && !pc && (
        <section className="panel">
          <h2>Todavía no vemos tu PC</h2>
          <p>Abre Red Level en tu ordenador e inicia sesión con esta misma cuenta. En unos segundos aparecerán aquí tus juegos.</p>
          <Link to="/descargas" go={session.go} className="button primary" label="mi-pc-descargar">
            Descargar Red Level
          </Link>
        </section>
      )}

      {pc && !pc.online && <p className="notice">Tu PC no está conectado ahora mismo. Abre Red Level en él para abrir o cerrar juegos desde aquí.</p>}
      {pc?.online && !pc.enabled && <p className="notice">El control desde el teléfono está apagado en tu PC. Actívalo en Red Level: Ajustes → Cuenta → Mi PC desde el teléfono.</p>}
      {status && <p className={last?.state === "error" || last?.state === "expired" ? "error" : "notice"}>{status}</p>}
      {error && <p className="error">{error}</p>}

      {running && (
        <section className="pc-now">
          <span className="pc-cover">
            <Cover game={running} />
          </span>
          <div>
            <small>Jugando ahora</small>
            <strong>{running.title}</strong>
          </div>
          <button className="button" disabled={!canSend} onClick={() => setPicked(running)}>
            <Square size={16} aria-hidden="true" /> Cerrar
          </button>
        </section>
      )}

      {pc && pc.games.length > 0 && (
        <>
          <label className="pc-search">
            <Search size={18} aria-hidden="true" />
            <input type="search" placeholder={`Buscar entre ${pc.games.length} juegos`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar un juego" />
          </label>
          <ul className="pc-games">
            {games.map((game) => (
              <li key={game.id}>
                <button onClick={() => (setError(""), setRemoving(false), setPicked(game))} className={pc.running === game.id ? "is-running" : ""}>
                  <span className="pc-cover">
                    <Cover game={game} />
                  </span>
                  <b>{game.title}</b>
                  <small>{pc.running === game.id ? "Jugando ahora" : (stores[game.store] ?? game.store)}</small>
                </button>
              </li>
            ))}
          </ul>
          {games.length === 0 && <p className="fine">Ningún juego se llama así.</p>}
        </>
      )}

      {picked && pc && (
        <div className="pc-sheet-back" onClick={() => !busy && setPicked(null)}>
          <section className="pc-sheet" role="dialog" aria-label={picked.title} onClick={(e) => e.stopPropagation()}>
            <button className="pc-sheet-close" onClick={() => setPicked(null)} aria-label="Cerrar">
              <X size={20} />
            </button>
            <span className="pc-cover">
              <Cover game={picked} />
            </span>
            <h2>{picked.title}</h2>
            <p className="fine">{stores[picked.store] ?? picked.store}</p>
            {pc.running === picked.id ? (
              <>
                <p>Se cerrará en tu PC. Lo que no esté guardado en la partida se pierde.</p>
                <button className="button primary" disabled={busy || !canSend} onClick={() => void send("close", picked)}>
                  <Square size={18} aria-hidden="true" /> {busy ? "Enviando…" : "Cerrar el juego"}
                </button>
              </>
            ) : (
              <>
                <button className="button primary" disabled={busy || !canSend} onClick={() => void send("play", picked)}>
                  <Play size={18} aria-hidden="true" /> {busy ? "Enviando…" : "Jugar en mi PC"}
                </button>
                {removing ? (
                  <>
                    <p>Se desinstalará de tu PC. Si es de Steam o Epic, su tienda te pedirá confirmarlo en el ordenador.</p>
                    <button className="button pc-danger" disabled={busy || !canSend} onClick={() => void send("uninstall", picked)}>
                      <Trash2 size={18} aria-hidden="true" /> Sí, desinstalar
                    </button>
                    <button className="button" onClick={() => setRemoving(false)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button className="button" disabled={!canSend} onClick={() => setRemoving(true)}>
                    <Trash2 size={18} aria-hidden="true" /> Desinstalar del PC
                  </button>
                )}
              </>
            )}
            {!canSend && <p className="fine">{pc.online ? "El control desde el teléfono está apagado en tu PC." : "Tu PC no está conectado."}</p>}
            {error && <p className="error">{error}</p>}
          </section>
        </div>
      )}
    </main>
  );
}
