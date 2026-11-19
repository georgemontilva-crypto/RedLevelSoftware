import { useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { api } from "../lib/api";
import { countAds, loadAds, type Ad } from "../lib/online";

const open = (url: string) => void api.openUrl(url).catch(() => {});

/// Publicidad: una columna fija a la derecha (en Novedades y en la tienda), con los banners pasando solos, uno a la vez.
/// Se queda en su sitio mientras se recorre lo demás. Sin banners contratados, invita a anunciarse.
export function AdRail() {
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
