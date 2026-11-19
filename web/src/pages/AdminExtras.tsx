import { useEffect, useState } from "react";
import { api, day, type Funnel, type Message } from "../api";

const pageNames: Record<string, string> = { "/": "Portada", "/planes": "Planes", "/tienda": "Store", "/descargas": "Descargas", "/soporte": "Soporte", "/empresas": "Business", "/registro": "Registro", "/entrar": "Entrar", "/cuenta": "Mi cuenta", "/privacidad": "Privacidad", "/terminos": "Términos" };
const clickNames: Record<string, string> = { "descargar-portada": "Botones «Descargar» de la web", descargar: "Descarga del instalador", "ver-como-funciona": "Explorar funciones", "comparar-planes": "Comparar planes", "interes-tienda": "Descargar desde la Store", "pedir-cotizacion": "Cotizaciones enviadas" };
const kindNames: Record<string, string> = { ayuda: "Ayuda", error: "Error", sugerencia: "Sugerencia", empresa: "Cotización" };

function Bars({ rows, names }: { rows: { label: string; total: number }[]; names?: Record<string, string> }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  if (rows.length === 0) return <p className="muted">Todavía no hay datos en este periodo.</p>;
  return (
    <ol className="top-games">
      {rows.map((r) => (
        <li key={r.label}>
          <span>{names?.[r.label] ?? r.label}</span>
          <span className="num">{r.total.toLocaleString("es")}</span>
          <i style={{ width: `${(r.total / max) * 100}%` }} />
        </li>
      ))}
    </ol>
  );
}

/// Recorrido de la visita a la instalación, con el paso de un escalón al siguiente.
export function FunnelPanel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Funnel | null>(null);
  useEffect(() => {
    setData(null);
    api
      .adminFunnel(days)
      .then(setData)
      .catch(() => {});
  }, [days]);

  const top = Math.max(1, ...(data?.steps.map((s) => s.total) ?? [1]));
  return (
    <>
      <div className="summary">
        <h1>Embudo</h1>
        <label className="period">
          Periodo
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        </label>
      </div>
      <section className="panel">
        <ol className="funnel">
          {(data?.steps ?? []).map((step, i, all) => {
            const previous = i > 0 ? all[i - 1].total : 0;
            return (
              <li key={step.label}>
                <span>{step.label}</span>
                <b>{step.total.toLocaleString("es")}</b>
                <small>{i > 0 && previous > 0 ? `${Math.round((step.total / previous) * 100)} % del paso anterior` : ""}</small>
                <i style={{ width: `${(step.total / top) * 100}%` }} />
              </li>
            );
          })}
        </ol>
        {!data && <p className="muted">Cargando…</p>}
      </section>
      <div className="stat-columns">
        <section className="panel">
          <h2>De dónde llegan</h2>
          <Bars rows={data?.sources ?? []} />
        </section>
        <section className="panel">
          <h2>Páginas más vistas</h2>
          <Bars rows={data?.pages ?? []} names={pageNames} />
        </section>
      </div>
      <section className="panel">
        <h2>Clics</h2>
        <Bars rows={data?.clicks ?? []} names={clickNames} />
      </section>
    </>
  );
}

/// Mensajes de soporte y solicitudes de cotización.
export function MessagesPanel() {
  const [messages, setMessages] = useState<Message[] | null>(null);
  useEffect(() => {
    api
      .adminMessages()
      .then(({ messages }) => setMessages(messages))
      .catch(() => setMessages([]));
  }, []);

  async function remove(id: number) {
    await api.adminDeleteMessage(id).catch(() => {});
    setMessages((list) => (list ?? []).filter((m) => m.id !== id));
  }

  return (
    <>
      <h1>Mensajes</h1>
      {messages && messages.length === 0 && <p className="muted">Aquí llegarán los mensajes de soporte y las solicitudes de cotización.</p>}
      <ul className="messages">
        {(messages ?? []).map((m) => (
          <li key={m.id} className="panel">
            <p className="message-head">
              <b className={`tag is-${m.kind}`}>{kindNames[m.kind] ?? m.kind}</b>
              <span>
                {m.name}, <a href={`mailto:${m.email}`}>{m.email}</a>
              </span>
              <span className="muted">{day(m.createdAt)}</span>
            </p>
            {m.business && (
              <p className="muted">
                {m.business}
                {m.seats ? `, ${m.seats} equipos` : ""}
              </p>
            )}
            <p className="message-body">{m.body}</p>
            <button className="button quiet" onClick={() => remove(m.id)}>
              Borrar
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
