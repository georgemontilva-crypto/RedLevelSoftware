import { useEffect, useState } from "react";
import { Check, Coins, Crown, Gem, LayoutTemplate, Palette, Shapes, Sparkles } from "lucide-react";
import type { WalletState } from "../lib/online";
import type { Settings } from "../lib/api";
import { applyTheme, DEFAULT_VARS, looks, themes, type Look, type Theme } from "../lib/themes";
import { Screen, type ScreenTab } from "./Screen";

interface Props {
  settings: Settings;
  onSettings: (settings: Settings) => void;
  /// Wallet de la cuenta: saldo en RLC, lo comprado y el catálogo con precios.
  wallet: WalletState;
  signedIn: boolean;
  onClose: () => void;
}

const rlc = (amount: number) => `${amount.toLocaleString("es")} RLC`;

const tabs: ScreenTab[] = [
  { id: "themes", label: "Themes", icon: Palette },
  { id: "looks", label: "Interfaces", icon: LayoutTemplate },
  { id: "motion", label: "Motion Packs", icon: Sparkles },
  { id: "icons", label: "Icon Packs", icon: Shapes },
  { id: "editions", label: "Exclusive Editions", icon: Gem },
  { id: "pro", label: "Red Level PRO", icon: Crown },
  { id: "wallet", label: "Wallet", icon: Coins },
];

const coming: Record<string, { icon: typeof Gem; title: string; about: string; price: string; items: string[] }> = {
  motion: { icon: Sparkles, title: "Motion Packs", about: "Movimiento para tu interfaz.", price: "desde US$2.99", items: ["Fondos animados", "Transiciones entre juegos", "Efectos de apertura"] },
  icons: { icon: Shapes, title: "Icon Packs", about: "Otro aire para tus apps y tus juegos.", price: "desde US$0.99", items: ["Iconos minimalistas", "Iconos futuristas", "Colecciones de color"] },
  editions: { icon: Gem, title: "Exclusive Editions", about: "Interfaces completas de edición especial.", price: "desde US$7.99", items: ["Interfaces temáticas completas", "Colecciones de temporada", "Diseños de creadores invitados"] },
};

/// Una miniatura de Red Level pintada con los colores del tema: se ve cómo queda antes de usarlo.
function Preview({ theme, look }: { theme?: Theme; look?: string }) {
  return (
    <span className="theme-preview" data-look={look} style={{ ...DEFAULT_VARS, ...theme?.vars } as React.CSSProperties} aria-hidden="true">
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
export function StoreScreen({ settings, onSettings, wallet, signedIn, onClose }: Props) {
  const [tab, setTab] = useState("themes");
  const [trying, setTrying] = useState<string | null>(null);
  const [tryingLook, setTryingLook] = useState<string | null>(null);

  // Probar un tema o una interfaz los pinta solo mientras la tienda está abierta; al salir vuelven los tuyos.
  useEffect(() => {
    applyTheme(trying ?? settings.theme, tryingLook ?? settings.look);
    return () => applyTheme(settings.theme, settings.look);
  }, [trying, tryingLook, settings.theme, settings.look]);

  // Al abrir la tienda se lee el saldo: puede haber cambiado desde la web.
  const refresh = wallet.refresh;
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const [asking, setAsking] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /// Pie de la tarjeta de un artículo: usar lo que es tuyo; probar y comprar lo que no.
  const foot = (item: string, kind: "incluido" | "tienda", current: boolean, isTrying: boolean, use: () => void, tryIt: () => void, label: string) => {
    const mine = kind === "incluido" || wallet.owned.includes(item);
    if (mine) {
      return (
        <div className="product-foot">
          <b>{kind === "incluido" ? label : "Comprado"}</b>
          <button className={current ? "btn btn-ghost btn-small" : "btn btn-play btn-small"} disabled={current} onClick={use}>
            {current ? (
              <>
                <Check size={15} aria-hidden="true" /> En uso
              </>
            ) : (
              "Usar"
            )}
          </button>
        </div>
      );
    }
    const price = wallet.items.find((i) => i.id === item)?.price;
    const missing = price === undefined ? 0 : price - wallet.balance;
    return (
      <div className="product-foot">
        <b>{price === undefined ? "Próximamente" : rlc(price)}</b>
        <span className="product-actions">
          {asking === item ? (
            <>
              <button
                className="btn btn-play btn-small"
                disabled={buying}
                onClick={async () => {
                  setBuying(true);
                  setError(null);
                  try {
                    await wallet.buy(item);
                    use();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  }
                  setBuying(false);
                  setAsking(null);
                }}
              >
                {buying ? "Comprando…" : `Pagar ${rlc(price ?? 0)}`}
              </button>
              <button className="btn btn-ghost btn-small" disabled={buying} onClick={() => setAsking(null)}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost btn-small" onClick={tryIt} aria-pressed={isTrying}>
                {isTrying ? "Dejar de probar" : "Probar"}
              </button>
              {signedIn && price !== undefined && missing <= 0 && (
                <button className="btn btn-play btn-small" onClick={() => (setError(null), setAsking(item))}>
                  Comprar
                </button>
              )}
            </>
          )}
        </span>
        {signedIn && price !== undefined && missing > 0 && asking !== item && <small className="product-missing">Te faltan {rlc(missing)}</small>}
      </div>
    );
  };

  const tryingTheme = themes.find((t) => t.id === trying);
  const tryingLookItem = looks.find((l) => l.id === tryingLook);
  const shownTheme = themes.find((t) => t.id === (trying ?? settings.theme));
  const lookCard = (look: Look) => {
    const current = settings.look === look.id && tryingLook === null;
    return (
      <li key={look.id} className={`product ${current ? "is-current" : ""} ${tryingLook === look.id ? "is-trying" : ""}`}>
        <Preview theme={shownTheme} look={look.id} />
        <div className="product-text">
          <strong>{look.name}</strong>
          <small>{look.about}</small>
          <ul className="product-traits">
            {look.traits.map((trait) => (
              <li key={trait}>{trait}</li>
            ))}
          </ul>
        </div>
        {foot(
          `look:${look.id}`,
          look.kind,
          current,
          tryingLook === look.id,
          () => {
            setTryingLook(null);
            onSettings({ ...settings, look: look.id });
          },
          () => setTryingLook(tryingLook === look.id ? null : look.id),
          "Incluida",
        )}
      </li>
    );
  };
  const card = (theme: Theme) => {
    const current = settings.theme === theme.id && trying === null;
    return (
      <li key={theme.id} className={`product ${current ? "is-current" : ""} ${trying === theme.id ? "is-trying" : ""}`}>
        <Preview theme={theme} />
        <div className="product-text">
          <strong>{theme.name}</strong>
          <small>{theme.about}</small>
        </div>
        {foot(
          `theme:${theme.id}`,
          theme.kind,
          current,
          trying === theme.id,
          () => {
            setTrying(null);
            onSettings({ ...settings, theme: theme.id });
          },
          () => setTrying(trying === theme.id ? null : theme.id),
          "Incluido",
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
        <>
          {(tryingTheme || tryingLookItem) && (
            <p className="screen-aside">
              Estás probando <b>{[tryingTheme?.name, tryingLookItem?.name].filter(Boolean).join(" + ")}</b>. Al salir de la tienda vuelve lo tuyo.
            </p>
          )}
          {signedIn && (
            <button className="wallet-chip" onClick={() => setTab("wallet")} aria-label={`Tu wallet: ${rlc(wallet.balance)}`}>
              <Coins size={17} aria-hidden="true" /> {rlc(wallet.balance)}
            </button>
          )}
        </>
      }
    >
      {tab === "themes" && (
        <>
          <h3 className="screen-title">Tus temas</h3>
          <p className="muted">Vienen con Red Level. Elige el que quieras.</p>
          <ul className="products">{themes.filter((t) => t.kind === "incluido").map(card)}</ul>
          <h3 className="screen-title">Themes de la tienda</h3>
          <p className="muted">Se compran con RLC y quedan en tu cuenta. Puedes probarlos antes mientras estás en la tienda.</p>
          {error && <p className="note note-error">{error}</p>}
          <ul className="products">{themes.filter((t) => t.kind === "tienda").map(card)}</ul>
        </>
      )}

      {tab === "looks" && (
        <>
          <h3 className="screen-title">Interfaces</h3>
          <p className="muted">Cambian las formas y los efectos de todo Red Level. Se combinan con el tema de color que tengas puesto.</p>
          {error && <p className="note note-error">{error}</p>}
          <ul className="products">{looks.map(lookCard)}</ul>
        </>
      )}

      {tab === "wallet" && (
        <>
          <h3 className="screen-title">Tu wallet</h3>
          {signedIn ? (
            <>
              <div className="setting-group wallet-card">
                <span className="muted">Saldo</span>
                <strong className="wallet-balance">{rlc(wallet.balance)}</strong>
                <p className="muted small">RLC es la moneda de Red Level. Tu wallet es el mismo aquí y en la web. La recarga con dinero abre próximamente.</p>
              </div>
              <h3 className="screen-title">Movimientos</h3>
              {wallet.moves.length === 0 ? (
                <p className="muted">Todavía no hay movimientos.</p>
              ) : (
                <ul className="wallet-moves">
                  {wallet.moves.map((move, index) => (
                    <li key={index}>
                      <span>{new Date(move.at * 1000).toLocaleDateString("es", { day: "numeric", month: "short" })}</span>
                      <span>{move.note}</span>
                      <b className={move.amount > 0 ? "is-plus" : ""}>
                        {move.amount > 0 ? "+" : "−"}
                        {rlc(Math.abs(move.amount))}
                      </b>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="muted">Inicia sesión en Red Level para ver tu wallet.</p>
          )}
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
