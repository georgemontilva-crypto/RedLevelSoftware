import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Gamepad2, Monitor, MonitorSpeaker, Tv } from "lucide-react";
import { api, megabytes, type Release } from "../api";
import { Link, type Session } from "../App";
import bibliotecaShot from "../assets/captura-biblioteca.webp";
import logrosShot from "../assets/captura-logros.webp";
import { downloadPath, PlanCards, StoreCards } from "./Blocks";
import { Reveal } from "./landing/Extras";
import { AdvantageArt, GlitchBackdrop, HeroLogo, Marquee } from "./landing/Graphics";
import { Requirements } from "./Pages";

const advantages: { art: string; title: string; body: string }[] = [
  { art: "stack", title: "Una sola biblioteca", body: "Steam, Epic y tus juegos instalados, juntos y detectados solos." },
  { art: "ring", title: "Horas y logros sin dar tus claves", body: "Se leen de tu PC. Sin contraseña de Steam ni perfil público." },
  { art: "keys", title: "Nada te saca de la partida", body: "La tecla Windows y Alt+Tab quedan anuladas; las notificaciones, en silencio." },
  { art: "screens", title: "Segundo monitor con interfaz", body: "Añade a su barra los programas de tu PC que quieras tener al lado del juego. O apágalo." },
  { art: "timer", title: "Cuenta lo que nadie cuenta", body: "Las horas de Epic y de tus juegos locales las lleva Red Level." },
  { art: "loop", title: "Vuelve solo", body: "Cierras el juego y estás otra vez en tu biblioteca, no en el escritorio." },
  { art: "trophy", title: "Torneos activos", body: "Para algunos juegos en línea hay torneos en marcha. Entras con tu cuenta de Red Level." },
  { art: "size", title: "Se descarga en segundos", body: "Sin servicios en segundo plano: cuando lo cierras, se cierra." },
  { art: "switch", title: "Tus datos, tu decisión", body: "Si compartes tu biblioteca, vemos qué se juega más y mejoramos Red Level para esos juegos. Es opcional." },
];

const what: [string, string][] = [
  ["Para quién es", "Para quien juega en PC y quiere llegar al juego sin pasar por el escritorio."],
  ["Qué resuelve", "Tus juegos están repartidos entre tiendas y carpetas. Aquí están todos juntos, con tus horas y tus logros."],
  ["Qué cambia frente a Windows", "Mientras juegas no hay barra de tareas, ni avisos, ni teclas que te saquen de la partida."],
];

const setups = [
  { icon: Monitor, title: "En tu escritorio", body: "A pantalla completa en tu monitor, con teclado y ratón.", soon: false },
  { icon: Tv, title: "En el televisor", body: "Conecta tu PC a la tele y enciéndelo como una consola.", soon: false },
  { icon: MonitorSpeaker, title: "Con dos pantallas", body: "El juego en una y, en la otra, las apps de tu PC que tú elijas.", soon: false },
  { icon: Gamepad2, title: "Con mando", body: "La navegación con mando está en desarrollo.", soon: true },
];

const steps: [string, string][] = [
  ["Descarga", "Crea tu cuenta y descarga el instalador oficial desde esta web."],
  ["Instala y configura", "Pesa menos de 3 MB y no pide permisos de administrador. Pon tu nombre y tu foto."],
  ["Disfruta", "Abre Red Level: tus juegos de Steam y Epic ya están ahí."],
];

const questions: [string, string][] = [
  ["¿Qué es Red Level Software?", "Un programa para Windows que reúne tus juegos en una interfaz a pantalla completa, como la de una consola."],
  ["¿Red Level es gratuito?", "Sí. La versión principal es gratis y no tiene suscripciones obligatorias. PRO será una mejora opcional, de pago único."],
  ["¿Qué diferencia hay entre Free y PRO?", "Free es la experiencia completa de hoy. PRO, cuando salga, añadirá personalización avanzada, perfiles adicionales y más opciones visuales."],
  ["¿Es compatible con Windows 10 y Windows 11?", "Sí, en sus versiones de 64 bits."],
  ["¿Puedo usar un mando?", "Todavía no: hoy se maneja con teclado y ratón. La navegación con mando está en desarrollo."],
  ["¿Necesito conexión a internet?", "Para crear tu cuenta, descargar y actualizar. Tu biblioteca, tus horas y tus logros se leen de tu propio PC."],
  ["¿Me pide mi contraseña de Steam o de Epic?", "No, nunca. Lee los juegos, las horas y los logros de los archivos que esas tiendas ya guardan en tu PC."],
  ["Si bloquea las teclas, ¿cómo salgo?", "Con el botón de apagado de Red Level, o con Ctrl + Alt + Mayús + Q en cualquier momento. Al salir, Windows queda como estaba."],
  ["¿Cómo instalo Red Level?", "Crea tu cuenta, descarga el instalador y ábrelo. No pide permisos de administrador."],
  ["¿Cómo recibo actualizaciones?", "Red Level avisa cuando hay una versión nueva. Pulsas «Descargar e instalar» y se actualiza solo, sin perder tu perfil ni tus horas."],
  ["¿Qué datos guardan de mí?", "Tu nombre, tu correo y el uso del programa. Tu biblioteca y tus horas, solo si tú lo activas: nos sirve para ver qué juegos se juegan más y mejorar Red Level para ellos."],
  ["¿Dónde pido soporte?", "En la página de soporte puedes pedir ayuda, reportar un error o enviar una sugerencia."],
  ["¿Cómo funcionarán las compras de Red Level Store?", "La tienda venderá temas, animaciones y paquetes de personalización para Red Level. Todavía no está abierta."],
  ["¿Podré recuperar mis compras si cambio de computadora?", "Ese es el plan: las compras irán ligadas a tu cuenta de Red Level."],
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
  const [community, setCommunity] = useState<string | null>(null);
  useEffect(() => {
    api
      .release()
      .then(({ release }) => setRelease(release))
      .catch(() => {});
    api
      .config()
      .then(({ communityUrl }) => setCommunity(communityUrl))
      .catch(() => {});
  }, []);

  const size = release ? megabytes(release.size) : "< 3 MB";
  const cta = downloadPath(session);
  const download = (label: string) => (
    <Link to={cta} go={session.go} className="button primary" label="descargar-portada">
        {label}
      </Link>
  );

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
            Tu PC.
            <br />
            Tu biblioteca.
            <br />
            Tu consola.
          </motion.h1>
          <motion.p className="lead" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.68 }}>
            Red Level convierte tu computadora en una consola: todos tus juegos en una sola pantalla, con tus horas y tus logros.
          </motion.p>
          <motion.p className="hero-free" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
            Gratis. Sin suscripciones obligatorias.
          </motion.p>
          <motion.div className="actions" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.86 }}>
            {download("Descargar Red Level")}
            <Link to="/#caracteristicas" go={session.go} className="button" label="ver-como-funciona">
                Explorar funciones
              </Link>
          </motion.div>
          <motion.p className="fine" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
            Windows 10 y 11 · Descarga gratuita · Actualizaciones incluidas{release && ` · Versión ${release.version}`}
          </motion.p>
        </div>
        <HeroLogo />
      </section>

      <Marquee words={["Steam", "Epic", "Tus juegos", "Horas", "Logros", "Torneos", "Segundo monitor"]} />

      <section className="l-section l-what" id="que-es">
        <Reveal>
          <div className="l-what-grid">
            <div>
              <h2>Tu computadora, una nueva experiencia</h2>
              <p className="lead">Red Level es un programa para Windows que cambia el escritorio por una interfaz a pantalla completa, como la de una consola. Enciendes, eliges juego y juegas.</p>
              <dl className="what-list">
                {what.map(([term, value]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <figure className="shot">
              <img src={bibliotecaShot} alt="La biblioteca de Red Level a pantalla completa, con el juego elegido, sus horas y sus logros" width={1600} height={900} loading="lazy" />
            </figure>
          </div>
        </Reveal>
      </section>

      <section className="l-section" id="caracteristicas">
        <Reveal>
          <h2>Todo lo que necesitas para tu experiencia gaming</h2>
        </Reveal>
        <Advantages size={size} />
      </section>

      <section className="l-section" id="galeria">
        <Reveal>
          <h2>No te lo contamos. Te lo mostramos.</h2>
          <figure className="shot l-video">
            <video src="/red-level-en-accion.mp4" poster={bibliotecaShot} controls muted playsInline preload="metadata" width={1280} height={720} />
          </figure>
          <div className="l-shots">
            <figure className="shot">
              <img src={bibliotecaShot} alt="Biblioteca de Red Level" width={1600} height={900} loading="lazy" />
              <figcaption>Tu biblioteca, con todas tus tiendas juntas.</figcaption>
            </figure>
            <figure className="shot">
              <img src={logrosShot} alt="Panel de logros de un juego en Red Level" width={1600} height={900} loading="lazy" />
              <figcaption>Horas y logros de cada juego.</figcaption>
            </figure>
          </div>
          <p className="fine">Grabado en el propio programa, con juegos de ejemplo.</p>
        </Reveal>
      </section>

      <section className="l-section" id="setup">
        <Reveal>
          <h2>Tu setup. Tus reglas. Tu experiencia.</h2>
          <div className="l-setups">
            {setups.map(({ icon: Icon, title, body, soon }) => (
              <article key={title} className={soon ? "is-soon" : ""}>
                <Icon size={34} strokeWidth={1.5} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="l-section" id="store">
        <Reveal>
          <h2>Tu Red Level. Tu estilo.</h2>
          <p className="lead">Red Level Store abrirá con temas, animaciones e iconos para cambiar el aspecto de tu interfaz. Es opcional: Red Level se disfruta completo sin comprar nada.</p>
          <StoreCards />
          <div className="actions">
            <Link to="/tienda" go={session.go} className="button">
              Explorar Red Level Store
            </Link>
            <p className="soon">Próximamente</p>
          </div>
        </Reveal>
      </section>

      <section className="l-section" id="planes">
        <Reveal>
          <h2>Elige tu experiencia Red Level</h2>
          <p className="lead">Red Level es gratuito. PRO es opcional y suma funciones de personalización.</p>
          <PlanCards session={session} />
          <div className="actions">
            <Link to="/planes" go={session.go} className="button" label="comparar-planes">
                Comparar planes
              </Link>
            <Link to="/empresas" go={session.go} className="button quiet">
              ¿Tienes un local? Red Level Business
            </Link>
          </div>
        </Reveal>
      </section>

      <section className="l-section l-red" id="como-empezar">
        <Reveal>
          <h2>Tres pasos para entrar a Red Level</h2>
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
        <div className="actions">{download("Descargar Red Level gratis")}</div>
      </section>

      <section className="l-section" id="requisitos">
        <Reveal>
          <h2>¿Tu PC está lista para Red Level?</h2>
          <Requirements release={release} />
        </Reveal>
      </section>

      <section className="l-section" id="preguntas">
        <Reveal>
          <h2>Todo lo que necesitas saber sobre Red Level</h2>
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

      <section className="l-section" id="comunidad">
        <Reveal>
          <h2>No juegues solo. Forma parte de Red Level.</h2>
          <p className="lead">Comparte tus ideas, reporta errores y entérate primero de las novedades. Red Level crece con quienes lo usan.</p>
          <div className="actions">
            {community && (
              <a href={community} className="button primary" target="_blank" rel="noreferrer">
                Unirme a la comunidad
              </a>
            )}
            <Link to="/soporte" go={session.go} className="button">
              Enviar una sugerencia
            </Link>
          </div>
        </Reveal>
      </section>

      <section className="l-section l-final">
        <Reveal>
          <div className="final-card">
            <h2>Tu PC está lista para subir de nivel</h2>
            <p>Descarga Red Level gratis y empieza a construir tu propia experiencia.</p>
            {download("Descargar Red Level gratis")}
          </div>
        </Reveal>
      </section>
    </main>
  );
}
