import { useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { api } from "../lib/api";
import { countAds, loadAds, type Ad } from "../lib/online";

const open = (url: string) => void api.openUrl(url).catch(() => {});

/// Lógica común de una zona de anuncios: carga los banners de esa zona, los pasa solos uno a uno, cuenta las
/// vistas y los clics, y se detiene cuando hay un juego abierto (Red Level queda detrás y nadie los ve).
export function useAdZone(zone: string) {
  const [loaded, setLoaded] = useState<{ ads: Ad[]; server: string | null } | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [waits, setWaits] = useState(0);
  const counted = useRef(new Set<number>());

  useEffect(() => {
    loadAds().then((r) => setLoaded({ ads: r.ads.filter((ad) => ad.zone === zone), server: r.server }));
  }, [zone]);

  const ads = loaded?.ads ?? [];
  const current = ads.length > 0 ? ads[index % ads.length] : null;

  // Cada banner cuenta como visto una vez por cada vez que llega a enseñarse.
  useEffect(() => {
    if (!current || !loaded || counted.current.has(current.id)) return;
    counted.current.add(current.id);
    countAds(loaded.server, "seen", [current.id]);
  }, [current, loaded]);

  useEffect(() => {
    if (paused || ads.length < 2) return;
    const timer = setTimeout(() => {
      if (document.documentElement.hasAttribute("data-idle")) setWaits((n) => n + 1);
      else setIndex((i) => (i + 1) % ads.length);
    }, 7000);
    return () => clearTimeout(timer);
  }, [index, paused, ads.length, waits]);

  const click = () => {
    if (!current || !loaded) return;
    countAds(loaded.server, "click", [current.id]);
    open(current.link);
  };

  return { loaded, ads, current, index, setIndex, setPaused, click };
}

/// Puntitos para saltar entre banners de una zona.
function Dots({ ads, current, onPick }: { ads: Ad[]; current: Ad; onPick: (i: number) => void }) {
  if (ads.length < 2) return null;
  return (
    <div className="adrail-dots">
      {ads.map((ad, i) => (
        <button key={ad.id} className={ad.id === current.id ? "is-on" : ""} onClick={() => onPick(i)} aria-label={`Ver el anuncio de ${ad.name}`} aria-pressed={ad.id === current.id} />
      ))}
    </div>
  );
}

/// Publicidad vertical: la columna fija a la derecha (en el inicio, en Novedades y en la tienda). Los banners
/// pasan solos, uno a la vez. Sin banners contratados, invita a anunciarse.
export function AdRail() {
  const { loaded, ads, current, setIndex, setPaused, click } = useAdZone("rail");

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
      <button className="adrail-card" onClick={click} aria-label={`Anuncio de ${current.name}. Abrir su web`}>
        {ads.map((ad) => (
          <img key={ad.id} className={ad.id === current.id ? "is-on" : ""} src={ad.image} alt="" />
        ))}
      </button>
      <Dots ads={ads} current={current} onPick={setIndex} />
    </aside>
  );
}

/// Publicidad ancha dentro de Novedades: un cuadro apaisado, solo imagen, que pasa solo si hay varios.
/// Sin banners en esta zona, no sale nada (el sitio lo ocupa el contenido).
export function NewsAd() {
  const { ads, current, setIndex, setPaused, click } = useAdZone("novedades");
  if (!current) return null;
  return (
    <section className="newsad" aria-label="Publicidad" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <small className="adrail-tag">Publicidad</small>
      <button className="newsad-card" onClick={click} aria-label={`Anuncio de ${current.name}. Abrir su web`}>
        {ads.map((ad) => (
          <img key={ad.id} className={ad.id === current.id ? "is-on" : ""} src={ad.image} alt="" />
        ))}
      </button>
      <Dots ads={ads} current={current} onPick={setIndex} />
    </section>
  );
}
