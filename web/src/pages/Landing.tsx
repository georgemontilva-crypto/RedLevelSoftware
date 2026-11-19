import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { api, megabytes, type Release } from "../api";
import { Link, type Session } from "../App";
import { Reveal } from "./landing/Extras";
import { AdvantageArt, GlitchBackdrop, HeroLogo, Marquee } from "./landing/Graphics";

const advantages: { art: string; title: string; body: string }[] = [
  { art: "stack", title: "Una sola biblioteca", body: "Steam, Epic y tus juegos instalados, juntos y detectados solos." },
  { art: "ring", title: "Horas y logros sin dar tus claves", body: "Se leen de tu PC. Sin contraseña de Steam ni perfil público." },
  { art: "trophy", title: "Torneos activos", body: "Para algunos juegos en línea hay torneos en marcha. Entras con tu cuenta de Red Level." },
  { art: "keys", title: "Nada te saca de la partida", body: "La tecla Windows y Alt+Tab quedan anuladas; las notificaciones, en silencio." },
  { art: "screens", title: "Segundo monitor con interfaz", body: "Discord, Spotify o YouTube al lado del juego, con su propia barra. O apagado." },
  { art: "timer", title: "Cuenta lo que nadie cuenta", body: "Las horas de Epic y de tus juegos locales las lleva Red Level." },
  { art: "loop", title: "Vuelve solo", body: "Cierras el juego y estás otra vez en tu biblioteca, no en el escritorio." },
  { art: "size", title: "Se descarga en segundos", body: "Sin servicios en segundo plano: cuando lo cierras, se cierra." },
  { art: "switch", title: "Tus datos, tu decisión", body: "Si compartes tu biblioteca, vemos qué se juega más y mejoramos Red Level para esos juegos. Es opcional." },
];

const steps: [string, string][] = [
  ["Crea tu cuenta", "Con tu correo, en un minuto."],
  ["Descarga e instala", "El instalador pesa menos de 3 MB y no pide permisos de administrador."],
  ["Entra y juega", "Abre Red Level con tu cuenta: tus juegos de Steam y Epic ya están ahí."],
];

const included = ["Biblioteca única: Steam, Epic y tus juegos", "Horas y logros de cada juego", "Modo consola: sin escritorio ni avisos", "Segundo monitor con interfaz", "Acceso a los torneos activos", "Actualizaciones incluidas"];

const questions: [string, string][] = [
  ["¿Cuánto cuesta Red Level?", "US$2 al mes. Una sola suscripción, con todo incluido."],
  ["¿Qué necesito para usarlo?", "Un PC con Windows 10 u 11 de 64 bits. Funciona con uno o con dos monitores."],
  ["¿Me pide mi contraseña de Steam o de Epic?", "No, nunca. Lee los juegos, las horas y los logros de los archivos que esas tiendas ya guardan en tu PC."],
  ["Si bloquea las teclas, ¿cómo salgo?", "Con el botón de apagado de Red Level, o con Ctrl + Alt + Mayús + Q en cualquier momento. Al salir, Windows queda como estaba."],
  ["¿Qué datos guardan de mí?", "Tu nombre, tu correo y el uso del programa. Tu biblioteca y tus horas, solo si tú lo activas: nos sirve para ver qué juegos se juegan más y mejorar Red Level para ellos."],
  ["¿Cómo se actualiza?", "Red Level avisa cuando hay una versión nueva. Pulsas «Descargar e instalar» y se actualiza solo, sin perder tu perfil ni tus horas."],
  ["¿Cómo funcionan los torneos?", "Para algunos juegos en línea hay torneos en marcha, y entras con tu cuenta de Red Level. Cada torneo tiene sus propias reglas."],
];

/// Las ventajas: cuadrícula en pantallas anchas y una fila que se desliza de lado en el teléfono.
function Advantages({ size }: { size: string }) {
  const row = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);

  // Cuál es la tarjeta que está más cerca del borde izquierdo de la fila.
  const onScroll = () => {
    const el = row.current;
    if (!el) return;
    const cards = Array.from(el.children) as HTMLElement[];
    const origin = cards[0]?.offsetLeft ?? 0;
    let nearest = 0;
    cards.forEach((card, i) => {
      if (Math.abs(card.offsetLeft - origin - el.scrollLeft) < Math.abs(cards[nearest].offsetLeft - origin - el.scrollLeft)) nearest = i;
    });
    // Al llegar al final, la última no alcanza el borde izquierdo.
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) nearest = cards.length - 1;
    setCurrent(nearest);
  };

  return (
    <Reveal>
      <div className="l-grid" ref={row} onScroll={onScroll}>
        {advantages.map((item) => (
          <article key={item.title}>
            <AdvantageArt kind={item.art} size={size} />
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
      <div className="l-dots" aria-hidden="true">
        {advantages.map((item, i) => (
          <i key={item.title} className={i === current ? "is-on" : ""} />
        ))}
      </div>
    </Reveal>
  );
}

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
        <div className="shapes" aria-hidden="true">
          <span className="s1" />
          <span className="s2" />
        </div>
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
            {!session.user && (
              <Link to="/entrar" go={session.go} className="button">
                Ya tengo cuenta
              </Link>
            )}
          </motion.div>
          <motion.p className="fine" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
            US$2 al mes. Para Windows 10 y 11 de 64 bits.{release && ` Versión ${release.version}.`}
          </motion.p>
        </div>
        <HeroLogo />
      </section>

      <Marquee words={["Steam", "Epic", "Tus juegos", "Horas", "Logros", "Torneos", "Segundo monitor"]} />

      <section className="l-section">
        <Reveal>
          <h2>Por qué Red Level</h2>
        </Reveal>
        <Advantages size={size} />
      </section>

      <section className="l-section l-red" id="como-empezar">
        <Reveal>
          <h2>Cómo empezar</h2>
        </Reveal>
        <ol className="l-steps">
          {steps.map(([title, body], i) => (
            <Reveal key={title} delay={i * 0.1}>
              <li>
                <b>{i + 1}</b>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="l-section" id="preguntas">
        <Reveal>
          <h2>Preguntas frecuentes</h2>
        </Reveal>
        <div className="l-faq">
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="l-section l-price" id="precio">
        <Reveal>
          <div className="price-card">
            <div>
              <h2>Una suscripción, todo incluido</h2>
              <ul>
                {included.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="price-tag">
              <p>
                <b>US$2</b>
                <span>al mes</span>
              </p>
              <Link to={cta} go={session.go} className="button primary">
                {session.user ? "Ir a mi cuenta" : "Crear cuenta"}
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
