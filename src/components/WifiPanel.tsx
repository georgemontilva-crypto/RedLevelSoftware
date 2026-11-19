import { useCallback, useEffect, useState } from "react";
import { Check, Lock, RefreshCw } from "lucide-react";
import { api, errorText, type WifiNetwork, type WifiStatus } from "../lib/api";
import { Drawer } from "./Drawer";

function Bars({ signal }: { signal: number }) {
  const level = signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : 1;
  return (
    <span className="bars" role="img" aria-label={`Señal ${signal}%`}>
      {[1, 2, 3, 4].map((n) => (
        <i key={n} className={n <= level ? "on" : ""} style={{ height: `${n * 25}%` }} />
      ))}
    </span>
  );
}

export function WifiPanel({ onClose, onStatus }: { onClose: () => void; onStatus: (status: WifiStatus) => void }) {
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.wifiStatus();
      setStatus(next);
      onStatus(next);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [onStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function connect(network: WifiNetwork, key: string | null) {
    setBusy(network.ssid);
    setError(null);
    try {
      await api.wifiConnect(network, key);
      setSelected(null);
      setPassword("");
      // Windows tarda unos segundos en completar la conexión.
      await new Promise((resolve) => setTimeout(resolve, 3500));
      await refresh();
    } catch (e) {
      setError(errorText(e) || "Windows no pudo conectarse. Revisa la clave.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("__off");
    try {
      await api.wifiDisconnect();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  function choose(network: WifiNetwork) {
    if (network.connected || busy) return;
    setError(null);
    if (network.known || !network.secured) connect(network, null);
    else {
      setSelected(network.ssid);
      setPassword("");
    }
  }

  return (
    <Drawer title="Redes wifi" onClose={onClose}>
      <div className="row row-between">
        <p className="muted">{status?.connectedSsid ? `Conectado a ${status.connectedSsid}` : loading ? "Buscando redes…" : "Sin conexión wifi"}</p>
        <button className="btn btn-ghost btn-small" onClick={refresh} disabled={loading}>
          <RefreshCw size={15} className={loading ? "spin" : ""} aria-hidden="true" />
          Actualizar
        </button>
      </div>
      {error && <p className="note note-error">{error}</p>}
      {status?.message && <p className="note">{status.message}</p>}
      <ul className="networks">
        {status?.networks.map((network) => (
          <li key={network.ssid} className={network.connected ? "is-connected" : ""}>
            <button className="network" onClick={() => choose(network)} disabled={busy !== null}>
              <Bars signal={network.signal} />
              <span className="network-name">{network.ssid}</span>
              {busy === network.ssid ? (
                <span className="muted">Conectando…</span>
              ) : network.connected ? (
                <Check size={18} className="red" aria-label="Conectado" />
              ) : (
                network.secured && <Lock size={15} className="muted" aria-label="Con clave" />
              )}
            </button>
            {network.connected && (
              <button className="btn btn-ghost btn-small" onClick={disconnect} disabled={busy !== null}>
                Desconectar
              </button>
            )}
            {selected === network.ssid && !network.connected && (
              <form
                className="row network-key"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (password.length >= 8) connect(network, password);
                }}
              >
                <input className="field" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Clave de la red" aria-label={`Clave de ${network.ssid}`} />
                <button className="btn btn-play btn-small" type="submit" disabled={password.length < 8 || busy !== null}>
                  Conectar
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
