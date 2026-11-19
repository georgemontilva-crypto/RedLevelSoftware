import { useEffect, useState, type MouseEvent } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { api, megabytes, type Release } from "../api";
import { Link, type Session } from "../App";
import artPlayer from "../assets/arte-entrar.jpg";
import artCity from "../assets/arte-registro.jpg";
import { PILL, RING_PATH, RING_WIDTH } from "../logoPaths";
import { Demo } from "./landing/Demo";
import { Keys, Reveal, Tilt, TwoScreens } from "./landing/Extras";

export function Landing({ session }: { session: Session }) {
  const [release, setRelease] = useState<Release | null>(null);
  useEffect(() => {
    api
      .release()
      .then(({ release }) => setRelease(release))
      .catch(() => {});
  }, []);

  // El aro del logo sigue al cursor con un poco de retraso.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 16 });
  const sy = useSpring(my, { stiffness: 60, damping: 16 });
  const ringX = useTransform(sx, (v) => v * 26);
  const ringY = useTransform(sy, (v) => v * 26);
  const artX = useTransform(sx, (v) => v * -14);
  const artY = useTransform(sy, (v) => v * -14);
  const onMove = (event: MouseEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    mx.set((event.clientX - box.left) / box.width - 0.5);
    my.set((event.clientY - box.top) / box.height - 0.5);
  };

  const size = release ? megabytes(release.size) : "menos de 3 MB";
  const cta = session.user ? "/cuenta" : "/registro";

  const advantages: [string, string][] = [
    ["Una biblioteca, tres orígenes", "Steam, Epic y los juegos que instalaste por tu cuenta aparecen juntos. Los de Steam y Epic se detectan solos; los demás se añaden con su ejecutable."],
    ["Horas y logros sin dar tus claves", "Red Level los lee de los archivos que Steam ya guarda en tu PC. No te pide la contraseña de Steam, ni una clave de API, ni tener el perfil público."],
    ["También cuenta lo que nadie cuenta", "Epic no comparte tus horas, y tus juegos locales no las llevan. Red Level las cuenta por ti mientras está abierto."],
    ["Vuelve solo", "Al cerrar el juego estás otra vez en tu biblioteca, no en el escritorio. Eliges el siguiente y sigues."],
    [`El instalador pesa ${size}`, "Menos que una foto. No instala servicios ni se queda en segundo plano: cuando lo cierras, se cierra."],
    ["Tus datos, tu decisión", "Compartir tu biblioteca es opcional y se cambia con un clic. Eliminar la cuenta borra todo al instante."],
  ];

  return (
    <main className="landing">
      <section className="l-hero" onMouseMove={onMove}>
        <div className="l-hero-text">
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}>
            Tu PC,
            <br />
            en modo consola
          </motion.h1>
          <motion.p className="lead" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.68 }}>
            Red Level reúne todos tus juegos en una sola pantalla, con tus horas y tus logros, y aparta Windows mientras juegas: sin escritorio, sin avisos y sin salirte por error.
          </motion.p>
          <motion.div className="actions" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.86 }}>
            <Link to={cta} go={session.go} className="button primary">
              {session.user ? "Ir a la descarga" : "Crear cuenta y descargar"}
            </Link>
            <a href="#demo" className="button">
              Verlo funcionar
            </a>
          </motion.div>
          <motion.p className="fine" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
            Gratis. Para Windows 10 y 11 de 64 bits.{release && ` Versión ${release.version}.`}
          </motion.p>
        </div>

        <div className="l-portal" aria-hidden="true">
          <motion.div className="l-portal-glow" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.4, delay: 0.9 }} />
          <motion.div className="l-portal-art" style={{ x: artX, y: artY }} initial={{ clipPath: "circle(0% at 50% 50%)" }} animate={{ clipPath: "circle(50% at 50% 50%)" }} transition={{ duration: 1.1, ease: [0.76, 0, 0.24, 1], delay: 1.0 }}>
            <img src={artPlayer} alt="" />
          </motion.div>
          <motion.svg className="l-portal-ring" viewBox="-116 -116 232 232" fill="none" style={{ x: ringX, y: ringY }}>
            <motion.path d={RING_PATH} stroke="var(--red)" strokeWidth={RING_WIDTH * 0.42} strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ pathLength: { duration: 1.2, ease: [0.65, 0, 0.35, 1], delay: 0.15 }, opacity: { duration: 0.1, delay: 0.15 } }} />
            <motion.rect x={PILL.x} y={PILL.y + 8} width={PILL.width} height={PILL.height * 0.42} rx={6} fill="var(--red)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3, duration: 0.3 }} />
          </motion.svg>
        </div>
      </section>

      <section className="l-facts">
        <p>
          <b>3</b> orígenes en una sola biblioteca: Steam, Epic y tus juegos instalados
        </p>
        <p>
          <b>0</b> contraseñas de tiendas: Red Level nunca te las pide
        </p>
        <p>
          <b>{size}</b> ocupa el instalador
        </p>
      </section>

      <section className="l-section" id="demo">
        <Reveal>
          <h2>Pruébalo aquí mismo</h2>
          <p className="lead">Esto es Red Level en pequeño. Cambia de tienda, pasa por los juegos y pulsa Jugar.</p>
        </Reveal>
        <Reveal delay={0.1}>
          <Demo />
        </Reveal>
      </section>

      <section className="l-section l-split">
        <Reveal>
          <h2>Nada te saca de la partida</h2>
          <p className="lead">Un roce a la tecla Windows y adiós a la partida. Con Red Level abierto, las teclas que te mandan al escritorio dejan de hacerlo, la barra de tareas se esconde y las notificaciones se silencian.</p>
          <p className="muted">Al salir, Windows vuelve a estar exactamente como lo dejaste.</p>
        </Reveal>
        <Reveal delay={0.1}>
          <Keys />
        </Reveal>
      </section>

      <section className="l-section l-split is-reverse">
        <Reveal>
          <h2>El segundo monitor también es tuyo</h2>
          <p className="lead">Juega en una pantalla y ten Discord, Spotify o YouTube en la otra, con una barra de Red Level para cambiar entre ellos sin soltar el juego. ¿Prefieres oscuridad total? Apágalo con un clic.</p>
        </Reveal>
        <Reveal delay={0.1}>
          <TwoScreens />
        </Reveal>
      </section>

      <section className="l-section">
        <Reveal>
          <h2>Por qué Red Level</h2>
        </Reveal>
        <div className="l-grid">
          {advantages.map(([title, body], i) => (
            <Reveal key={title} delay={(i % 3) * 0.08}>
              <article>
                <h3>{title}</h3>
                <p>{body}</p>
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
            <p className="lead">Red Level abre con tu nombre, tu foto y el último juego que tocaste. Sin iconos, sin ventanas, sin nada entre tú y la partida.</p>
            <Link to={cta} go={session.go} className="button primary">
              {session.user ? "Ir a la descarga" : "Crear cuenta y descargar"}
            </Link>
            <p className="fine">Gratis. La cuenta se crea en un minuto y es la misma con la que entras en el programa.</p>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
