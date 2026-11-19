import { useEffect, useState } from "react";
import { api, errorText, type CompanionId, type MonitorInfo, type Settings } from "../lib/api";
import { Drawer } from "./Drawer";

const companions: { id: CompanionId; name: string; hint: string }[] = [
  { id: "discord", name: "Discord", hint: "Habla con tu grupo mientras juegas" },
  { id: "spotify", name: "Spotify", hint: "Tu música de fondo" },
  { id: "youtube", name: "YouTube", hint: "Un vídeo o una guía al lado" },
];

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
  const [open, setOpen] = useState<CompanionId[]>([]);
  const [busy, setBusy] = useState<CompanionId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const hasSecond = monitors.length > 1;
  const black = settings.secondMonitor === "black";

  useEffect(() => {
    api.openCompanions().then(setOpen).catch(() => {});
  }, []);

  async function launch(id: CompanionId, name: string) {
    setBusy(id);
    setMessage(null);
    try {
      if (black) onSettings({ ...settings, secondMonitor: "free" });
      const how = await api.openCompanion(id);
      setMessage(how === "app" ? `${name} se está abriendo en el segundo monitor.` : `${name} abierto en el segundo monitor.`);
      setOpen(await api.openCompanions());
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function close(id: CompanionId) {
    await api.closeCompanion(id).catch(() => {});
    setOpen(await api.openCompanions());
  }

  return (
    <Drawer title="Segundo monitor" onClose={onClose}>
      {monitors.length > 0 && <Layout monitors={monitors} black={black} />}
      {!hasSecond ? (
        <p className="note">Solo hay un monitor conectado. Conecta otro para tener Discord, Spotify o YouTube a la vista mientras juegas.</p>
      ) : (
        <>
          <div className="segmented" role="radiogroup" aria-label="Uso del segundo monitor">
            <button role="radio" aria-checked={!black} className={!black ? "is-on" : ""} onClick={() => onSettings({ ...settings, secondMonitor: "free" })}>
              Usarlo para apps
            </button>
            <button role="radio" aria-checked={black} className={black ? "is-on" : ""} onClick={() => onSettings({ ...settings, secondMonitor: "black" })}>
              Apagarlo
            </button>
          </div>
          <p className="muted small">{black ? "El segundo monitor queda en negro mientras Red Level está abierto." : "Abre una app y Red Level la coloca en el segundo monitor."}</p>
          <ul className="companions">
            {companions.map((c) => (
              <li key={c.id}>
                <span className="companion-text">
                  <strong>{c.name}</strong>
                  <small>{c.hint}</small>
                </span>
                {open.includes(c.id) && (
                  <button className="btn btn-ghost btn-small" onClick={() => close(c.id)}>
                    Cerrar
                  </button>
                )}
                <button className="btn btn-ghost btn-small" onClick={() => launch(c.id, c.name)} disabled={busy !== null}>
                  {busy === c.id ? "Abriendo…" : "Abrir"}
                </button>
              </li>
            ))}
          </ul>
          {message && <p className="note">{message}</p>}
        </>
      )}
    </Drawer>
  );
}
