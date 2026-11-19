import { useState } from "react";
import { motion } from "motion/react";
import { Download } from "lucide-react";
import { api, errorText, type Update } from "../lib/api";

/// Aviso de versión nueva: explica qué va a pasar y lanza la actualización.
export function UpdatePrompt({ update, current, onClose }: { update: Update; current: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function install() {
    setBusy(true);
    setError(null);
    try {
      await api.installUpdate(update.url);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <>
      <motion.div className="scrim" onClick={busy ? undefined : onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
      <motion.div className="update" role="dialog" aria-label="Actualizar Red Level" initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}>
        <h3>Hay una versión nueva</h3>
        <p className="update-versions">
          Tienes la {current}. Está disponible la <b>{update.version}</b>.
        </p>
        <p className="muted">Red Level la descarga ({(update.size / 1024 / 1024).toLocaleString("es", { maximumFractionDigits: 1 })} MB), se cierra, se instala sola y vuelve a abrirse. Tu perfil y tus horas se conservan.</p>
        {busy && <div className="session-wait" aria-hidden="true" />}
        {error && <p className="note note-error">{error}</p>}
        <div className="row">
          <button className="btn btn-play" onClick={install} disabled={busy} autoFocus>
            <Download size={18} aria-hidden="true" />
            {busy ? "Descargando…" : "Descargar e instalar"}
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Más tarde
          </button>
        </div>
      </motion.div>
    </>
  );
}
