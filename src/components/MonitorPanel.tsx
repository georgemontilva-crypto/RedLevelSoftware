import { useEffect, useState } from "react";
import { api, errorText, onSecondChanged, type MonitorInfo, type SecondState, type Settings } from "../lib/api";
import { Drawer } from "./Drawer";
import { LayoutPicker } from "./Second";

/// Dibujo a escala de cómo están colocados los monitores.
function Layout({ monitors, black }: { monitors: MonitorInfo[]; black: boolean }) {
  const minX = Math.min(...monitors.map((m) => m.x));
  const minY = Math.min(...monitors.map((m) => m.y));
  const width = Math.max(...monitors.map((m) => m.x + m.width)) - minX;
  const height = Math.max(...monitors.map((m) => m.y + m.height)) - minY;
  return (
    <div className="monitor-map" style={{ aspectRatio: `${width} / ${height}` }}>
      {monitors.map((m, i) => (
        <div
          key={i}
          className={`monitor-box ${m.primary ? "is-primary" : ""} ${!m.primary && black ? "is-black" : ""}`}
          style={{ left: `${((m.x - minX) / width) * 100}%`, top: `${((m.y - minY) / height) * 100}%`, width: `${(m.width / width) * 100}%`, height: `${(m.height / height) * 100}%` }}
        >
          <span>{m.primary ? "Red Level" : black ? "Apagado" : "Apps"}</span>
        </div>
      ))}
    </div>
  );
}

interface Props {
  monitors: MonitorInfo[];
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onClose: () => void;
}

export function MonitorPanel({ monitors, settings, onSettings, onClose }: Props) {
  const [second, setSecond] = useState<SecondState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const hasSecond = second?.available ?? monitors.length > 1;
  const black = settings.secondMonitor === "black";

  useEffect(() => {
    api.secondState().then(setSecond).catch(() => {});
    return onSecondChanged(setSecond);
  }, []);

  async function run(id: string, action: () => Promise<SecondState>) {
    setBusy(id);
    setMessage(null);
    try {
      const next = await action();
      setSecond(next);
      // Abrir una app enciende el segundo monitor si estaba apagado.
      if (next.mode !== settings.secondMonitor) onSettings({ ...settings, secondMonitor: next.mode });
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Drawer title="Segundo monitor" onClose={onClose}>
      {monitors.length > 0 && <Layout monitors={monitors} black={black} />}
      {!hasSecond ? (
        <p className="note">Solo hay un monitor conectado. Conecta otro para tener a la vista las apps que quieras mientras juegas.</p>
      ) : (
        <>
          <div className="segmented" role="radiogroup" aria-label="Segundo monitor">
            <button role="radio" aria-checked={!black} className={!black ? "is-on" : ""} onClick={() => onSettings({ ...settings, secondMonitor: "free" })}>
              Encendido
            </button>
            <button role="radio" aria-checked={black} className={black ? "is-on" : ""} onClick={() => onSettings({ ...settings, secondMonitor: "black" })}>
              Apagado
            </button>
          </div>
          <p className="muted small">
            {black ? "El segundo monitor queda en negro mientras Red Level está abierto." : "El segundo monitor tiene su propia barra de Red Level. Añade los programas de tu PC que quieras tener ahí."}
          </p>
          {second && !black && (
            <div className="layout-row">
              <span>
                <strong>División</strong>
                <small>{second.layout === 1 ? "Pantalla sola: una app a la vez" : `${second.layout} cuadros: toca uno para abrir esa app en grande`}</small>
              </span>
              <LayoutPicker value={second.layout} onChange={(count) => run("división", () => api.secondSetLayout(count))} disabled={busy !== null} />
            </div>
          )}
          <ul className="companions">
            {second?.apps.map((app) => (
              <li key={app.id}>
                <span className="companion-text">
                  <strong>{app.name}</strong>
                  <small>{second.active === app.id ? (second.layout > 1 ? "Abierta en grande" : "En pantalla ahora") : app.open ? (second.layout > 1 ? "En su cuadro" : "Abierta, en segundo plano") : "Lista para abrir"}</small>
                </span>
                {app.open && (
                  <button className="btn btn-ghost btn-small" onClick={() => run(app.id, () => api.secondClose(app.id))} disabled={busy !== null}>
                    Cerrar
                  </button>
                )}
                <button className="btn btn-ghost btn-small" onClick={() => run(app.id, () => api.secondOpen(app.id))} disabled={busy !== null || second.active === app.id}>
                  {busy === app.id ? "Abriendo…" : app.open ? "Ver" : "Abrir"}
                </button>
                <button className="btn btn-ghost btn-small" onClick={() => run(app.id, () => api.secondRemoveApp(app.id))} disabled={busy !== null} aria-label={`Quitar ${app.name} de la barra`}>
                  Quitar
                </button>
              </li>
            ))}
          </ul>
          {second && second.apps.length === 0 && <p className="note">Todavía no hay apps en la barra. Añade cualquier programa instalado en tu PC.</p>}
          <button className="btn btn-ghost" onClick={() => run("+", api.secondAddApp)} disabled={busy !== null}>
            Añadir una app de tu PC
          </button>
          {message && <p className="note note-error">{message}</p>}
        </>
      )}
    </Drawer>
  );
}
