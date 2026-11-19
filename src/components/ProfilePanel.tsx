import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { api, type Bootstrap, type GameFolders, type GuardReport, type Profile, type Settings } from "../lib/api";
import type { Social } from "../lib/online";
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
  social: Social;
  /// El perfil cambió (por ejemplo, al elegir un avatar de la galería).
  onProfile: (profile: Profile) => void;
  /// Las carpetas de juegos cambiaron: hay que volver a leer la biblioteca.
  onLibrary: () => void;
  onClose: () => void;
}

export function ProfilePanel({ boot, profile, settings, guard, onName, onAvatar, onSettings, social, onProfile, onLibrary, onClose }: Props) {
  const [name, setName] = useState(profile.name);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  // Abrir el perfil cuenta como haber visto los avatares nuevos.
  const fresh = useState(() => social.newAvatars)[0];
  useEffect(() => social.seeAvatars(), [social.avatars.length]);

  async function choose(id: number) {
    setChoosing(id);
    setAvatarError(null);
    try {
      const { image, extension } = await social.chooseAvatar(id);
      onProfile(await api.setGalleryAvatar(image, extension));
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : "No se pudo poner ese avatar.");
    } finally {
      setChoosing(null);
    }
  }
  const [folders, setFolders] = useState<GameFolders | null>(null);
  useEffect(() => {
    api.gameFolders().then(setFolders).catch(() => {});
  }, []);
  async function changeFolders(action: () => Promise<unknown>) {
    await action().catch(() => {});
    setFolders(await api.gameFolders().catch(() => folders));
    onLibrary();
  }
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

      {social.avatars.length > 0 && (
        <section className="sheet-section">
          <h4>Galería de avatares</h4>
          <p className="muted small">{fresh > 0 ? `Hay ${fresh} ${fresh === 1 ? "avatar nuevo" : "avatares nuevos"}. Toca uno para ponértelo.` : "Toca uno para ponértelo como foto de perfil."}</p>
          <ul className="avatar-pick">
            {social.avatars.map((avatar, index) => (
              <li key={avatar.id}>
                <button onClick={() => choose(avatar.id)} disabled={choosing !== null} aria-label={`Usar el avatar ${avatar.name}`} title={avatar.name} className={`${choosing === avatar.id ? "is-busy" : ""} ${index < fresh ? "is-new" : ""}`}>
                  <img src={social.avatarUrl(avatar.id)} alt="" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
          {avatarError && <p className="note note-error">{avatarError}</p>}
        </section>
      )}

      {social.status === "in" && social.me && (
        <section className="sheet-section">
          <h4>Cuenta de Red Level</h4>
          <p className="muted small">
            Sesión iniciada como {social.me.name}. Tu código de amigo es <b>{social.me.code}</b>.
          </p>
          <Toggle label="Compartir mi biblioteca y mis horas" hint="Sirve para ver qué juegos se juegan más y mejorar Red Level para ellos. Si lo apagas, se borra lo que ya se había guardado." checked={social.me.consentLibrary} onChange={(share) => void social.setConsent(share).catch(() => {})} />
          <button className="btn btn-ghost btn-small" onClick={social.signOut}>
            Cerrar sesión
          </button>
        </section>
      )}

      <section className="sheet-section">
        <h4>Carpetas de juegos</h4>
        <p className="muted small">Red Level añade solo los juegos que encuentre en estas carpetas y les busca su portada. Cada subcarpeta con un programa cuenta como un juego.</p>
        <ul className="folder-list">
          {folders?.chosen.map((path) => (
            <li key={path}>
              <span>{path}</span>
              <button className="btn btn-ghost btn-small" onClick={() => changeFolders(() => api.removeGameFolder(path))}>
                Quitar
              </button>
            </li>
          ))}
          {folders?.usual.map((path) => (
            <li key={path}>
              <span>{path}</span>
              <small className="muted">Encontrada sola</small>
            </li>
          ))}
        </ul>
        <button className="btn btn-ghost btn-small" onClick={() => changeFolders(api.addGameFolder)}>
          Añadir una carpeta de juegos
        </button>
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
