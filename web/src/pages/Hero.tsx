import { useEffect, useState } from "react";
import { Newspaper } from "lucide-react";
import { type Feed } from "../api";

const open = (url: string) => window.open(url, "_blank", "noopener");

function ago(seconds: number): string {
  if (!seconds) return "";
  const minutes = Math.max(1, Math.floor((Date.now() / 1000 - seconds) / 60));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

/// El "héroe" de arriba del inicio, como en el software: las últimas noticias, una a una, pasando solas.
export function PhoneHero({ feed }: { feed: Feed | null }) {
  const news = feed?.news?.slice(0, 6) ?? [];
  const [i, setI] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const count = news.length;

  useEffect(() => {
    if (count < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % count), 7000);
    return () => clearInterval(t);
  }, [count]);

  if (count === 0) return null;
  const item = news[i % count];
  const img = item.image && !broken[item.url];

  return (
    <section className="phero" aria-label="Noticias">
      <div className="phero-card phero-news">
        {img ? (
          <img className="phero-img is-on" src={item.image!} alt="" onError={() => setBroken((b) => ({ ...b, [item.url]: true }))} />
        ) : (
          <span className="phero-img is-on phero-empty">
            <Newspaper size={56} strokeWidth={1} aria-hidden="true" />
          </span>
        )}
        <div className="phero-text">
          <p className="phero-badge">
            <b>{item.source}</b>
            {ago(item.at) && <span>{ago(item.at)}</span>}
          </p>
          <h2>{item.title}</h2>
          <button className="button primary phero-btn" onClick={() => open(item.url)}>
            Leer la noticia
          </button>
        </div>
      </div>
      {count > 1 && (
        <div className="phero-dots" aria-hidden="true">
          {news.map((n) => (
            <i key={n.url} className={news[i % count].url === n.url ? "is-on" : ""} />
          ))}
        </div>
      )}
    </section>
  );
}
