import { useEffect, useState } from "react";
import { Check, Coins, Crown, Gem, LayoutTemplate, Palette, Shapes, Sparkles, Upload, UserRound } from "lucide-react";
import type { Social, WalletState } from "../lib/online";
import { api, type Profile } from "../lib/api";
import type { Settings } from "../lib/api";
import { applyTheme, DEFAULT_VARS, looks, themes, type Look, type Theme } from "../lib/themes";
import { Screen, type ScreenTab } from "./Screen";
import { AdRail } from "./AdRail";

interface Props {
  settings: Settings;
  onSettings: (settings: Settings) => void;
  /// Wallet de la cuenta: saldo en RLC, lo comprado y el catálogo con precios.
  wallet: WalletState;
  signedIn: boolean;
  social: Social;
  onProfile: (profile: Profile) => void;
  onClose: () => void;
}

/// Recorta la imagen a un cuadrado de 256 px y la devuelve lista para subir.
function squared(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.width, image.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      canvas.getContext("2d")?.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);
      URL.revokeObjectURL(image.src);
      resolve(canvas.toDataURL("image/webp", 0.86));
    };
    image.onerror = () => reject(new Error("Esa imagen no se pudo leer."));
    image.src = URL.createObjectURL(file);
  });
}

const rlc = (amount: number) => `${amount.toLocaleString("es")} RLC`;

const tabs: ScreenTab[] = [
  { id: "themes", label: "Themes", icon: Palette },
  { id: "looks", label: "Interfaces", icon: LayoutTemplate },
  { id: "avatars", label: "Avatares", icon: UserRound },
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
export function StoreScreen({ settings, onSettings, wallet, signedIn, social, onProfile, onClose }: Props) {
  const [avatarBusy, setAvatarBusy] = useState<number | "subiendo" | null>(null);
  const [avatarNote, setAvatarNote] = useState<{ text: string; error?: boolean } | null>(null);
  const chooseAvatar = async (id: number) => {
    setAvatarBusy(id);
    setAvatarNote(null);
    try {
      const { image, extension } = await social.chooseAvatar(id);
      onProfile(await api.setGalleryAvatar(image, extension));
      setAvatarNote({ text: "Avatar puesto en tu perfil." });
    } catch (e) {
      setAvatarNote({ text: e instanceof Error ? e.message : "No se pudo poner ese avatar.", error: true });
    }
    setAvatarBusy(null);
  };
  const uploadAvatars = async (files: FileList | null) => {
    if (!files?.length) return;
    setAvatarBusy("subiendo");
    setAvatarNote(null);
    try {
      for (const file of Array.from(files)) await social.uploadAvatar(file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Avatar", await squared(file));
      setAvatarNote({ text: files.length === 1 ? "Avatar subido. Ya está disponible para todos." : `${files.length} avatares subidos. Ya están disponibles para todos.` });
    } catch (e) {
      setAvatarNote({ text: e instanceof Error ? e.message : "No se pudo subir.", error: true });
    }
    setAvatarBusy(null);
  };
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
      rail={<AdRail />}
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

      {tab === "avatars" && (
        <>
          <h3 className="screen-title">Avatares</h3>
          <p className="muted">Gratis para todos. Toca uno para ponerlo en tu perfil.</p>
          {social.me?.admin && (
            <label className="btn btn-ghost btn-small avatar-upload">
              <Upload size={16} aria-hidden="true" /> {avatarBusy === "subiendo" ? "Subiendo…" : "Subir avatares"}
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={avatarBusy !== null} onChange={(e) => void uploadAvatars(e.target.files).then(() => (e.target.value = ""))} />
            </label>
          )}
          {avatarNote && <p className={avatarNote.error ? "note note-error" : "note"}>{avatarNote.text}</p>}
          {social.avatars.length === 0 ? (
            <p className="muted">{social.status === "none" ? "La galería aparece cuando Red Level tiene su web conectada." : "Todavía no hay avatares en la galería."}</p>
          ) : (
            <ul className="avatar-pick avatar-shop">
              {social.avatars.map((avatar) => (
                <li key={avatar.id}>
                  <button className={avatarBusy === avatar.id ? "is-busy" : ""} disabled={avatarBusy !== null} onClick={() => void chooseAvatar(avatar.id)} aria-label={`Usar el avatar ${avatar.name}`} title={avatar.name}>
                    <img src={social.avatarUrl(avatar.id)} alt="" loading="lazy" />
                  </button>
                </li>
              ))}
            </ul>
          )}
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
