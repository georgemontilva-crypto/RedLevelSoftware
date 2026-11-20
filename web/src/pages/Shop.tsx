import { useEffect, useState } from "react";
import { Check, Coins, Download } from "lucide-react";
import { api, errorText, type StoreItem, type Wallet } from "../api";
import { Link, type Session } from "../App";
import { applyAppearance, type Appearance } from "../theme";

const DEFAULT_APPEARANCE: Appearance = { theme: "red-level", look: "clasico", motion: "quieto" };

const rlc = (amount: number) => `${amount.toLocaleString("es")} RLC`;
const moveDate = (seconds: number) => new Date(seconds * 1000).toLocaleDateString("es", { day: "numeric", month: "short" });

/// Colores de muestra de cada artículo, para que la tarjeta enseñe a qué se parece.
const swatches: Record<string, [string, string]> = {
  "theme:neon-violeta": ["#07030c", "#a855f7"],
  "theme:ambar": ["#0c0703", "#f59e0b"],
  "theme:hielo": ["#03090c", "#22d3ee"],
  "look:cristal": ["#1a1420", "#ffffff"],
};

/// Botón para instalar la web como app, en los navegadores que lo ofrecen.
export function InstallButton() {
  const [prompt, setPrompt] = useState<(Event & { prompt: () => Promise<void> }) | null>(null);
  useEffect(() => {
    const ready = (event: Event) => {
      event.preventDefault();
      setPrompt(event as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener("beforeinstallprompt", ready);
    return () => window.removeEventListener("beforeinstallprompt", ready);
  }, []);
  if (!prompt) return null;
  return (
    <button
      className="button"
      onClick={() => {
        void prompt.prompt();
        setPrompt(null);
      }}
    >
      <Download size={18} aria-hidden="true" /> Instalar Red Level como app
    </button>
  );
}

/// La tienda de verdad: el catálogo, el wallet de la cuenta y la compra con RLC.
export function Shop({ session }: { session: Session }) {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const signedIn = session.user !== null;

  useEffect(() => {
    api
      .store()
      .then(({ items }) => setItems(items))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!signedIn) return void setWallet(null);
    api
      .wallet()
      .then(setWallet)
      .catch(() => {});
    api
      .appearance()
      .then((r) => r.appearance && setAppearance(r.appearance))
      .catch(() => {});
  }, [signedIn]);

  // Todo es gratis: "Usar" lo consigue (sin coste) si hace falta y lo deja puesto, aquí y en tu PC al instante.
  async function use(item: StoreItem) {
    const part = item.id.split(":")[1] ?? "";
    setBusy(item.id);
    setError("");
    try {
      if (!(wallet?.owned.includes(item.id) ?? false)) setWallet(await api.buy(item.id));
      const next = { ...appearance, [item.kind]: part } as Appearance;
      await api.setAppearance(next);
      setAppearance(next);
      applyAppearance(next);
    } catch (e) {
      setError(errorText(e));
    }
    setBusy(null);
  }

  const card = (item: StoreItem) => {
    const active = appearance[item.kind] === (item.id.split(":")[1] ?? "");
    const [back, accent] = swatches[item.id] ?? ["#0c0304", "#dc0f1b"];
    return (
      <li key={item.id} className={active ? "is-active" : ""}>
        <span className="shop-swatch" style={{ background: `linear-gradient(135deg, ${accent} 0 34%, ${back} 34.5%)` }} aria-hidden="true" />
        <div className="shop-text">
          <h3>{item.name}</h3>
          <p>{item.about}</p>
        </div>
        <div className="shop-buy">
          {!signedIn ? (
            <Link to="/entrar" go={session.go} className="button" label="tienda-entrar">
              Entrar
            </Link>
          ) : active ? (
            <span className="shop-owned">
              <Check size={16} aria-hidden="true" /> En uso
            </span>
          ) : (
            <button className="button primary" disabled={busy !== null} onClick={() => void use(item)}>
              {busy === item.id ? "…" : "Usar"}
            </button>
          )}
        </div>
      </li>
    );
  };
  const themes = items.filter((i) => i.kind === "theme");
  const motions = items.filter((i) => i.kind === "motion");

  return (
    <section className="shop">
      <div className="shop-wallet panel">
        <div>
          <h2>
            <Coins size={22} aria-hidden="true" /> Tu wallet
          </h2>
          {signedIn ? (
            <p className="shop-balance">{rlc(wallet?.balance ?? 0)}</p>
          ) : (
            <p>Entra con tu cuenta para ver tus RLC y comprar. Es la misma cuenta del programa.</p>
          )}
          <p className="fine">RLC es la moneda de Red Level. La recarga con dinero abre próximamente; por ahora los reparte el equipo en regalos y eventos.</p>
        </div>
        <div className="shop-wallet-side">
          {!signedIn && (
            <Link to="/entrar" go={session.go} className="button primary" label="tienda-entrar">
              Entrar
            </Link>
          )}
          <InstallButton />
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {themes.length > 0 && (
        <>
          <h2 className="shop-cat">Temas de color</h2>
          <ul className="shop-items">{themes.map(card)}</ul>
        </>
      )}

      {motions.length > 0 && (
        <>
          <h2 className="shop-cat">Motion Packs</h2>
          <ul className="shop-items">{motions.map(card)}</ul>
        </>
      )}

      {signedIn && <p className="fine">Todo es gratis y queda en tu cuenta. Lo que elijas se aplica aquí y en tu PC al instante. También puedes cambiarlo en Perfil → Apariencia.</p>}

      {wallet && wallet.moves.length > 0 && (
        <div className="panel">
          <h2>Movimientos</h2>
          <ul className="price-list">
            {wallet.moves.map((move, index) => (
              <li key={index}>
                <span>
                  {moveDate(move.at)} · {move.note}
                </span>
                <b className={move.amount > 0 ? "shop-plus" : ""}>
                  {move.amount > 0 ? "+" : "−"}
                  {rlc(Math.abs(move.amount))}
                </b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/// Panel del equipo: dar (o retirar) RLC a una cuenta mientras no se venden.
export function GiveRlcPanel() {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("500");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ text: string; error?: boolean } | null>(null);

  async function give(event: React.FormEvent) {
    event.preventDefault();
    setResult(null);
    try {
      const done = await api.adminGiveRlc(email.trim(), Number(amount), note.trim());
      setResult({ text: `Hecho. ${done.name} tiene ahora ${rlc(done.balance)}.` });
    } catch (e) {
      setResult({ text: errorText(e), error: true });
    }
  }

  return (
    <section className="panel">
      <h2 id="rlc">Dar RLC a una cuenta</h2>
      <p className="fine">Para regalos, premios y pruebas. Una cantidad negativa los retira. Queda anotado en los movimientos de esa cuenta.</p>
      <form className="give-rlc" onSubmit={give}>
        <label>
          Correo de la cuenta
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          RLC
          <input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Motivo (lo verá el usuario)
          <input value={note} maxLength={160} placeholder="Regalo de Red Level" onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="button primary">Dar RLC</button>
      </form>
      {result && <p className={result.error ? "error" : "notice"}>{result.text}</p>}
    </section>
  );
}
