import { useEffect, useState } from "react";
import { api, megabytes, type Release } from "../api";
import { Link, type Session } from "../App";
import art from "../assets/arte-entrar.jpg";

const features = [
  ["Todo en un sitio", "Red Level encuentra solo tus juegos de Steam y Epic, y añades los demás con su ejecutable."],
  ["Tus horas y tus logros", "Cuánto has jugado, cuándo fue la última vez y qué logros te faltan, en la ficha de cada juego."],
  ["Sin escritorio a la vista", "Pantalla completa, notificaciones en silencio y teclas de Windows anuladas para no salirte por error."],
  ["Segundo monitor con interfaz", "Discord, Spotify o YouTube al lado, con una barra propia para cambiar entre ellos."],
];

export function Landing({ session }: { session: Session }) {
  const [release, setRelease] = useState<Release | null>(null);
  useEffect(() => {
    api
      .release()
      .then(({ release }) => setRelease(release))
      .catch(() => {});
  }, []);

  return (
    <main>
      <section className="hero">
        <div className="hero-text">
          <h1>
            Tu PC,
            <br />
            en modo consola
          </h1>
          <p className="lead">Red Level reúne tus juegos de Steam, Epic y los que tienes instalados en una sola pantalla, con tus horas y tus logros.</p>
          <div className="actions">
            <Link to={session.user ? "/cuenta" : "/registro"} go={session.go} className="button primary">
              {session.user ? "Ir a la descarga" : "Crear cuenta y descargar"}
            </Link>
            {!session.user && (
              <Link to="/entrar" go={session.go} className="button">
                Ya tengo cuenta
              </Link>
            )}
          </div>
          <p className="fine">
            Gratis. Windows 10 y 11 de 64 bits.
            {release && ` Versión ${release.version}, ${megabytes(release.size)}.`}
          </p>
        </div>
        <div className="art">
          <img src={art} alt="" />
        </div>
      </section>

      <section className="features">
        {features.map(([title, body]) => (
          <article key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
