import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api } from "../api";
import { applyAppearance, LOOK_OPTIONS, MOTION_OPTIONS, THEME_OPTIONS, type Appearance } from "../theme";
import type { Session } from "../App";

const DEFAULT: Appearance = { theme: "red-level", look: "clasico", motion: "quieto" };

/// Selector de aspecto del teléfono: tema de color, interfaz y Motion Pack. Lo que elijas se aplica aquí al
/// instante y se sincroniza con tu PC (y al revés). Todo es gratis; lo de la tienda se consigue solo al elegirlo.
export function Apariencia(_props: { session: Session }) {
  const [current, setCurrent] = useState<Appearance>(DEFAULT);
  const [owned, setOwned] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .appearance()
      .then((r) => setCurrent(r.appearance ?? DEFAULT))
      .catch(() => {});
    api
      .wallet()
      .then((w) => setOwned(w.owned))
      .catch(() => {});
  }, []);

  const choose = async (kind: keyof Appearance, id: string, store: boolean) => {
    if (current[kind] === id) return;
    const item = `${kind}:${id}`;
    setBusy(item);
    setError(null);
    try {
      if (store && !owned.includes(item)) {
        const w = await api.buy(item); // gratis
        setOwned(w.owned);
      }
      const next = { ...current, [kind]: id };
      await api.setAppearance(next);
      setCurrent(next);
      applyAppearance(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar.");
    } finally {
      setBusy(null);
    }
  };

  const Row = ({ kind, id, name, store, swatch }: { kind: keyof Appearance; id: string; name: string; store: boolean; swatch?: string }) => {
    const on = current[kind] === id;
    const item = `${kind}:${id}`;
    return (
      <li>
        <button className={on ? "look-pick is-on" : "look-pick"} onClick={() => void choose(kind, id, store)} disabled={busy !== null} aria-pressed={on}>
          <span className="look-swatch" style={swatch ? { background: swatch } : undefined} aria-hidden="true" />
          <span className="look-name">{name}</span>
          {on ? (
            <span className="look-tag">
              <Check size={15} aria-hidden="true" /> En uso
            </span>
          ) : (
            <span className="look-tag quiet">{busy === item ? "…" : "Usar"}</span>
          )}
        </button>
      </li>
    );
  };

  return (
    <div className="appx-page">
      <p className="appx-hello">
        Elige cómo se ve Red Level. <b>Se aplica aquí y en tu PC al instante.</b>
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <h2 className="look-head">Tema de color</h2>
      <ul className="look-list">
        {THEME_OPTIONS.map((t) => (
          <Row key={t.id} kind="theme" id={t.id} name={t.name} store={t.store} swatch={t.swatch} />
        ))}
      </ul>

      <h2 className="look-head">Interfaz</h2>
      <ul className="look-list">
        {LOOK_OPTIONS.map((l) => (
          <Row key={l.id} kind="look" id={l.id} name={l.name} store={l.store} />
        ))}
      </ul>

      <h2 className="look-head">Motion Pack</h2>
      <ul className="look-list">
        {MOTION_OPTIONS.map((m) => (
          <Row key={m.id} kind="motion" id={m.id} name={m.name} store={m.store} />
        ))}
      </ul>
    </div>
  );
}
