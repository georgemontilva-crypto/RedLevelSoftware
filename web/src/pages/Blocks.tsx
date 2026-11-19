import { useState, type FormEvent } from "react";
import { Gem, Palette, Shapes, Sparkles } from "lucide-react";
import { api, errorText, track } from "../api";
import { Link, type Session } from "../App";

/// A dónde lleva "Descargar": a la descarga si ya hay sesión, a crear la cuenta si no.
export const downloadPath = (session: Session) => (session.user ? "/descargas" : "/registro");

// ── Planes ───────────────────────────────────────────────────

export const freeItems = ["Biblioteca única: Steam, Epic y tus juegos instalados", "Horas y logros de cada juego", "Modo consola a pantalla completa", "Teclas de Windows anuladas y avisos en silencio", "Segundo monitor en cuadros, con las apps que tú añadas", "Tres temas de color incluidos", "Acceso a los torneos activos", "Actualizaciones desde el programa"];
export const proItems = ["Todo lo de Free", "Personalización avanzada de la interfaz", "Perfiles adicionales", "Más opciones visuales", "Más formas de organizar tu biblioteca"];

export function PlanCards({ session }: { session: Session }) {
  return (
    <div className="plans">
      <article className="plan">
        <h3>Free</h3>
        <p className="plan-sub">Red Level Essential</p>
        <p className="plan-price">
          <b>US$0</b>
          <span>gratis para todos</span>
        </p>
        <ul>
          {freeItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Link to={downloadPath(session)} go={session.go} className="button primary" label="descargar-portada">
            Descargar gratis
          </Link>
      </article>
      <article className="plan is-pro">
        <h3>PRO</h3>
        <p className="plan-sub">Red Level PRO</p>
        <p className="plan-price">
          <b>US$4.99</b>
          <span>pago único</span>
        </p>
        <ul>
          {proItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="soon">Próximamente. Todavía no está a la venta.</p>
      </article>
    </div>
  );
}

// ── Tienda ───────────────────────────────────────────────────

const storeItems = [
  { icon: Palette, name: "Themes", body: "Temas visuales para cambiar el aspecto de la interfaz.", price: "desde US$0.99" },
  { icon: Sparkles, name: "Motion Packs", body: "Fondos animados, transiciones y efectos.", price: "desde US$2.99" },
  { icon: Shapes, name: "Icon Packs", body: "Colecciones de iconos y elementos gráficos.", price: "desde US$0.99" },
  { icon: Gem, name: "Exclusive Editions", body: "Colecciones especiales creadas por diseñadores.", price: "desde US$7.99" },
];

export function StoreCards() {
  return (
    <div className="store-cards">
      {storeItems.map(({ icon: Icon, name, body, price }) => (
        <article key={name}>
          <Icon size={30} strokeWidth={1.6} aria-hidden="true" />
          <h3>{name}</h3>
          <p>{body}</p>
          <b>{price}</b>
        </article>
      ))}
    </div>
  );
}

// ── Formulario de contacto ───────────────────────────────────

const kinds: [string, string][] = [
  ["ayuda", "Necesito ayuda"],
  ["error", "Reportar un error"],
  ["sugerencia", "Enviar una sugerencia"],
];

/// Formulario de soporte; con `business`, el de cotización para negocios.
export function ContactForm({ session, business = false }: { session: Session; business?: boolean }) {
  const [kind, setKind] = useState("ayuda");
  const [name, setName] = useState(session.user?.name ?? "");
  const [email, setEmail] = useState(session.user?.email ?? "");
  const [company, setCompany] = useState("");
  const [seats, setSeats] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.contact({ kind: business ? "empresa" : kind, name, email, message, business: company, seats: Number(seats) || undefined, website });
      if (business) track("click", "pedir-cotizacion");
      setSent(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="notice" role="status">
        {business ? "Solicitud enviada. Te escribiremos al correo que dejaste con la cotización." : "Mensaje enviado. Te responderemos al correo que dejaste."}
      </p>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      {!business && (
        <label>
          ¿De qué se trata?
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="two">
        <label>
          Nombre
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={80} />
        </label>
        <label>
          Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
      </div>
      {business && (
        <div className="two">
          <label>
            Nombre del negocio
            <input value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" required minLength={2} maxLength={120} />
          </label>
          <label>
            Cantidad de equipos
            <input type="number" inputMode="numeric" min={1} max={100000} value={seats} onChange={(e) => setSeats(e.target.value)} required />
          </label>
        </div>
      )}
      <label>
        {business ? "Cuéntanos qué necesitas" : kind === "error" ? "Qué pasó y qué estabas haciendo" : "Tu mensaje"}
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} required minLength={10} maxLength={4000} />
      </label>
      {/* Campo trampa para robots: las personas no lo ven. */}
      <input className="trap" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(e) => setWebsite(e.target.value)} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? "Enviando…" : business ? "Pedir cotización" : "Enviar"}
      </button>
    </form>
  );
}
