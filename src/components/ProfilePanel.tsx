import { useState } from "react";
import { Camera } from "lucide-react";
import type { Bootstrap, GuardReport, Profile, Settings } from "../lib/api";
import { Drawer, Toggle } from "./Drawer";
import { Avatar } from "./TopBar";

interface Props {
  boot: Bootstrap;
  profile: Profile;
  settings: Settings;
  guard: GuardReport;
  onName: (name: string) => void;
  onAvatar: () => void;
  onSettings: (settings: Settings) => void;
  onClose: () => void;
}

export function ProfilePanel({ boot, profile, settings, guard, onName, onAvatar, onSettings, onClose }: Props) {
  const [name, setName] = useState(profile.name);
  const set = (patch: Partial<Settings>) => onSettings({ ...settings, ...patch });
  const dirty = name.trim() !== "" && name.trim() !== profile.name;
  const notificationsFailed = settings.silenceNotifications && boot.guardEnabled && guard.notifications !== "ok" && guard.notifications !== "";

  return (
    <Drawer title="Perfil y ajustes" onClose={onClose}>
      <section className="profile-edit">
        <button className="avatar-edit" onClick={onAvatar} aria-label="Cambiar foto de perfil">
          <Avatar profile={profile} size="lg" />
          <span className="avatar-edit-badge">
            <Camera size={15} aria-hidden="true" />
          </span>
        </button>
        <form
          className="profile-name"
          onSubmit={(e) => {
            e.preventDefault();
            if (dirty) onName(name.trim());
          }}
        >
          <label htmlFor="profile-name">Tu nombre</label>
          <div className="row">
            <input id="profile-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            <button className="btn btn-ghost btn-small" type="submit" disabled={!dirty}>
              Guardar
            </button>
          </div>
        </form>
      </section>

      <section className="sheet-section">
        <h4>Mientras Red Level está abierto</h4>
        <Toggle label="Bloquear las teclas de Windows" hint="Tecla Windows, Alt+Tab, Alt+F4 y Ctrl+Esc dejan de sacarte al escritorio." checked={settings.blockKeys} onChange={(v) => set({ blockKeys: v })} />
        <Toggle
          label="Bloquear Alt+Tab también dentro del juego"
          hint="Desactívalo si cambias con el teclado entre el juego y otras apps."
          checked={settings.blockAltTabInGame}
          onChange={(v) => set({ blockAltTabInGame: v })}
        />
        <Toggle label="Ocultar la barra de tareas" checked={settings.hideTaskbar} onChange={(v) => set({ hideTaskbar: v })} />
        <Toggle label="Sonidos de la interfaz" hint="Al moverte entre juegos y al abrir o cerrar paneles." checked={settings.sounds} onChange={(v) => set({ sounds: v })} />
        <Toggle label="Silenciar las notificaciones" hint="Activa No molestar y lo devuelve como estaba al salir." checked={settings.silenceNotifications} onChange={(v) => set({ silenceNotifications: v })} />
        {notificationsFailed && <p className="note note-error">{guard.notifications}</p>}
        {!boot.guardEnabled && <p className="note">Red Level se abrió sin bloqueo: estos ajustes no se aplican en esta sesión.</p>}
        {boot.guardEnabled && settings.blockKeys && !guard.keyboardHook && <p className="note note-error">Windows no dejó instalar el bloqueo de teclas en esta sesión.</p>}
      </section>

      <section className="sheet-section">
        <h4>Orden de la biblioteca</h4>
        <div className="segmented" role="radiogroup" aria-label="Orden de la biblioteca">
          {(
            [
              ["recent", "Recientes"],
              ["played", "Más jugados"],
              ["name", "A–Z"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={settings.sort === id} className={settings.sort === id ? "is-on" : ""} onClick={() => set({ sort: id })}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <p className="note">
        Salida de emergencia: <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Mayús</kbd> + <kbd>Q</kbd> cierra Red Level y devuelve Windows a la normalidad, pase lo que pase.
      </p>
      <p className="muted small">Red Level {boot.version}</p>
    </Drawer>
  );
}
