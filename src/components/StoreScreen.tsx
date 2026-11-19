import { useEffect, useState } from "react";
import { Check, Crown, Gem, Palette, Shapes, Sparkles } from "lucide-react";
import type { Settings } from "../lib/api";
import { applyTheme, DEFAULT_VARS, themes, type Theme } from "../lib/themes";
import { Screen, type ScreenTab } from "./Screen";

interface Props {
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onClose: () => void;
}

const tabs: ScreenTab[] = [
  { id: "themes", label: "Themes", icon: Palette },
  { id: "motion", label: "Motion Packs", icon: Sparkles },
  { id: "icons", label: "Icon Packs", icon: Shapes },
  { id: "editions", label: "Exclusive Editions", icon: Gem },
  { id: "pro", label: "Red Level PRO", icon: Crown },
];

const coming: Record<string, { icon: typeof Gem; title: string; about: string; price: string; items: string[] }> = {
  motion: { icon: Sparkles, title: "Motion Packs", about: "Movimiento para tu interfaz.", price: "desde US$2.99", items: ["Fondos animados", "Transiciones entre juegos", "Efectos de apertura"] },
  icons: { icon: Shapes, title: "Icon Packs", about: "Otro aire para tus apps y tus juegos.", price: "desde US$0.99", items: ["Iconos minimalistas", "Iconos futuristas", "Colecciones de color"] },
  editions: { icon: Gem, title: "Exclusive Editions", about: "Interfaces completas de edición especial.", price: "desde US$7.99", items: ["Interfaces temáticas completas", "Colecciones de temporada", "Diseños de creadores invitados"] },
};

/// Una miniatura de Red Level pintada con los colores del tema: se ve cómo queda antes de usarlo.
function Preview({ theme }: { theme: Theme }) {
  return (
    <span className="theme-preview" style={{ ...DEFAULT_VARS, ...theme.vars } as React.CSSProperties} aria-hidden="true">
      <i className="tp-bar" />
      <i className="tp-title" />
      <i className="tp-line" />
      <i className="tp-play" />
      <span className="tp-shelf">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

/// Red Level Store a pantalla completa: categorías a la izquierda y los productos en grande.
export function StoreScreen({ settings, onSettings, onClose }: Props) {
  const [tab, setTab] = useState("themes");
  const [trying, setTrying] = useState<string | null>(null);

  // Probar un tema lo pinta solo mientras la tienda está abierta; al salir vuelve el tuyo.
  useEffect(() => {
    applyTheme(trying ?? settings.theme);
    return () => applyTheme(settings.theme);
  }, [trying, settings.theme]);

  const tryingTheme = themes.find((t) => t.id === trying);
  const card = (theme: Theme) => {
    const current = settings.theme === theme.id && trying === null;
    return (
      <li key={theme.id} className={`product ${current ? "is-current" : ""} ${trying === theme.id ? "is-trying" : ""}`}>
        <Preview theme={theme} />
        <div className="product-text">
          <strong>{theme.name}</strong>
          <small>{theme.about}</small>
        </div>
        {theme.kind === "incluido" ? (
          <div className="product-foot">
            <b>Incluido</b>
            <button
              className={current ? "btn btn-ghost btn-small" : "btn btn-play btn-small"}
              disabled={current}
              onClick={() => {
                setTrying(null);
                onSettings({ ...settings, theme: theme.id });
              }}
            >
              {current ? (
                <>
                  <Check size={15} aria-hidden="true" /> En uso
                </>
              ) : (
                "Usar"
              )}
            </button>
          </div>
        ) : (
          <div className="product-foot">
            <b>{theme.price}</b>
            <button className="btn btn-ghost btn-small" onClick={() => setTrying(trying === theme.id ? null : theme.id)} aria-pressed={trying === theme.id}>
              {trying === theme.id ? "Dejar de probar" : "Probar"}
            </button>
          </div>
        )}
      </li>
    );
  };

  const soon = coming[tab];
  return (
    <Screen
      title="Red Level Store"
      tabs={tabs}
      tab={tab}
      onTab={setTab}
      onClose={onClose}
      aside={
        tryingTheme && (
          <p className="screen-aside">
            Estás probando <b>{tryingTheme.name}</b>. Al salir de la tienda vuelve tu tema.
          </p>
        )
      }
    >
      {tab === "themes" && (
        <>
          <h3 className="screen-title">Tus temas</h3>
          <p className="muted">Vienen con Red Level. Elige el que quieras.</p>
          <ul className="products">{themes.filter((t) => t.kind === "incluido").map(card)}</ul>
          <h3 className="screen-title">Themes de la tienda</h3>
          <p className="muted">La compra todavía no está abierta. Puedes probarlos mientras estás en la tienda.</p>
          <ul className="products">{themes.filter((t) => t.kind === "tienda").map(card)}</ul>
        </>
      )}

      {soon && (
        <div className="soon-card">
          <soon.icon size={44} strokeWidth={1.4} aria-hidden="true" />
          <h3 className="screen-title">{soon.title}</h3>
          <p className="muted">{soon.about}</p>
          <ul>
            {soon.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="soon-price">
            <b>{soon.price}</b>
            <span>Próximamente</span>
          </p>
        </div>
      )}

      {tab === "pro" && (
        <div className="soon-card is-pro">
          <Crown size={44} strokeWidth={1.4} aria-hidden="true" />
          <h3 className="screen-title">Red Level PRO</h3>
          <p className="muted">Una mejora opcional, de pago único. Red Level sigue siendo gratis.</p>
          <ul>
            <li>Personalización avanzada de la interfaz</li>
            <li>Perfiles adicionales</li>
            <li>Más opciones visuales</li>
            <li>Más formas de organizar tu biblioteca</li>
          </ul>
          <p className="soon-price">
            <b>US$4.99</b>
            <span>Pago único. Próximamente</span>
          </p>
        </div>
      )}
    </Screen>
  );
}
