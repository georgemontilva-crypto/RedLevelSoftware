import { useEffect, useState } from "react";
import { CalendarClock, ExternalLink, Newspaper } from "lucide-react";
import { api } from "../lib/api";
import { loadFeed, type FeedNews, type FeedUpcoming } from "../lib/online";
import { AdRail, NewsAd } from "./AdRail";
import { Screen, type ScreenTab } from "./Screen";

const tabs: ScreenTab[] = [
  { id: "news", label: "Noticias", icon: Newspaper },
  { id: "upcoming", label: "Lanzamientos", icon: CalendarClock },
];

function ago(seconds: number): string {
  if (!seconds) return "";
  const minutes = Math.max(1, Math.floor((Date.now() / 1000 - seconds) / 60));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

const open = (url: string) => void api.openUrl(url).catch(() => {});

function Story({ item, big }: { item: FeedNews; big?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <li className={big ? "story is-big" : "story"}>
      <button onClick={() => open(item.url)} aria-label={`${item.title}. Abrir en ${item.source}`}>
        <span className="story-art">{item.image && !broken ? <img src={item.image} alt="" loading="lazy" onError={() => setBroken(true)} /> : <Newspaper size={34} aria-hidden="true" />}</span>
        <span className="story-text">
          <small>
            <b>{item.source}</b>
            {ago(item.at) && <> · {ago(item.at)}</>}
          </small>
          <strong>{item.title}</strong>
          {item.summary && <span>{item.summary}</span>}
        </span>
      </button>
    </li>
  );
}

function Release({ item }: { item: FeedUpcoming }) {
  const [broken, setBroken] = useState(false);
  return (
    <li className="release">
      <button onClick={() => open(item.url)} aria-label={`${item.name}, ${item.date}. Abrir su ficha`}>
        <span className="release-art">
          {item.image && !broken ? <img src={item.image} alt="" loading="lazy" onError={() => setBroken(true)} /> : <CalendarClock size={30} aria-hidden="true" />}
          <b>{item.date}</b>
        </span>
        <strong>{item.name}</strong>
      </button>
    </li>
  );
}

/// Novedades a pantalla completa: las últimas noticias y lo próximo que sale, con su fecha.
export function NewsScreen({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState("news");
  const [feed, setFeed] = useState<{ news: FeedNews[]; upcoming: FeedUpcoming[] } | null | undefined>(undefined);
  useEffect(() => {
    loadFeed().then(setFeed);
  }, []);

  return (
    <Screen
      title="Novedades"
      tabs={tabs}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
      rail={<AdRail />}
      aside={
        <p className="screen-aside">
          <ExternalLink size={14} aria-hidden="true" /> Cada noticia se abre en la web de su medio
        </p>
      }
    >
      {feed === undefined && <p className="muted">Buscando lo último…</p>}
      {feed === null && <p className="note">Las novedades llegan por la web de Red Level, y ahora mismo no se puede conectar con ella.</p>}

      {feed && tab === "news" && (
        <>
          <NewsAd />
          <h3 className="screen-title">Últimas noticias</h3>
          {feed.news.length === 0 ? (
            <p className="muted">Ahora mismo no hay noticias que mostrar. Vuelve en un rato.</p>
          ) : (
            <ul className="stories">
              {feed.news.slice(0, 19).map((item, index) => (
                <Story key={item.url} item={item} big={index === 0} />
              ))}
            </ul>
          )}
        </>
      )}

      {feed && tab === "upcoming" && (
        <>
          <h3 className="screen-title">Próximos lanzamientos</h3>
          <p className="muted">Lo que está a punto de salir en PC, con la fecha que anuncia su tienda.</p>
          {feed.upcoming.length === 0 ? (
            <p className="muted">Ahora mismo no hay lanzamientos que mostrar.</p>
          ) : (
            <ul className="releases">
              {feed.upcoming.map((item) => (
                <Release key={item.id} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </Screen>
  );
}
