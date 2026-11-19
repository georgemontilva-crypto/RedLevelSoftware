import { useEffect, useMemo, useState } from "react";
import { FolderSearch, Search } from "lucide-react";
import { api, errorText, type InstalledApp, type SecondState } from "../lib/api";

interface Props {
  /// Apps que ya están en la barra, para no ofrecerlas otra vez.
  added: string[];
  onAdded: (state: SecondState) => void;
}

/// Lista de programas instalados en el PC, con su icono: se toca uno y queda añadido a la barra del segundo monitor.
export function AppPicker({ added, onAdded }: Props) {
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api
      .installedApps()
      .then(setApps)
      .catch((e) => {
        setApps([]);
        setError(errorText(e));
      });
  }, []);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (apps ?? []).filter((app) => !added.includes(app.name) && (!needle || app.name.toLowerCase().includes(needle)));
  }, [apps, query, added]);

  async function add(id: string, action: () => Promise<SecondState>) {
    setBusy(id);
    setError(null);
    try {
      onAdded(await action());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="app-picker">
      <label className="search app-picker-search">
        <Search size={17} aria-hidden="true" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar entre tus apps" aria-label="Buscar entre tus apps" spellCheck={false} />
      </label>
      {apps === null && <p className="muted small">Buscando los programas instalados en tu PC…</p>}
      {error && <p className="note note-error">{error}</p>}
      {apps !== null && shown.length === 0 && !error && <p className="muted small">{query ? `Nada coincide con «${query.trim()}».` : "No hay más apps que añadir."}</p>}
      <ul className="app-grid">
        {shown.map((app) => (
          <li key={app.id}>
            <button onClick={() => add(app.id, () => api.secondAddInstalled(app))} disabled={busy !== null} title={app.name}>
              {app.icon ? <img src={`data:image/png;base64,${app.icon}`} alt="" /> : <span className="app-letter">{app.name.slice(0, 1).toUpperCase()}</span>}
              <span>{busy === app.id ? "Añadiendo…" : app.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <button className="btn btn-ghost btn-small" onClick={() => add("archivo", api.secondAddApp)} disabled={busy !== null}>
        <FolderSearch size={16} aria-hidden="true" />
        ¿No está en la lista? Buscar el programa
      </button>
    </div>
  );
}
