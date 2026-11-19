import { useEffect, useState } from "react";
import { api, day, type AdminAd, type Funnel, type Message } from "../api";

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

/// Recorta la imagen al centro, la deja en 256 px y la convierte a WebP: así pesa poco y todas quedan iguales.
function squareWebp(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.width, image.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      canvas.getContext("2d")?.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);
      URL.revokeObjectURL(image.src);
      resolve(canvas.toDataURL("image/webp", 0.86));
    };
    image.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
    image.src = URL.createObjectURL(file);
  });
}

/// Galería de avatares: lo que subas aquí aparece en el perfil de todos los usuarios del programa.
export function AvatarsPanel() {
  const [avatars, setAvatars] = useState<{ id: number; name: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .avatars()
      .then(({ avatars }) => setAvatars(avatars))
      .catch(() => setAvatars([]));
  }, []);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const name = file.name.replace(/\.[^.]+$/, "").slice(0, 60);
        const { avatar } = await api.adminAddAvatar(name, await squareWebp(file));
        setAvatars((list) => [avatar, ...(list ?? [])]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await api.adminDeleteAvatar(id).catch(() => {});
    setAvatars((list) => (list ?? []).filter((a) => a.id !== id));
  }

  return (
    <>
      <h1>Avatares</h1>
      <section className="panel">
        <p className="muted">Sube las imágenes que quieras ofrecer como avatar. Se recortan en cuadrado y aparecen en el perfil de cada usuario la próxima vez que abra Red Level.</p>
        <label className="button primary upload">
          {busy ? "Subiendo…" : "Subir avatares"}
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={(e) => upload(e.target.files).then(() => (e.target.value = ""))} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {avatars && avatars.length === 0 && <p className="muted">Todavía no hay ninguno.</p>}
        <ul className="avatar-grid">
          {(avatars ?? []).map((avatar) => (
            <li key={avatar.id}>
              <img src={`/api/avatars/${avatar.id}/image`} alt={avatar.name} loading="lazy" />
              <button className="button quiet" onClick={() => remove(avatar.id)} aria-label={`Borrar ${avatar.name}`}>
                Borrar
              </button>
            </li>
          ))}
        </ul>
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

/// Recorta la imagen al centro en vertical (el doble de alta que de ancha), la deja en 600 × 1200 y la convierte a WebP.
function bannerWebp(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = Math.min(image.width, image.height / 2);
      const height = width * 2;
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 1200;
      canvas.getContext("2d")?.drawImage(image, (image.width - width) / 2, (image.height - height) / 2, width, height, 0, 0, 600, 1200);
      URL.revokeObjectURL(image.src);
      resolve(canvas.toDataURL("image/webp", 0.88));
    };
    image.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
    image.src = URL.createObjectURL(file);
  });
}

/// Publicidad: los banners que salen en Novedades, dentro del programa, y cuánto se ve y se pulsa cada uno.
export function AdsPanel() {
  const [ads, setAds] = useState<AdminAd[] | null>(null);
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [days, setDays] = useState("30");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    api
      .adminAds()
      .then(({ ads }) => setAds(ads))
      .catch(() => setAds([]));
  useEffect(() => void load(), []);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setError("Elige la imagen del banner.");
    setBusy(true);
    setError(null);
    try {
      const { ad } = await api.adminAddAd({ name: name.trim(), link: link.trim(), image: await bannerWebp(file), days: Number(days) || 0 });
      setAds((list) => [ad, ...(list ?? [])]);
      setName("");
      setLink("");
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el banner.");
    } finally {
      setBusy(false);
    }
  }

  const stateOf = (ad: AdminAd) => (ad.endsAt !== null && ad.endsAt * 1000 < Date.now() ? "Terminó" : ad.active ? "En pantalla" : "En pausa");
  return (
    <>
      <h1>Publicidad</h1>
      <section className="panel">
        <p className="muted">Los banners salen en Novedades, dentro del programa, en una columna fija a la derecha: uno a la vez, pasando solos. Son verticales (600 × 1200 px); si la imagen tiene otra forma, se recorta al centro.</p>
        <form className="ad-form" onSubmit={add}>
          <label>
            Anunciante
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Nombre de la marca" required />
          </label>
          <label>
            Enlace al pulsarlo
            <input value={link} onChange={(e) => setLink(e.target.value)} maxLength={400} placeholder="https://" inputMode="url" required />
          </label>
          <label>
            Días en pantalla
            <input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="0 = sin fecha de fin" />
          </label>
          <label className="button quiet upload">
            {file ? file.name : "Elegir imagen"}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? "Subiendo…" : "Publicar banner"}
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {ads && ads.length === 0 && <p className="muted">Todavía no hay ningún banner. Mientras tanto, en ese hueco se invita a anunciarse.</p>}
        <ul className="ad-list">
          {(ads ?? []).map((ad) => (
            <li key={ad.id}>
              <img src={`/api/ads/${ad.id}/image`} alt="" loading="lazy" />
              <div>
                <strong>{ad.name}</strong>
                <a href={ad.link} target="_blank" rel="noreferrer">
                  {ad.link}
                </a>
                <span className="muted">
                  {stateOf(ad)}
                  {ad.endsAt !== null && ad.endsAt * 1000 >= Date.now() && ` · hasta el ${day(ad.endsAt)}`}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Vistas</dt>
                  <dd className="num">{ad.views.toLocaleString("es")}</dd>
                </div>
                <div>
                  <dt>Clics</dt>
                  <dd className="num">{ad.clicks.toLocaleString("es")}</dd>
                </div>
                <div>
                  <dt>De cada 100</dt>
                  <dd className="num">{ad.views > 0 ? ((ad.clicks / ad.views) * 100).toLocaleString("es", { maximumFractionDigits: 1 }) : "0"}</dd>
                </div>
              </dl>
              <span className="ad-actions">
                <button
                  className="button quiet"
                  onClick={() =>
                    api
                      .adminUpdateAd(ad.id, { active: !ad.active })
                      .then(load)
                      .catch(() => {})
                  }
                >
                  {ad.active ? "Pausar" : "Reanudar"}
                </button>
                <button
                  className="button quiet"
                  onClick={() =>
                    api
                      .adminDeleteAd(ad.id)
                      .then(load)
                      .catch(() => {})
                  }
                >
                  Borrar
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
