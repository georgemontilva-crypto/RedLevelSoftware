import { useEffect, useState, type FormEvent } from "react";
import { api, errorText, megabytes, track, type Release } from "../api";
import { Link, type Session } from "../App";

export function Account({ session }: { session: Session }) {
  const user = session.user!;
  const [release, setRelease] = useState<Release | null | undefined>(undefined);
  const [name, setName] = useState(user.name);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    api
      .release()
      .then(({ release }) => setRelease(release))
      .catch(() => setRelease(null));
  }, []);

  async function run(action: () => Promise<void>) {
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const download = () =>
    run(async () => {
      setDownloading(true);
      try {
        track("click", "descargar");
        const { url } = await api.download();
        location.href = url;
      } finally {
        setDownloading(false);
      }
    });

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      session.setUser((await api.update({ name: name.trim() })).user);
      setMessage("Nombre guardado.");
    });
  };

  const setConsent = (consentLibrary: boolean) =>
    run(async () => {
      session.setUser((await api.update({ consentLibrary })).user);
      setMessage(consentLibrary ? "Compartirás tu biblioteca la próxima vez que abras Red Level." : "Dejaste de compartir tu biblioteca y borramos la que teníamos guardada.");
    });

  const logout = () =>
    run(async () => {
      await api.logout();
      session.setUser(null);
      session.go("/");
    });

  const remove = () =>
    run(async () => {
      await api.deleteAccount();
      session.setUser(null);
      session.go("/");
    });

  return (
    <main className="narrow">
      <h1>Hola, {user.name.split(" ")[0]}</h1>

      {user.admin && (
        <section className="panel admin-door">
          <div>
            <h2>Panel del equipo</h2>
            <p className="muted">Sube misiones, banners y avatares, reparte RLC y mira las estadísticas.</p>
          </div>
          <div className="admin-door-links">
            <button className="button primary" onClick={() => session.go("/admin#misiones")}>
              Misiones
            </button>
            <button className="button primary" onClick={() => session.go("/admin#publicidad")}>
              Publicidad
            </button>
            <button className="button quiet" onClick={() => session.go("/admin#avatares")}>
              Avatares
            </button>
            <button className="button quiet" onClick={() => session.go("/admin#rlc")}>
              Dar RLC
            </button>
            <button className="button quiet" onClick={() => session.go("/admin")}>
              Todo el panel
            </button>
          </div>
        </section>
      )}

      <section className="panel download">
        <div>
          <h2>Red Level para Windows</h2>
          <p className="muted">
            {release === undefined ? "Buscando la última versión…" : release ? `Versión ${release.version}, ${megabytes(release.size)}. Windows 10 y 11 de 64 bits.` : "El instalador no está disponible ahora mismo. Vuelve en unos minutos."}
          </p>
        </div>
        <button className="button primary" onClick={download} disabled={!release || downloading}>
          {downloading ? "Preparando…" : "Descargar"}
        </button>
      </section>
      <ol className="steps">
        <li>Abre el archivo descargado. Si Windows avisa de que protegió tu PC, pulsa «Más información» y luego «Ejecutar de todas formas».</li>
        <li>Abre Red Level y entra con este mismo correo ({user.email}) y tu contraseña.</li>
      </ol>

      {message && <p className="notice">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="panel">
        <h2>Tu perfil</h2>
        <form className="inline" onSubmit={saveName}>
          <label>
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required />
          </label>
          <button className="button" disabled={name.trim() === user.name || name.trim().length < 2}>
            Guardar nombre
          </button>
        </form>
        <p className="muted">Correo: {user.email}</p>
      </section>

      <section className="panel">
        <h2>Tus datos</h2>
        <label className="check">
          <input type="checkbox" checked={user.consentLibrary} onChange={(e) => setConsent(e.target.checked)} />
          <span>Compartir mi biblioteca y mis horas de juego. Nos sirve para ver qué juegos se juegan más y mejorar Red Level para ellos. Si lo desactivas, borramos lo que ya teníamos.</span>
        </label>
        <p className="muted">
          <Link to="/privacidad" go={session.go}>
            Qué datos guardamos y para qué
          </Link>
        </p>
      </section>

      <section className="panel row">
        <button className="button" onClick={logout}>
          Cerrar sesión
        </button>
        {confirmDelete ? (
          <>
            <span className="muted">Se borran tu cuenta y todos tus datos. No se puede deshacer.</span>
            <button className="button danger" onClick={remove}>
              Sí, eliminar mi cuenta
            </button>
            <button className="button" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button className="button quiet" onClick={() => setConfirmDelete(true)}>
            Eliminar mi cuenta
          </button>
        )}
      </section>
    </main>
  );
}
