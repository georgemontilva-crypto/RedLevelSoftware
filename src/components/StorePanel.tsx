import { useEffect, useState } from "react";
import { Check, Gem, Shapes, Sparkles } from "lucide-react";
import type { Settings } from "../lib/api";
import { applyTheme, themes, type Theme } from "../lib/themes";
import { Drawer } from "./Drawer";

interface Props {
  settings: Settings;
  onSettings: (settings: Settings) => void;
  onClose: () => void;
}

const coming = [
  { icon: Sparkles, name: "Motion Packs", about: "Fondos animados, transiciones y efectos." },
  { icon: Shapes, name: "Icon Packs", about: "Colecciones de iconos para tus apps y juegos." },
  { icon: Gem, name: "Exclusive Editions", about: "Interfaces completas de edición especial." },
];

function Card({ theme, current, trying, onUse, onTry }: { theme: Theme; current: boolean; trying: boolean; onUse: () => void; onTry: () => void }) {
  const [bg, accent, bright] = theme.swatch;
  return (
    <li className={`theme-card ${current ? "is-current" : ""} ${trying ? "is-trying" : ""}`}>
      <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${accent}, ${bg} 62%)` }} aria-hidden="true">
        <i style={{ background: bright }} />
      </span>
      <span className="theme-text">
        <strong>{theme.name}</strong>
        <small>{theme.about}</small>
      </span>
      {theme.kind === "incluido" ? (
        <button className="btn btn-ghost btn-small" onClick={onUse} disabled={current}>
          {current ? (
            <>
              <Check size={15} aria-hidden="true" /> En uso
            </>
          ) : (
            "Usar"
          )}
        </button>
      ) : (
        <span className="theme-buy">
          <b>{theme.price}</b>
          <button className="btn btn-ghost btn-small" onClick={onTry} aria-pressed={trying}>
            {trying ? "Dejar de probar" : "Probar"}
          </button>
        </span>
      )}
    </li>
  );
}

/// Red Level Store dentro del programa: temas incluidos, temas de tienda para probar y lo que viene.
export function StorePanel({ settings, onSettings, onClose }: Props) {
  const [trying, setTrying] = useState<string | null>(null);

  // Probar un tema lo pinta solo mientras la tienda está abierta; al cerrarla vuelve el tuyo.
  useEffect(() => {
    applyTheme(trying ?? settings.theme);
    return () => applyTheme(settings.theme);
  }, [trying, settings.theme]);

  const included = themes.filter((t) => t.kind === "incluido");
  const store = themes.filter((t) => t.kind === "tienda");

  return (
    <Drawer title="Red Level Store" wide onClose={onClose}>
      <p className="muted small">Cambia el aspecto de tu Red Level. Es opcional: el programa se disfruta completo sin comprar nada.</p>

      <h4 className="store-title">Tus temas</h4>
      <ul className="theme-list">
        {included.map((theme) => (
          <Card
            key={theme.id}
            theme={theme}
            current={settings.theme === theme.id && trying === null}
            trying={false}
            onUse={() => {
              setTrying(null);
              onSettings({ ...settings, theme: theme.id });
            }}
            onTry={() => {}}
          />
        ))}
      </ul>

      <h4 className="store-title">Themes de la tienda</h4>
      <ul className="theme-list">
        {store.map((theme) => (
          <Card key={theme.id} theme={theme} current={false} trying={trying === theme.id} onUse={() => {}} onTry={() => setTrying(trying === theme.id ? null : theme.id)} />
        ))}
      </ul>
      <p className="note">La compra todavía no está abierta. Puedes probar estos temas mientras tengas la tienda abierta; al cerrarla vuelve el tuyo.</p>

      <h4 className="store-title">Próximamente</h4>
      <ul className="store-coming">
        {coming.map(({ icon: Icon, name, about }) => (
          <li key={name}>
            <Icon size={22} aria-hidden="true" />
            <span>
              <strong>{name}</strong>
              <small>{about}</small>
            </span>
          </li>
        ))}
      </ul>

      <div className="store-pro">
        <span>
          <strong>Red Level PRO</strong>
          <small>Personalización avanzada, perfiles adicionales y más opciones visuales.</small>
        </span>
        <b>US$4.99</b>
        <small>Pago único. Próximamente.</small>
      </div>
    </Drawer>
  );
}
