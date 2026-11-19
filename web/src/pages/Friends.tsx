import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Copy, Gamepad2, Send, UserPlus } from "lucide-react";
import { api, errorText, type ChatMessage, type Pulse, type WebFriend } from "../api";
import { useFresh } from "../live";

export interface WebSocial {
  pulse: Pulse | null;
  /// Mensajes sin leer por amigo.
  unread: Record<number, number>;
  chats: Record<number, ChatMessage[]>;
  openChat: (id: number | null) => Promise<void>;
  send: (to: number, body: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/// Amigos y chat en la web: cada latido trae amigos, solicitudes y mensajes nuevos.
export function useWebSocial(): WebSocial {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [unread, setUnread] = useState<Record<number, number>>({});
  const [chats, setChats] = useState<Record<number, ChatMessage[]>>({});
  const last = useRef<number | null>(null);
  const open = useRef<number | null>(null);

  const busy = useRef(false);
  const again = useRef(false);
  const beat = useCallback(async () => {
    // Dos latidos a la vez traerían los mismos mensajes dos veces: el segundo espera a que acabe el primero.
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    const data = await api.pulse(last.current).catch(() => null);
    busy.current = false;
    if (again.current) {
      again.current = false;
      setTimeout(() => void beatRef.current(), 0);
    }
    if (!data) return;
    last.current = data.last;
    setPulse(data);
    if (data.messages.length === 0) return;
    setChats((all) => {
      const next = { ...all };
      for (const message of data.messages) {
        const other = message.fromId === data.me.id ? message.toId : message.fromId;
        if (next[other] && !next[other].some((m) => m.id === message.id)) next[other] = [...next[other], message];
      }
      return next;
    });
    for (const message of data.messages) {
      if (message.fromId !== data.me.id && open.current !== message.fromId) setUnread((all) => ({ ...all, [message.fromId]: (all[message.fromId] ?? 0) + 1 }));
    }
  }, []);

  const beatRef = useRef(beat);
  beatRef.current = beat;
  // Los mensajes y los cambios de amigos llegan con su aviso, al momento; sin avisos, se pregunta cada 4 segundos.
  useFresh(() => void beat(), ["chat", "social"], 4000);

  return {
    pulse,
    unread,
    chats,
    refresh: beat,
    openChat: async (id) => {
      open.current = id;
      if (id === null) return;
      setUnread((all) => ({ ...all, [id]: 0 }));
      const { messages } = await api.chat(id);
      setChats((all) => ({ ...all, [id]: messages }));
    },
    send: async (to, body) => {
      const { message } = await api.sendChat(to, body);
      setChats((all) => ({ ...all, [to]: [...(all[to] ?? []).filter((m) => m.id !== message.id), message] }));
    },
  };
}

const clock = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });

function Face({ friend }: { friend: WebFriend }) {
  return <span className={`fr-face ${friend.online ? "is-on" : ""}`}>{friend.avatarId ? <img src={`/api/avatars/${friend.avatarId}/image`} alt="" /> : friend.name.slice(0, 1).toUpperCase()}</span>;
}

function Chat({ social, friend, onBack }: { social: WebSocial; friend: WebFriend; onBack: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const messages = social.chats[friend.id];
  const me = social.pulse?.me.id;

  useEffect(() => {
    void social.openChat(friend.id).catch(() => {});
    return () => void social.openChat(null);
  }, [friend.id]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    setError("");
    try {
      await social.send(friend.id, body);
    } catch (e) {
      setText(body);
      setError(errorText(e));
    }
  }

  return (
    <div className="fr-chat">
      <header className="fr-chat-head">
        <button onClick={onBack} aria-label="Volver a la lista de amigos">
          <ChevronLeft size={22} />
        </button>
        <Face friend={friend} />
        <span>
          <b>{friend.name}</b>
          <small>{friend.playing ? `Jugando ${friend.playing}` : friend.online ? "En línea" : "Desconectado"}</small>
        </span>
      </header>
      <div className="fr-log" aria-live="polite">
        {messages === undefined && <p className="fine">Cargando la conversación…</p>}
        {messages?.length === 0 && <p className="fine">Todavía no os habéis escrito. Di hola.</p>}
        {messages?.map((message) => (
          <p key={message.id} className={`fr-bubble ${message.fromId === me ? "is-mine" : ""} ${message.kind === "invite" ? "is-invite" : ""}`}>
            {message.kind === "invite" ? (
              <>
                <Gamepad2 size={16} aria-hidden="true" /> {message.fromId === me ? "Le invitaste a jugar a" : "Te invita a jugar a"} <b>{message.game}</b>
              </>
            ) : (
              message.body
            )}
            <small>{clock(message.createdAt)}</small>
          </p>
        ))}
        <div ref={end} />
      </div>
      {error && <p className="error">{error}</p>}
      <form className="fr-box" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Escribe un mensaje" aria-label="Escribe un mensaje" autoComplete="off" />
        <button className="button primary" disabled={!text.trim()} aria-label="Enviar">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

/// Amigos: tu código, solicitudes, la lista y el chat con cada uno.
export function Friends({ social }: { social: WebSocial }) {
  const [chatWith, setChatWith] = useState<number | null>(null);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const pulse = social.pulse;
  const friend = pulse?.friends.find((f) => f.id === chatWith) ?? null;

  if (friend) return <Chat social={social} friend={friend} onBack={() => setChatWith(null)} />;

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setNote(null);
    try {
      const { state } = await api.addFriend(target.trim());
      setTarget("");
      setNote({ text: state === "friends" ? "Ya sois amigos." : "Solicitud enviada. Aparecerá en tu lista cuando la acepte." });
      await social.refresh();
    } catch (e) {
      setNote({ text: errorText(e), error: true });
    }
  }

  const friends = [...(pulse?.friends ?? [])].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, "es"));
  return (
    <div className="appx-page fr">
      {pulse && (
        <button
          className="fr-code"
          onClick={() => {
            void navigator.clipboard?.writeText(pulse.me.code).then(() => setCopied(true));
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          <span>
            <small>Tu código de amigo</small>
            <b>{pulse.me.code}</b>
          </span>
          <span className="fr-copy">
            <Copy size={16} aria-hidden="true" /> {copied ? "Copiado" : "Copiar"}
          </span>
        </button>
      )}

      <form className="fr-add" onSubmit={add}>
        <label>
          Añadir a un amigo
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Su código RL-… o su correo" autoComplete="off" required />
        </label>
        <button className="button primary" aria-label="Enviar solicitud">
          <UserPlus size={18} />
        </button>
      </form>
      {note && <p className={note.error ? "error" : "notice"}>{note.text}</p>}

      {pulse && pulse.requests.length > 0 && (
        <>
          <div className="appx-row-head">
            <h2>Solicitudes</h2>
          </div>
          <ul className="fr-list">
            {pulse.requests.map((request) => (
              <li key={request.id}>
                <span className="fr-face">{request.name.slice(0, 1).toUpperCase()}</span>
                <span className="fr-text">
                  <b>{request.name}</b>
                  <small>Quiere ser tu amigo</small>
                </span>
                <button className="button primary" onClick={() => void api.acceptFriend(request.id).then(social.refresh)}>
                  Aceptar
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="appx-row-head">
        <h2>Amigos</h2>
        {friends.length > 0 && <span className="fine">{friends.filter((f) => f.online).length} en línea</span>}
      </div>
      {pulse && friends.length === 0 && <p className="fine">Aún no tienes amigos añadidos. Pásales tu código o pídeles el suyo.</p>}
      <ul className="fr-list">
        {friends.map((f) => (
          <li key={f.id}>
            <button className="fr-row" onClick={() => setChatWith(f.id)}>
              <Face friend={f} />
              <span className="fr-text">
                <b>{f.name}</b>
                <small>{f.playing ? `Jugando ${f.playing}` : f.online ? "En línea" : "Desconectado"}</small>
              </span>
              {(social.unread[f.id] ?? 0) > 0 && <b className="fr-badge">{social.unread[f.id]}</b>}
            </button>
          </li>
        ))}
      </ul>
      {pulse && pulse.sent.length > 0 && <p className="fine">Esperando respuesta de {pulse.sent.map((s) => s.name).join(", ")}.</p>}
    </div>
  );
}
