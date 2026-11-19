import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { api, megabytes, type Release } from "../api";
import { Link, type Session } from "../App";
import artPlayer from "../assets/arte-entrar.jpg";
import artCity from "../assets/arte-registro.jpg";
import { Demo } from "./landing/Demo";
import { Keys, Reveal, Tilt, TwoScreens } from "./landing/Extras";
import { AdvantageArt, Bracket, GlitchBackdrop, HeroLogo, Marquee } from "./landing/Graphics";

const advantages: { art: string; title: string; body: string }[] = [
  { art: "stack", title: "Una sola biblioteca", body: "Steam, Epic y tus juegos instalados, juntos y detectados solos." },
  { art: "ring", title: "Horas y logros sin dar tus claves", body: "Se leen de tu PC. Sin contraseña de Steam ni perfil público." },
  { art: "timer", title: "Cuenta lo que nadie cuenta", body: "Las horas de Epic y de tus juegos locales las lleva Red Level." },
  { art: "loop", title: "Vuelve solo", body: "Cierras el juego y estás otra vez en tu biblioteca, no en el escritorio." },
  { art: "size", title: "Se descarga en segundos", body: "Sin servicios en segundo plano: cuando lo cierras, se cierra." },
  { art: "switch", title: "Tus datos, tu decisión", body: "Si compartes tu biblioteca, vemos qué se juega más y mejoramos Red Level para esos juegos. Es opcional." },
];

export function Landing({ session }: { session: Session }) {
  const [release, setRelease] = useState<Release | null>(null);
  useEffect(() => {
    api
      .release()
      .then(({ release }) => setRelease(release))
      .catch(() => {});
  }, []);

  const size = release ? megabytes(release.size) : "< 3 MB";
  const cta = session.user ? "/cuenta" : "/registro";
  const ctaLabel = session.user ? "Ir a la descarga" : "Crear cuenta y descargar";

  return (
    <main className="landing">
      <section className="l-hero">
        <GlitchBackdrop />
        <div className="l-hero-text">
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}>
            Tu PC,
            <br />
            en modo consola
          </motion.h1>
          <motion.p className="lead" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.68 }}>
            Todos tus juegos en una pantalla, con tus horas y tus logros. Sin escritorio, sin avisos y sin salirte por error.
          </motion.p>
          <motion.div className="actions" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.86 }}>
            <Link to={cta} go={session.go} className="button primary">
              {ctaLabel}
            </Link>
            <a href="#demo" className="button">
              Verlo funcionar
            </a>
          </motion.div>
          <motion.p className="fine" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
            Gratis. Para Windows 10 y 11 de 64 bits.{release && ` Versión ${release.version}.`}
          </motion.p>
        </div>
        <HeroLogo />
      </section>

      <Marquee words={["Steam", "Epic", "Tus juegos", "Horas", "Logros", "Torneos", "Segundo monitor"]} />

      <section className="l-section" id="demo">
        <Reveal>
          <h2>Pruébalo aquí mismo</h2>
          <p className="lead">Cambia de tienda, pasa por los juegos y pulsa Jugar.</p>
        </Reveal>
        <Reveal delay={0.1}>
          <Demo />
        </Reveal>
      </section>

      <section className="l-section l-split">
        <Reveal>
          <h2>Nada te saca de la partida</h2>
          <p className="lead">Las teclas que te mandan al escritorio dejan de hacerlo. La barra de tareas se esconde y las notificaciones se callan.</p>
        </Reveal>
        <Reveal delay={0.1}>
          <Keys />
        </Reveal>
      </section>

      <section className="l-section l-split is-reverse">
        <Reveal>
          <h2>El segundo monitor también es tuyo</h2>
          <p className="lead">Discord, Spotify o YouTube al lado del juego, con una barra para cambiar entre ellos. O apagado, con un clic.</p>
        </Reveal>
        <Reveal delay={0.1}>
          <TwoScreens />
        </Reveal>
      </section>

      <section className="l-section l-tournaments">
        <Reveal>
          <Tilt>
            <img src={artPlayer} alt="" />
          </Tilt>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="l-tournaments-text">
            <h2>Torneos activos</h2>
            <p className="lead">Para algunos juegos en línea hay torneos en marcha. Con tu cuenta de Red Level puedes entrar y competir.</p>
            <Bracket />
            <Link to={cta} go={session.go} className="button primary">
              {session.user ? "Ir a mi cuenta" : "Crear cuenta para competir"}
            </Link>
          </div>
        </Reveal>
      </section>

      <section className="l-section">
        <Reveal>
          <h2>Por qué Red Level</h2>
        </Reveal>
        <div className="l-grid">
          {advantages.map((item, i) => (
            <Reveal key={item.title} delay={(i % 3) * 0.08}>
              <article>
                <AdvantageArt kind={item.art} size={size} />
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="l-section l-gallery">
        <Reveal>
          <Tilt>
            <img src={artCity} alt="" />
          </Tilt>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="l-gallery-text">
            <h2>Enciende, elige y juega</h2>
            <p className="lead">Tu nombre, tu foto y el último juego que tocaste. Nada más entre tú y la partida.</p>
            <Link to={cta} go={session.go} className="button primary">
              {ctaLabel}
            </Link>
            <p className="fine">Gratis. La cuenta es la misma con la que entras en el programa.</p>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
