import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { AppWindow, PanelTopClose, Plus, X } from "lucide-react";
import { api, errorText, onSecondChanged, type SecondState } from "../lib/api";
import { Mark } from "./Logo";

function useSecond(): [SecondState | null, (next: SecondState) => void] {
  const [state, setState] = useState<SecondState | null>(null);
  useEffect(() => {
    api.secondState().then(setState).catch(() => {});
    return onSecondChanged(setState);
  }, []);
  return [state, setState];
}

// Estas ventanas no ocupan toda la pantalla: el tamaño de letra sale del alto del monitor, no del de la ventana.
function useScreenScale() {
  useEffect(() => {
    document.documentElement.style.fontSize = `${Math.min(26, Math.max(11, window.screen.height * 0.0148))}px`;
  }, []);
}

/// Barra de Red Level en el segundo monitor: añadir programas del PC, elegir cuál se ve y cambiar entre ellos.
export function SecondBar() {
  useScreenScale();
  const [state, setState] = useSecond();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  async function run(id: string | null, action: () => Promise<SecondState>) {
    setBusy(id);
    setError(null);
    try {
      setState(await action());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="second-bar">
      <Mark size={30} />
      <nav className="second-tabs" aria-label="Apps del segundo monitor">
        {state?.apps.map((app) => {
          const active = state.active === app.id;
          return (
            <span key={app.id} className={`second-tab ${active ? "is-active" : ""} ${app.open ? "is-open" : ""}`}>
              <button className="second-tab-main" onClick={() => run(app.id, () => api.secondOpen(app.id))} disabled={busy !== null} aria-pressed={active}>
                <AppWindow size={18} aria-hidden="true" />
                {busy === app.id ? "Abriendo…" : app.name}
              </button>
              {app.open && (
                <button className="second-tab-close" onClick={() => run(null, () => api.secondClose(app.id))} aria-label={`Cerrar ${app.name}`}>
                  <X size={14} />
                </button>
              )}
              {active && <motion.span className="tab-line" layoutId="second-line" transition={{ type: "spring", stiffness: 520, damping: 42 }} />}
            </span>
          );
        })}
        <button className="second-tab-main second-add" onClick={() => run("+", api.secondAddApp)} disabled={busy !== null}>
          <Plus size={18} aria-hidden="true" />
          {state && state.apps.length === 0 ? "Añade una app de tu PC" : "Añadir app"}
        </button>
      </nav>
      {error && <p className="second-error">{error}</p>}
      <div className="second-right">
        {state?.active && (
          <button className="second-action" onClick={() => run(null, api.secondHide)}>
            <PanelTopClose size={17} aria-hidden="true" />
            Ocultar
          </button>
        )}
        <time className="clock">{now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</time>
      </div>
    </div>
  );
}

/// Fondo del segundo monitor cuando no hay ninguna app a la vista.
export function SecondBack() {
  useScreenScale();
  const [state] = useSecond();
  const open = state?.apps.filter((app) => app.open) ?? [];
  return (
    <div className="second-back">
      <Mark size={120} />
      <p className="second-back-title">Segundo monitor</p>
      <p className="muted">
        {open.length > 0 ? `${open.map((app) => app.name).join(" y ")} ${open.length === 1 ? "sigue abierto" : "siguen abiertos"}. Elige una app en la barra de arriba para verla.` : "Elige una app en la barra de arriba."}
      </p>
    </div>
  );
}
