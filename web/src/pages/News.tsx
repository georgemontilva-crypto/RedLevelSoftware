import { useEffect, useState } from "react";
import { api, type Feed } from "../api";

function ago(seconds: number): string {
  if (!seconds) return "";
  const minutes = Math.max(1, Math.floor((Date.now() / 1000 - seconds) / 60));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

/// Noticias de videojuegos y próximos lanzamientos, en su propia sección de la app.
export function News() {
  const [feed, setFeed] = useState<Feed | null | undefined>(undefined);
  const [view, setView] = useState<"news" | "upcoming">("news");
  useEffect(() => {
    api
      .feed()
      .then(setFeed)
      .catch(() => setFeed(null));
  }, []);

  return (
    <div className="appx-page nw">
      <div className="nw-switch" role="tablist">
        <button role="tab" aria-selected={view === "news"} className={view === "news" ? "is-on" : ""} onClick={() => setView("news")}>
          Noticias
        </button>
        <button role="tab" aria-selected={view === "upcoming"} className={view === "upcoming" ? "is-on" : ""} onClick={() => setView("upcoming")}>
          Lanzamientos
        </button>
      </div>

      {feed === undefined && <p className="fine">Buscando lo último…</p>}
      {feed === null && <p className="error">No se pudieron cargar las novedades. Inténtalo en un momento.</p>}

      {feed && view === "news" && (
        <>
          {feed.news.length === 0 && <p className="fine">Ahora mismo no hay noticias que mostrar.</p>}
          <ul className="nw-list">
            {feed.news.slice(0, 20).map((item, index) => (
              <li key={item.url} className={index === 0 ? "is-big" : ""}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.image && <img src={item.image} alt="" loading="lazy" />}
                  <span>
                    <small>
                      <b>{item.source}</b>
                      {ago(item.at) && <> · {ago(item.at)}</>}
                    </small>
                    <strong>{item.title}</strong>
                    {index === 0 && item.summary && <em>{item.summary}</em>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {feed.news.length > 0 && <p className="fine">Cada noticia se abre en la web de su medio.</p>}
        </>
      )}

      {feed && view === "upcoming" && (
        <>
          {feed.upcoming.length === 0 && <p className="fine">Ahora mismo no hay lanzamientos que mostrar.</p>}
          <ul className="nw-releases">
            {feed.upcoming.map((item) => (
              <li key={item.id}>
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  <span className="appx-release-art">
                    {item.image && <img src={item.image} alt="" loading="lazy" />}
                    <b>{item.date}</b>
                  </span>
                  <strong>{item.name}</strong>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
