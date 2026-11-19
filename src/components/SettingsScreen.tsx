import { useEffect, useState } from "react";
import { Camera, Info, Library, Monitor, ShieldCheck, UserRound, UserRoundCheck, Volume2 } from "lucide-react";
import { api, type Bootstrap, type GameFolders, type GuardReport, type Profile, type Settings } from "../lib/api";
import type { Social } from "../lib/online";
import { sfx } from "../lib/sound";
import { Toggle } from "./Drawer";
import { SignIn } from "./FriendsPanel";
import { Screen, type ScreenTab } from "./Screen";
import { Avatar } from "./TopBar";

interface Props {
  boot: Bootstrap;
  profile: Profile;
  settings: Settings;
  guard: GuardReport;
  social: Social;
  onName: (name: string) => void;
  onAvatar: () => void;
  onSettings: (settings: Settings) => void;
  /// El perfil cambió (por ejemplo, al elegir un avatar de la galería).
  onProfile: (profile: Profile) => void;
  /// Las carpetas de juegos cambiaron: hay que volver a leer la biblioteca.
  onLibrary: () => void;
  /// Abre el panel del segundo monitor.
  onMonitor: () => void;
  onClose: () => void;
}

const tabs: ScreenTab[] = [
  { id: "perfil", label: "Perfil", icon: UserRound },
  { id: "cuenta", label: "Cuenta", icon: UserRoundCheck },
  { id: "biblioteca", label: "Biblioteca", icon: Library },
  { id: "sonido", label: "Sonido y avisos", icon: Volume2 },
  { id: "consola", label: "Modo consola", icon: ShieldCheck },
  { id: "pantallas", label: "Pantallas", icon: Monitor },
  { id: "acerca", label: "Acerca de", icon: Info },
];

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([id, text]) => (
        <button key={id} role="radio" aria-checked={value === id} className={value === id ? "is-on" : ""} onClick={() => onChange(id)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/// Ajustes de Red Level a pantalla completa, ordenados por categorías.
export function SettingsScreen({ boot, profile, settings, guard, social, onName, onAvatar, onSettings, onProfile, onLibrary, onMonitor, onClose }: Props) {
  const [tab, setTab] = useState("perfil");
  const [name, setName] = useState(profile.name);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [folders, setFolders] = useState<GameFolders | null>(null);
  // Abrir los ajustes cuenta como haber visto los avatares nuevos.
  const fresh = useState(() => social.newAvatars)[0];
  useEffect(() => social.seeAvatars(), [social.avatars.length]);
  useEffect(() => {
    api.gameFolders().then(setFolders).catch(() => {});
  }, []);

  async function changeFolders(action: () => Promise<unknown>) {
    await action().catch(() => {});
    setFolders(await api.gameFolders().catch(() => folders));
    onLibrary();
  }

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

  const set = (patch: Partial<Settings>) => onSettings({ ...settings, ...patch });
  const dirty = name.trim() !== "" && name.trim() !== profile.name;
  const notificationsFailed = settings.silenceNotifications && boot.guardEnabled && guard.notifications !== "ok" && guard.notifications !== "";

  return (
    <Screen title="Ajustes" tabs={tabs} tab={tab} onTab={setTab} onClose={onClose}>
      {tab === "perfil" && (
        <>
          <h3 className="screen-title">Perfil</h3>
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
          <p className="muted small">Toca tu foto para elegir una imagen de tu PC.</p>

          <section className="setting-group">
            <h4>Galería de avatares</h4>
            {social.avatars.length === 0 ? (
              <p className="muted small">Aquí aparecerán los avatares de Red Level cuando haya alguno disponible.</p>
            ) : (
              <p className="muted small">{fresh > 0 ? `Hay ${fresh} ${fresh === 1 ? "avatar nuevo" : "avatares nuevos"}. Toca uno para ponértelo.` : "Toca uno para ponértelo como foto de perfil."}</p>
            )}
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
        </>
      )}

      {tab === "cuenta" && (
        <>
          <h3 className="screen-title">Cuenta de Red Level</h3>
          {social.status === "loading" && <p className="muted">Conectando con Red Level…</p>}
          {social.status === "none" && <p className="note">Red Level todavía no tiene su web conectada. Cuando lo esté, aquí entrarás con tu cuenta.</p>}
          {social.status === "out" && (
            <div className="setting-narrow">
              <SignIn social={social} intro="Entra con tu cuenta de Red Level, la misma de la web." />
            </div>
          )}
          {social.status === "in" && (
            <>
              <section className="setting-group">
                <h4>Sesión</h4>
                <p>
                  Has entrado como <b>{social.me?.name ?? profile.name}</b>.
                </p>
                {social.me && (
                  <p className="friend-code">
                    Tu código de amigo: <b>{social.me.code}</b>
                    <small className="muted">Pásaselo a quien quieras que te añada.</small>
                  </p>
                )}
                <button className="btn btn-ghost btn-small" onClick={social.signOut}>
                  Cerrar sesión
                </button>
              </section>
              <section className="setting-group">
                <h4>Privacidad</h4>
                <Toggle
                  label="Compartir mi biblioteca y mis horas"
                  hint="Sirve para ver qué juegos se juegan más y mejorar Red Level para ellos. Si lo apagas, se borra lo que ya se había guardado."
                  checked={social.me?.consentLibrary ?? false}
                  onChange={(share) => void social.setConsent(share).catch(() => {})}
                />
              </section>
            </>
          )}
        </>
      )}

      {tab === "biblioteca" && (
        <>
          <h3 className="screen-title">Biblioteca</h3>
          <section className="setting-group">
            <h4>Vista</h4>
            <Choice
              label="Vista de la biblioteca"
              value={settings.view ?? "shelf"}
              options={[
                ["shelf", "Fila de carátulas"],
                ["grid", "Cuadrícula"],
                ["list", "Lista"],
              ]}
              onChange={(view) => set({ view })}
            />
          </section>
          <section className="setting-group">
            <h4>Orden</h4>
            <Choice
              label="Orden de la biblioteca"
              value={settings.sort}
              options={[
                ["recent", "Recientes"],
                ["played", "Más jugados"],
                ["name", "A–Z"],
              ]}
              onChange={(sort) => set({ sort })}
            />
          </section>
          <section className="setting-group">
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
        </>
      )}

      {tab === "sonido" && (
        <>
          <h3 className="screen-title">Sonido y avisos</h3>
          <section className="setting-group">
            <h4>Sonidos de la interfaz</h4>
            <Toggle label="Sonidos de la interfaz" hint="Al moverte entre juegos, al abrir o cerrar paneles y al lanzar un juego." checked={settings.sounds} onChange={(v) => set({ sounds: v })} />
            <label className="slider">
              <span>Volumen</span>
              <input type="range" min={0} max={100} step={5} value={settings.soundVolume ?? 70} disabled={!settings.sounds} onChange={(e) => set({ soundVolume: Number(e.target.value) })} aria-label="Volumen de los sonidos de la interfaz" />
              <b>{settings.soundVolume ?? 70}</b>
            </label>
            <button className="btn btn-ghost btn-small" onClick={() => sfx.launch()} disabled={!settings.sounds}>
              Probar sonido
            </button>
          </section>
          <section className="setting-group">
            <h4>Avisos de Windows</h4>
            <Toggle label="Silenciar las notificaciones" hint="Activa No molestar mientras Red Level está abierto y lo devuelve como estaba al salir." checked={settings.silenceNotifications} onChange={(v) => set({ silenceNotifications: v })} />
            {notificationsFailed && <p className="note note-error">{guard.notifications}</p>}
            <p className="muted small">Los avisos de Red Level (logros, mensajes de amigos, invitaciones) sí salen, flotando en una esquina.</p>
          </section>
        </>
      )}

      {tab === "consola" && (
        <>
          <h3 className="screen-title">Modo consola</h3>
          <section className="setting-group">
            <h4>Mientras Red Level está abierto</h4>
            <Toggle label="Bloquear las teclas de Windows" hint="Tecla Windows, Alt+Tab, Alt+F4 y Ctrl+Esc dejan de sacarte al escritorio." checked={settings.blockKeys} onChange={(v) => set({ blockKeys: v })} />
            <Toggle label="Bloquear Alt+Tab también dentro del juego" hint="Desactívalo si cambias con el teclado entre el juego y otras apps." checked={settings.blockAltTabInGame} onChange={(v) => set({ blockAltTabInGame: v })} />
            <Toggle label="Ocultar la barra de tareas" checked={settings.hideTaskbar} onChange={(v) => set({ hideTaskbar: v })} />
            {!boot.guardEnabled && <p className="note">Red Level se abrió sin bloqueo: estos ajustes no se aplican en esta sesión.</p>}
            {boot.guardEnabled && settings.blockKeys && !guard.keyboardHook && <p className="note note-error">Windows no dejó instalar el bloqueo de teclas en esta sesión.</p>}
          </section>
          <p className="note">
            Salida de emergencia: <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Mayús</kbd> + <kbd>Q</kbd> cierra Red Level y devuelve Windows a la normalidad, pase lo que pase.
          </p>
        </>
      )}

      {tab === "pantallas" && (
        <>
          <h3 className="screen-title">Pantallas</h3>
          <section className="setting-group">
            <h4>Segundo monitor</h4>
            <p className="muted small">Elige si queda apagado o con su barra de Red Level, en cuántos cuadros se divide y qué programas de tu PC van en ella.</p>
            <button className="btn btn-ghost" onClick={onMonitor}>
              Abrir el segundo monitor
            </button>
          </section>
        </>
      )}

      {tab === "acerca" && (
        <>
          <h3 className="screen-title">Acerca de</h3>
          <section className="setting-group">
            <h4>Red Level</h4>
            <p>Versión {boot.version}</p>
            <p className="muted small">Red Level avisa cuando hay una versión nueva y la instala por ti.</p>
          </section>
          <section className="setting-group">
            <h4>Cómo se maneja</h4>
            <ul className="keys-list">
              <li>
                <span>Moverse</span>
                <b>Flechas, WASD o la cruceta del mando</b>
              </li>
              <li>
                <span>Cambiar de biblioteca</span>
                <b>Tab, o LB y RB</b>
              </li>
              <li>
                <span>Abrir y volver</span>
                <b>Enter y Esc, o A y B</b>
              </li>
              <li>
                <span>Salida de emergencia</span>
                <b>Ctrl + Alt + Mayús + Q</b>
              </li>
            </ul>
          </section>
        </>
      )}
    </Screen>
  );
}
