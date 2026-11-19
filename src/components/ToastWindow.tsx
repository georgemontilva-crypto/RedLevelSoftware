import { useEffect } from "react";
import { MessageCircle, Swords, Trophy, UserPlus } from "lucide-react";
import { applyTheme } from "../lib/themes";

interface Payload {
  kind: string;
  title: string;
  body: string;
  theme?: string;
  look?: string;
}

const icons: Record<string, typeof Trophy> = { logro: Trophy, mensaje: MessageCircle, amistad: UserPlus, invitacion: Swords };

/// Aviso flotante: una ventana pequeña que Red Level pone en la esquina, por encima del juego, y que se cierra sola.
export function ToastWindow() {
  const payload = (window as unknown as { __RL_TOAST__?: Payload }).__RL_TOAST__ ?? { kind: "logro", title: "Logro conseguido", body: "Red Level" };
  useEffect(() => {
    document.documentElement.style.fontSize = `${Math.min(26, Math.max(11, window.screen.height * 0.0148))}px`;
    if (payload.theme) applyTheme(payload.theme, payload.look);
  }, [payload.theme, payload.look]);
  const Icon = icons[payload.kind] ?? Trophy;
  return (
    <div className="toast-window">
      <span className="toast-icon">
        <Icon size={26} aria-hidden="true" />
      </span>
      <p>
        <small>{payload.kind === "logro" ? "Logro conseguido" : "Red Level"}</small>
        <strong>{payload.title}</strong>
        <span>{payload.body}</span>
      </p>
    </div>
  );
}
