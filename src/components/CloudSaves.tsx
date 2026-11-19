import { useState } from "react";
import { CloudDownload, CloudUpload, FolderOpen } from "lucide-react";
import { api, type Game } from "../lib/api";
import type { Cloud } from "../lib/online";

interface Props {
  game: Game;
  cloud: Cloud;
  /// Hay sesión iniciada en Red Level.
  signedIn: boolean;
  /// Carpeta de partidas de este juego en este PC, si ya se eligió.
  folder: string | undefined;
  onFolders: (folders: Record<string, string>) => void;
}

function size(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString("es", { maximumFractionDigits: 1 })} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toLocaleString("es", { maximumFractionDigits: 1 })} MB`;
  return bytes > 0 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : "0 MB";
}

function when(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/// Guardado en la nube de un juego: dónde están sus partidas en este PC, y subir o restaurar la copia.
export function CloudSaves({ game, cloud, signedIn, folder, onFolders }: Props) {
  const [busy, setBusy] = useState<"up" | "down" | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const save = cloud.of(game);

  const pick = async () => {
    try {
      onFolders(await api.pickSaveFolder(game.id));
    } catch (e) {
      setMessage({ text: errorText(e), error: true });
    }
  };
  const run = async (kind: "up" | "down") => {
    setBusy(kind);
    setConfirming(false);
    setMessage(null);
    try {
      if (kind === "up") {
        const done = await cloud.backup(game);
        setMessage({ text: `Copia subida: ${size(done.size)}.` });
      } else {
        const files = await cloud.restore(game);
        setMessage({ text: `Partidas restauradas (${files} ${files === 1 ? "archivo" : "archivos"}). Lo que había se guardó antes en este PC.` });
      }
    } catch (e) {
      setMessage({ text: errorText(e), error: true });
    }
    setBusy(null);
  };

  return (
    <section className="sheet-section cloud-saves">
      <h4>Guardado en la nube</h4>
      {!signedIn && <p className="muted">Inicia sesión en Red Level para guardar tus partidas en la nube.</p>}
      {signedIn && !cloud.enabled && <p className="muted">El guardado en la nube todavía no está activo en Red Level.</p>}
      {signedIn && cloud.enabled && (
        <>
          {save ? (
            <p className="cloud-status">
              <CloudUpload size={18} aria-hidden="true" />
              <span>
                Última copia: <b>{when(save.updatedAt)}</b> · {size(save.size)}
              </span>
            </p>
          ) : (
            <p className="muted">Este juego aún no tiene copia en la nube.</p>
          )}

          {folder ? (
            <>
              <p className="cloud-folder" title={folder}>
                <FolderOpen size={16} aria-hidden="true" />
                <span>{folder}</span>
              </p>
              <div className="row">
                <button className="btn btn-play btn-small" disabled={busy !== null} onClick={() => void run("up")}>
                  <CloudUpload size={16} aria-hidden="true" /> {busy === "up" ? "Subiendo…" : "Subir ahora"}
                </button>
                {save && !confirming && (
                  <button className="btn btn-ghost btn-small" disabled={busy !== null} onClick={() => setConfirming(true)}>
                    <CloudDownload size={16} aria-hidden="true" /> {busy === "down" ? "Restaurando…" : "Restaurar"}
                  </button>
                )}
                <button className="btn btn-ghost btn-small" disabled={busy !== null} onClick={() => void pick()}>
                  Cambiar carpeta
                </button>
              </div>
              {confirming && (
                <div className="note">
                  <p>Restaurar cambia las partidas de este PC por las de la nube. Lo que hay ahora se guarda antes en el disco, por si acaso.</p>
                  <div className="row">
                    <button className="btn btn-danger btn-small" onClick={() => void run("down")}>
                      Restaurar partidas
                    </button>
                    <button className="btn btn-ghost btn-small" onClick={() => setConfirming(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              <p className="muted small">Red Level sube una copia sola cada vez que cierras el juego.</p>
            </>
          ) : (
            <>
              <p className="muted">
                {save ? "Elige en qué carpeta guarda este juego sus partidas para poder restaurar la copia en este PC." : "Dinos en qué carpeta guarda este juego sus partidas y Red Level subirá una copia cada vez que lo cierres."}
              </p>
              <button className="btn btn-ghost btn-small" onClick={() => void pick()}>
                <FolderOpen size={16} aria-hidden="true" /> Elegir carpeta de partidas
              </button>
              <p className="muted small">Suele estar en Documentos, en «Juegos guardados» o en AppData. Elige solo la carpeta de las partidas, no la del juego entero.</p>
            </>
          )}

          {message && <p className={message.error ? "note note-error" : "note"}>{message.text}</p>}
          {cloud.totalBytes > 0 && (
            <p className="muted small">
              Usas {size(cloud.usedBytes)} de {size(cloud.totalBytes)} en la nube.
            </p>
          )}
        </>
      )}
    </section>
  );
}
