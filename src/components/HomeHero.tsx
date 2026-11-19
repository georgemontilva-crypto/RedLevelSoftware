import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Newspaper } from "lucide-react";
import { api } from "../lib/api";
import type { FeedNews } from "../lib/online";

function ago(seconds: number): string {
  if (!seconds) return "";
  const minutes = Math.max(1, Math.floor((Date.now() / 1000 - seconds) / 60));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

/// Las noticias, arriba del todo: una a una, en grande, pasando solas.
export function HomeHero({ news, onAll }: { news: FeedNews[]; onAll: () => void }) {
  const items = news.slice(0, 6);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [waits, setWaits] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const current = items[index % items.length];

  useEffect(() => {
    if (paused || items.length < 2) return;
    // Con un juego abierto (Red Level queda detrás) no se pasa de noticia: nada se mueve si nadie mira.
    const timer = setTimeout(() => {
      if (document.documentElement.hasAttribute("data-idle")) setWaits((n) => n + 1);
      else setIndex((i) => (i + 1) % items.length);
    }, 9000);
    return () => clearTimeout(timer);
  }, [index, paused, items.length, waits]);

  if (!current) return null;
  const step = (by: number) => setIndex((i) => (i + by + items.length) % items.length);
  return (
    <section className="newshero" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-label="Noticias">
      <div className="newshero-card" key={current.url}>
        {current.image && !broken[current.url] ? (
          <img className="newshero-art" src={current.image} alt="" onError={() => setBroken((all) => ({ ...all, [current.url]: true }))} />
        ) : (
          <span className="newshero-art is-empty" aria-hidden="true">
            <Newspaper size={90} strokeWidth={1} />
          </span>
        )}
        <div className="newshero-text">
          <p className="newshero-badge">
            <b>{current.source}</b>
            {ago(current.at) && <span>{ago(current.at)}</span>}
          </p>
          <h2>{current.title}</h2>
          {current.summary && <p className="newshero-summary">{current.summary}</p>}
          <div className="row">
            <button className="btn btn-play btn-small" onClick={() => void api.openUrl(current.url).catch(() => {})}>
              Leer la noticia
            </button>
            <button className="btn btn-ghost btn-small" onClick={onAll}>
              Todas las novedades
            </button>
          </div>
        </div>
      </div>
      {items.length > 1 && (
        <>
          <button className="newshero-arrow is-prev" onClick={() => step(-1)} aria-label="Noticia anterior">
            <ChevronLeft size={22} />
          </button>
          <button className="newshero-arrow is-next" onClick={() => step(1)} aria-label="Noticia siguiente">
            <ChevronRight size={22} />
          </button>
          <div className="newshero-dots" aria-hidden="true">
            {items.map((item, i) => (
              <i key={item.url} className={i === index % items.length ? "is-on" : ""} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
