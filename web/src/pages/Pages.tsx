import { useEffect, useState } from "react";
import { Check, Minus } from "lucide-react";
import { api, errorText, megabytes, track, type Release } from "../api";
import { Link, type Session } from "../App";
import { notes } from "../notes";
import { ContactForm, downloadPath, PlanCards, StoreCards } from "./Blocks";
import { Shop } from "./Shop";

const longDate = (iso: string) => new Date(iso).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });

// ── Planes ───────────────────────────────────────────────────

const rows: [string, boolean][] = [
  ["Biblioteca única: Steam, Epic y juegos instalados", true],
  ["Horas y logros de cada juego", true],
  ["Modo consola a pantalla completa", true],
  ["Teclas de Windows anuladas y avisos en silencio", true],
  ["Segundo monitor en cuadros, con las apps que tú añadas", true],
  ["Tres temas de color incluidos", true],
  ["Gestión de redes wifi", true],
  ["Acceso a los torneos activos", true],
  ["Actualizaciones desde el programa", true],
  ["Personalización avanzada de la interfaz", false],
  ["Perfiles adicionales", false],
  ["Opciones visuales adicionales", false],
  ["Más formas de organizar tu biblioteca", false],
];

export function Plans({ session }: { session: Session }) {
  return (
    <main className="wide sub">
      <h1>Planes</h1>
      <p className="lead">Red Level es gratuito. PRO es opcional y suma funciones de personalización.</p>
      <PlanCards session={session} />

      <h2>Free y PRO, lado a lado</h2>
      <div className="table-wrap">
        <table className="compare">
          <thead>
            <tr>
              <th>Función</th>
              <th>Free</th>
              <th>PRO</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, free]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{free ? <Check size={18} aria-label="Incluido" /> : <Minus size={18} aria-label="No incluido" />}</td>
                <td>
                  <Check size={18} aria-label="Incluido" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fine">Las funciones de PRO están en desarrollo. El precio y la lista definitiva se confirmarán antes de ponerlo a la venta.</p>

      <div className="duo">
        <section className="panel">
          <h2>Red Level Store</h2>
          <p className="muted">Temas, animaciones e iconos para cambiar el aspecto de tu interfaz. Opcional y, por ahora, en preparación.</p>
          <Link to="/tienda" go={session.go} className="button">
            Explorar Red Level Store
          </Link>
        </section>
        <section className="panel">
          <h2>Red Level Business</h2>
          <p className="muted">Para gaming centers, cibercafés y locales con varios equipos. Licencias y soporte por cotización.</p>
          <Link to="/empresas" go={session.go} className="button">
            Pedir cotización
          </Link>
        </section>
      </div>
    </main>
  );
}

// ── Tienda ───────────────────────────────────────────────────

const prices: [string, string][] = [
  ["Tema básico", "100 RLC"],
  ["Tema premium", "200 RLC"],
  ["Pack de cinco temas", "400 RLC"],
  ["Pack de animaciones", "300 – 400 RLC"],
  ["Interfaz exclusiva", "500 RLC"],
  ["Colección especial", "800 – 1.000 RLC"],
];

export function Store({ session }: { session: Session }) {
  return (
    <main className="wide sub">
      <h1>Red Level Store</h1>
      <p className="lead">Tu Red Level, con tu estilo. Temas, animaciones e iconos para cambiar el aspecto de tu interfaz.</p>
      <Shop session={session} />
      <h2 className="shop-next">Lo que viene</h2>
      <StoreCards />

      <div className="duo">
        <section className="panel">
          <h2>Precios de referencia</h2>
          <ul className="price-list">
            {prices.map(([name, price]) => (
              <li key={name}>
                <span>{name}</span>
                <b>{price}</b>
              </li>
            ))}
          </ul>
          <p className="fine">Como referencia, 100 RLC equivalen a US$1. Pueden cambiar antes de abrir la recarga.</p>
        </section>
        <section className="panel">
          <h2>Cómo va a funcionar</h2>
          <ul className="ticks">
            <li>Es opcional: Red Level se disfruta completo sin comprar nada.</li>
            <li>Se compra con RLC, la moneda de Red Level. Tu wallet es el mismo en la web y en el programa.</li>
            <li>Lo que compras va ligado a tu cuenta: lo recuperas si cambias de PC.</li>
            <li>La política de reembolsos se publicará aquí antes de abrir.</li>
          </ul>
          <Link to={downloadPath(session)} go={session.go} className="button primary" label="interes-tienda">
              Descargar Red Level gratis
            </Link>
        </section>
      </div>
    </main>
  );
}

// ── Descargas ────────────────────────────────────────────────

export function Downloads({ session }: { session: Session }) {
  const [release, setRelease] = useState<Release | null | undefined>(undefined);
  const [history, setHistory] = useState<{ version: string; publishedAt: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .release()
      .then(({ release, history }) => {
        setRelease(release);
        setHistory(history);
      })
      .catch(() => setRelease(null));
  }, []);

  async function download() {
    setBusy(true);
    setError(null);
    track("click", "descargar");
    try {
      location.href = (await api.download()).url;
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="narrow sub">
      <h1>Descargas</h1>
      <p className="lead">El instalador oficial de Red Level, siempre en su última versión.</p>

      <section className="panel download">
        <div>
          <h2>Red Level para Windows</h2>
          <p className="muted">
            {release === undefined ? "Buscando la última versión…" : release ? `Versión ${release.version}, del ${longDate(release.publishedAt)}. ${megabytes(release.size)}.` : "El instalador no está disponible ahora mismo. Vuelve en unos minutos."}
          </p>
        </div>
        {session.user ? (
          <button className="button primary" onClick={download} disabled={!release || busy}>
            {busy ? "Preparando…" : "Descargar gratis"}
          </button>
        ) : (
          <Link to="/registro" go={session.go} className="button primary" label="descargar-portada">
              Crear cuenta y descargar
            </Link>
        )}
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="panel">
        <h2>Requisitos</h2>
        <Requirements release={release ?? null} />
      </section>

      <section className="panel">
        <h2>Qué hace en tu PC y por qué</h2>
        <ul className="ticks">
          <li>Se instala solo para tu usuario: no pide permisos de administrador.</li>
          <li>Lee los archivos de Steam y Epic de tu PC para mostrar tus juegos, horas y logros. No los modifica.</li>
          <li>Mientras está abierto anula la tecla Windows y Alt+Tab, oculta la barra de tareas y silencia los avisos, para que nada te saque del juego. Al cerrarlo, todo vuelve a como estaba.</li>
          <li>Se conecta a internet para tu cuenta y para buscar versiones nuevas.</li>
        </ul>
      </section>

      {release?.sha256 && (
        <section className="panel">
          <h2>Comprueba tu descarga</h2>
          <p className="muted">Para confirmar que el archivo es el oficial, abre PowerShell en la carpeta donde lo descargaste y ejecuta:</p>
          <pre className="code">Get-FileHash .\RedLevel-Setup-{release.version}.exe</pre>
          <p className="muted">El resultado debe ser este código (SHA-256):</p>
          <pre className="code">{release.sha256.toUpperCase()}</pre>
        </section>
      )}

      <section className="panel">
        <h2>Notas de versión</h2>
        <ul className="versions">
          {history.map(({ version, publishedAt }) => (
            <li key={version}>
              <b>{version}</b>
              <span className="muted">{longDate(publishedAt)}</span>
              {(notes[version] ?? ["Mejoras y correcciones."]).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </li>
          ))}
        </ul>
        {history.length === 0 && <p className="muted">El historial no está disponible ahora mismo.</p>}
      </section>
    </main>
  );
}

/// Requisitos publicados. Se usa en la portada y en la página de descargas.
export function Requirements({ release }: { release: Release | null }) {
  const items: [string, string][] = [
    ["Sistema operativo", "Windows 10 u 11, de 64 bits."],
    ["Procesador y memoria", "Los mínimos de tu Windows. Estamos midiendo en más equipos para publicar cifras recomendadas."],
    ["Almacenamiento", `El instalador pesa ${release ? megabytes(release.size) : "menos de 3 MB"}.`],
    ["Conexión", "Internet para crear tu cuenta, descargar y actualizar. Tus juegos, horas y logros se leen de tu PC."],
    ["Mandos", "Xbox, PS4 y PS5, además de teclado (WASD o flechas) y ratón."],
    ["Versión actual", release ? `${release.version}, publicada el ${longDate(release.publishedAt)}.` : "Consulta la página de descargas."],
  ];
  return (
    <dl className="reqs">
      {items.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Soporte ──────────────────────────────────────────────────

const quick: [string, string][] = [
  ["¿Cómo salgo de Red Level?", "Con el botón de apagado de arriba a la derecha, o con Ctrl + Alt + Mayús + Q en cualquier momento. Al salir, Windows queda como estaba."],
  ["No aparece uno de mis juegos", "Red Level detecta los juegos de Steam y de Epic, y los de carpetas como C:\\Games o D:\\Juegos. Si los tienes en otra, añádela en tu perfil, en «Carpetas de juegos». También puedes añadir uno suelto con «Añadir un juego»."],
  ["Las horas de un juego de Epic empiezan en cero", "Epic no guarda las horas en tu PC, así que Red Level las cuenta desde que lo instalas."],
  ["¿Cómo divido el segundo monitor?", "En su barra, a la derecha, eliges en cuántos cuadros repartirlo: de pantalla sola a 12. Al tocar un cuadro, esa app se abre en grande; «Volver a la cuadrícula» la devuelve a su sitio."],
  ["¿Cómo cambio los colores?", "Abre Red Level Store con el icono de la bolsa, arriba a la derecha, y pulsa «Usar» en el tema que quieras."],
  ["¿Cómo añado apps al segundo monitor?", "En su barra pulsa «Añadir app»: sale la lista de programas instalados en tu PC con su icono. Tocas uno y queda en la barra."],
  ["¿Cómo actualizo?", "Red Level avisa cuando hay una versión nueva. Pulsa «Descargar e instalar» y se actualiza solo."],
];

export function Support({ session }: { session: Session }) {
  const [contact, setContact] = useState<string | null>(null);
  useEffect(() => {
    api
      .config()
      .then(({ contactEmail }) => setContact(contactEmail))
      .catch(() => {});
  }, []);

  return (
    <main className="narrow sub">
      <h1>Soporte</h1>
      <p className="lead">Pide ayuda, reporta un error o cuéntanos qué mejorarías.</p>

      <section className="panel">
        <h2>Respuestas rápidas</h2>
        <div className="l-faq">
          {quick.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
        <p className="fine">
          Hay más en las{" "}
          <Link to="/#preguntas" go={session.go}>
            preguntas frecuentes
          </Link>
          .
        </p>
      </section>

      <section className="panel" id="contacto">
        <h2>Escríbenos</h2>
        <ContactForm session={session} />
        {contact && (
          <p className="fine">
            También puedes escribir a <a href={`mailto:${contact}`}>{contact}</a>.
          </p>
        )}
      </section>
    </main>
  );
}

// ── Empresas ─────────────────────────────────────────────────

export function Business({ session }: { session: Session }) {
  return (
    <main className="narrow sub">
      <h1>Red Level Business</h1>
      <p className="lead">Para gaming centers, cibercafés, salas de entretenimiento y cualquier local con varios equipos.</p>

      <section className="panel">
        <h2>Qué incluye</h2>
        <ul className="ticks">
          <li>Licencias comerciales para todos tus equipos.</li>
          <li>Instalación y configuración asistidas.</li>
          <li>La misma experiencia en cada equipo.</li>
          <li>Soporte técnico prioritario.</li>
        </ul>
        <p className="muted">El precio depende de la cantidad de equipos y de lo que necesite tu local. Te enviamos una cotización a medida.</p>
      </section>

      <section className="panel">
        <h2>Pide tu cotización</h2>
        <ContactForm session={session} business />
      </section>
    </main>
  );
}
