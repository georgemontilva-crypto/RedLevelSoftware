import { useEffect, useRef, useState } from "react";
import { CalendarClock, ExternalLink, Megaphone, Newspaper } from "lucide-react";
import { api } from "../lib/api";
import { countAds, loadAds, loadFeed, type Ad, type FeedNews, type FeedUpcoming } from "../lib/online";
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

/// Publicidad: una columna fija a la derecha de las noticias, con los banners pasando solos, uno a la vez.
/// Se queda en su sitio mientras se recorren las noticias. Sin banners contratados, invita a anunciarse.
function AdRail() {
  const [loaded, setLoaded] = useState<{ ads: Ad[]; server: string | null } | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [waits, setWaits] = useState(0);
  const counted = useRef(new Set<number>());
  useEffect(() => {
    loadAds().then(setLoaded);
  }, []);
  const ads = loaded?.ads ?? [];
  const current = ads.length > 0 ? ads[index % ads.length] : null;

  // Cada banner cuenta como visto una vez por cada vez que se abre Novedades y llega a enseñarse.
  useEffect(() => {
    if (!current || !loaded || counted.current.has(current.id)) return;
    counted.current.add(current.id);
    countAds(loaded.server, "seen", [current.id]);
  }, [current, loaded]);

  useEffect(() => {
    if (paused || ads.length < 2) return;
    const timer = setTimeout(() => {
      // Con un juego abierto y Red Level detrás, nadie los ve: no se pasan ni se cuentan.
      if (document.documentElement.hasAttribute("data-idle")) setWaits((n) => n + 1);
      else setIndex((i) => (i + 1) % ads.length);
    }, 7000);
    return () => clearTimeout(timer);
  }, [index, paused, ads.length, waits]);

  if (!loaded) return <aside className="adrail" aria-hidden="true" />;
  if (!current) {
    return (
      <aside className="adrail" aria-label="Publicidad">
        <small className="adrail-tag">Publicidad</small>
        <div className="adrail-card is-empty">
          <Megaphone size={40} strokeWidth={1.4} aria-hidden="true" />
          <strong>Tu marca aquí</strong>
          <span>Este espacio lo ven los jugadores de Red Level cada vez que abren Novedades.</span>
          {loaded.server && (
            <button className="btn btn-ghost btn-small" onClick={() => open(`${loaded.server}/soporte`)}>
              Quiero anunciarme
            </button>
          )}
        </div>
      </aside>
    );
  }
  return (
    <aside className="adrail" aria-label="Publicidad" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <small className="adrail-tag">Publicidad</small>
      <button
        className="adrail-card"
        onClick={() => {
          countAds(loaded.server, "click", [current.id]);
          open(current.link);
        }}
        aria-label={`Anuncio de ${current.name}. Abrir su web`}
      >
        {ads.map((ad) => (
          <img key={ad.id} className={ad.id === current.id ? "is-on" : ""} src={ad.image} alt="" />
        ))}
      </button>
      {ads.length > 1 && (
        <div className="adrail-dots">
          {ads.map((ad, i) => (
            <button key={ad.id} className={ad.id === current.id ? "is-on" : ""} onClick={() => setIndex(i)} aria-label={`Ver el anuncio de ${ad.name}`} aria-pressed={ad.id === current.id} />
          ))}
        </div>
      )}
    </aside>
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
      aside={
        <p className="screen-aside">
          <ExternalLink size={14} aria-hidden="true" /> Cada noticia se abre en la web de su medio
        </p>
      }
    >
      <div className="news-layout">
        <div className="news-main">
          {feed === undefined && <p className="muted">Buscando lo último…</p>}
          {feed === null && <p className="note">Las novedades llegan por la web de Red Level, y ahora mismo no se puede conectar con ella.</p>}

          {feed && tab === "news" && (
            <>
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
        </div>
        <AdRail />
      </div>
    </Screen>
  );
}
