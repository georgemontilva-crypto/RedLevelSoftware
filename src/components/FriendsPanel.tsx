import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, Send, Swords, UserPlus, X } from "lucide-react";
import type { Social } from "../lib/online";
import { Drawer } from "./Drawer";

interface Props {
  social: Social;
  /// Juego al que se puede invitar: el que está abierto o, si no, el elegido en la biblioteca.
  game: string | null;
  onClose: () => void;
}

const hour = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
const text = (e: unknown) => (e instanceof Error ? e.message : "No se pudo completar. Inténtalo de nuevo.");

/// Entrar o crear la cuenta de Red Level, la misma de la web.
export function SignIn({ social, intro }: { social: Social; intro?: string }) {
  const [creating, setCreating] = useState(false);
  const [share, setShare] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await social.signIn(email.trim(), password, creating ? name.trim() : undefined, share);
    } catch (e) {
      setError(text(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="friends-sign" onSubmit={submit}>
      <p className="muted">{intro ?? (creating ? "Crea tu cuenta de Red Level para añadir amigos y chatear." : "Entra con tu cuenta de Red Level, la misma de la web, para ver a tus amigos.")}</p>
      {creating && <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" aria-label="Tu nombre" required minLength={2} maxLength={80} />}
      <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo" aria-label="Correo" required />
      <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={creating ? "Contraseña (8 caracteres o más)" : "Contraseña"} aria-label="Contraseña" required minLength={creating ? 8 : 1} />
      {creating && (
        <label className="check-line">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
          <span>Compartir mi biblioteca y mis horas para mejorar Red Level. Es opcional y puedes cambiarlo en tu perfil.</span>
        </label>
      )}
      {error && <p className="note note-error">{error}</p>}
      <button className="btn btn-play" disabled={busy}>
        {busy ? "Un momento…" : creating ? "Crear cuenta" : "Entrar"}
      </button>
      <button type="button" className="btn btn-ghost btn-small" onClick={() => setCreating(!creating)}>
        {creating ? "Ya tengo cuenta" : "No tengo cuenta: crear una"}
      </button>
    </form>
  );
}

/// Conversación con un amigo: mensajes, invitación a jugar y caja para escribir.
function Chat({ social, friendId, game, onBack }: { social: Social; friendId: number; game: string | null; onBack: () => void }) {
  const friend = social.friends.find((f) => f.id === friendId);
  const messages = social.chats[friendId];
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    social.openChat(friendId).catch((e) => setError(text(e)));
    return () => void social.openChat(null);
  }, [friendId]);
  // Con llaves a propósito: en los navegadores nuevos scrollIntoView devuelve una promesa, y un efecto no puede devolverla.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  const act = (action: () => Promise<void>) => action().catch((e) => setError(text(e)));

  return (
    <div className="chat">
      <header className="chat-head">
        <button className="icon-btn" onClick={onBack} aria-label="Volver a la lista de amigos">
          <ArrowLeft size={19} />
        </button>
        <span className="friend-text">
          <strong>{friend?.name ?? "Amigo"}</strong>
          <small className={friend?.online ? "is-online" : ""}>{friend?.playing ? `Jugando ${friend.playing}` : friend?.online ? "Conectado" : "Desconectado"}</small>
        </span>
        {game && (
          <button className="btn btn-ghost btn-small" onClick={() => act(() => social.invite(friendId, game))} title={`Invitar a jugar a ${game}`}>
            <Swords size={15} aria-hidden="true" />
            Invitar a jugar
          </button>
        )}
      </header>
      <div className="chat-log" aria-live="polite">
        {messages === undefined && <p className="muted small">Cargando la conversación…</p>}
        {messages?.length === 0 && <p className="muted small">Todavía no os habéis escrito. Saluda.</p>}
        {messages?.map((message) => (
          <p key={message.id} className={`bubble ${message.fromId === friendId ? "" : "is-mine"} ${message.kind === "invite" ? "is-invite" : ""}`}>
            {message.kind === "invite" && <Swords size={15} aria-hidden="true" />}
            <span>{message.kind === "invite" && message.fromId !== friendId ? `Le invitaste a jugar a ${message.game}` : message.body}</span>
            <time>{hour(message.createdAt)}</time>
          </p>
        ))}
        <div ref={end} />
      </div>
      {error && <p className="note note-error">{error}</p>}
      <form
        className="chat-box"
        onSubmit={(e) => {
          e.preventDefault();
          const body = draft.trim();
          if (!body) return;
          setDraft("");
          setError(null);
          act(() => social.send(friendId, body));
        }}
      >
        <input className="field" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escribe un mensaje" aria-label="Escribe un mensaje" maxLength={1000} autoFocus />
        <button className="btn btn-play btn-icon" disabled={!draft.trim()} aria-label="Enviar">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

/// Amigos de Red Level: añadir, aceptar solicitudes, ver quién está conectado y a qué juega, y chatear.
export function FriendsPanel({ social, game, onClose }: Props) {
  const [chat, setChat] = useState<number | null>(null);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNote(null);
    try {
      setNote(await social.addFriend(target.trim()));
      setTarget("");
    } catch (e) {
      setError(text(e));
    }
  }
  const act = (action: () => Promise<void>) => action().catch((e) => setError(text(e)));

  return (
    <Drawer title="Amigos" wide onClose={onClose}>
      {social.status === "loading" && <p className="muted">Conectando con Red Level…</p>}
      {social.status === "none" && <p className="note">Red Level todavía no tiene su web conectada, así que los amigos y el chat aún no están disponibles.</p>}
      {social.status === "out" && <SignIn social={social} />}
      {social.status === "in" && chat !== null && <Chat social={social} friendId={chat} game={game} onBack={() => setChat(null)} />}
      {social.status === "in" && chat === null && (
        <>
          {social.me && (
            <p className="friend-code">
              Tu código de amigo: <b>{social.me.code}</b>
              <small className="muted">Pásaselo a quien quieras que te añada.</small>
            </p>
          )}
          <form className="row" onSubmit={add}>
            <input className="field" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Código de amigo o correo" aria-label="Código de amigo o correo" maxLength={190} />
            <button className="btn btn-ghost" disabled={!target.trim()}>
              <UserPlus size={16} aria-hidden="true" />
              Añadir
            </button>
          </form>
          {note && <p className="note">{note}</p>}
          {(error ?? social.error) && <p className="note note-error">{error ?? social.error}</p>}

          {social.requests.length > 0 && <h4 className="store-title">Quieren ser tus amigos</h4>}
          <ul className="friend-list">
            {social.requests.map((person) => (
              <li key={person.id}>
                <span className="friend-text">
                  <strong>{person.name}</strong>
                  <small>Te envió una solicitud</small>
                </span>
                <button className="btn btn-play btn-small" onClick={() => act(() => social.accept(person.id))}>
                  <Check size={15} aria-hidden="true" />
                  Aceptar
                </button>
                <button className="btn btn-ghost btn-small" onClick={() => act(() => social.remove(person.id))} aria-label={`Rechazar a ${person.name}`}>
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>

          <h4 className="store-title">Tus amigos</h4>
          {social.friends.length === 0 && <p className="muted small">Aún no tienes amigos en Red Level. Añade a alguien con su código o su correo.</p>}
          <ul className="friend-list">
            {social.friends.map((friend) => (
              <li key={friend.id}>
                <button className="friend-main" onClick={() => setChat(friend.id)}>
                  <span className="friend-face">
                    {friend.avatarId ? <img src={social.avatarUrl(friend.avatarId)} alt="" /> : friend.name.slice(0, 1).toUpperCase()}
                    <i className={`dot ${friend.online ? "is-online" : ""}`} aria-hidden="true" />
                  </span>
                  <span className="friend-text">
                    <strong>{friend.name}</strong>
                    <small className={friend.online ? "is-online" : ""}>{friend.playing ? `Jugando ${friend.playing}` : friend.online ? "Conectado" : "Desconectado"}</small>
                  </span>
                  {(social.unread[friend.id] ?? 0) > 0 && <b className="badge">{social.unread[friend.id]}</b>}
                </button>
                <button className="btn btn-ghost btn-small" onClick={() => act(() => social.remove(friend.id))} aria-label={`Dejar de ser amigo de ${friend.name}`} title="Dejar de ser amigos">
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>

          {social.sent.length > 0 && <p className="muted small">Esperando respuesta de: {social.sent.map((p) => p.name).join(", ")}.</p>}
          <button className="btn btn-ghost btn-small" onClick={social.signOut}>
            Cerrar sesión de Red Level
          </button>
        </>
      )}
    </Drawer>
  );
}
