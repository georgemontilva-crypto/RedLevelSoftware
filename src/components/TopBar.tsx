import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Coins, Download, GalleryHorizontal, HardDrive, LayoutGrid, List, Minimize2, Monitor, Newspaper, Plus, Power, Search, ShoppingBag, SlidersHorizontal, Trash2, Users, Wifi, WifiOff, X } from "lucide-react";
import { fileSrc, type Disk, type Profile, type Settings } from "../lib/api";
import { firstName, initials } from "../lib/format";
import { Mark } from "./Logo";

/// Pestaña de la biblioteca: "all", una tienda ("steam", "epic", "local"), "hidden" o una biblioteca propia ("c:<id>").
export type Tab = string;

export interface TabInfo {
  id: Tab;
  label: string;
  count: number;
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return <time className="clock">{now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}</time>;
}

export function Avatar({ profile, size }: { profile: Profile; size: "sm" | "lg" }) {
  return (
    <span className={`avatar avatar-${size}`}>
      {profile.avatarFile ? <img src={fileSrc(profile.avatarFile)} alt="" draggable={false} /> : initials(profile.name)}
    </span>
  );
}

interface Props {
  tabs: TabInfo[];
  tab: Tab;
  onTab: (tab: Tab) => void;
  /// Crea una biblioteca propia con ese nombre.
  onNewLibrary: (name: string) => void;
  /// Elimina la biblioteca propia de esa pestaña.
  onDeleteLibrary: (tab: Tab) => void;
  query: string;
  onQuery: (query: string) => void;
  view: Settings["view"];
  onView: (view: Settings["view"]) => void;
  profile: Profile;
  /// Título del juego que está abierto ahora, si lo hay.
  playing: string | null;
  /// Saldo del wallet en RLC; null sin sesión.
  balance: number | null;
  wifiOn: boolean | null;
  /// Discos del PC con su espacio libre.
  disks: Disk[];
  /// Versión nueva disponible, si la hay.
  updateVersion: string | null;
  /// Mensajes de amigos sin leer y solicitudes pendientes.
  socialCount: number;
  onMinimize: () => void;
  onOpen: (panel: "wifi" | "monitor" | "profile" | "power" | "update" | "store" | "friends" | "news") => void;
}

const gigas = (bytes: number) => `${Math.round(bytes / 2 ** 30).toLocaleString("es")} GB`;
const views: { id: Settings["view"]; label: string; icon: typeof List }[] = [
  { id: "shelf", label: "Fila de carátulas", icon: GalleryHorizontal },
  { id: "grid", label: "Cuadrícula", icon: LayoutGrid },
  { id: "list", label: "Lista", icon: List },
];

/// Espacio de cada disco: un icono en la barra que despliega justo debajo las unidades con su barra de uso.
function Disks({ disks }: { disks: Disk[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".disk-menu")) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  if (disks.length === 0) return null;
  return (
    <div className="disk-menu">
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="Espacio en disco" aria-expanded={open}>
        <HardDrive size={19} />
      </button>
      {open && (
        <div className="disk-pop" role="dialog" aria-label="Espacio en disco">
          {disks.map((disk) => {
            const used = disk.totalBytes > 0 ? 1 - disk.freeBytes / disk.totalBytes : 0;
            return (
              <div key={disk.letter} className="disk-row">
                <p>
                  <b>Disco {disk.letter}:</b>
                  <span>{gigas(disk.freeBytes)} libres</span>
                </p>
                <div className={`disk-bar ${used > 0.9 ? "is-full" : ""}`} role="img" aria-label={`${Math.round(used * 100)}% ocupado`}>
                  <span style={{ width: `${Math.round(used * 100)}%` }} />
                </div>
                <small>
                  {gigas(disk.totalBytes - disk.freeBytes)} usados de {gigas(disk.totalBytes)}
                </small>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TopBar({ tabs, tab, onTab, onNewLibrary, onDeleteLibrary, query, onQuery, view, onView, profile, playing, balance, wifiOn, disks, updateVersion, socialCount, onMinimize, onOpen }: Props) {
  const [naming, setNaming] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  useEffect(() => setRemoving(false), [tab]);
  const current = views.find((v) => v.id === view) ?? views[0];
  const next = views[(views.indexOf(current) + 1) % views.length];
  const ViewIcon = current.icon;

  return (
    <header className="topbar">
      <Mark size={30} />
      <nav className="tabs" aria-label="Bibliotecas">
        {tabs.map(({ id, label, count }) => (
          <button key={id} className={`tab ${tab === id ? "is-active" : ""}`} onClick={() => onTab(id)} aria-pressed={tab === id}>
            {label}
            <span className="tab-count">{count}</span>
            {tab === id && <motion.span className="tab-line" layoutId="tab-line" transition={{ type: "spring", stiffness: 520, damping: 42 }} />}
          </button>
        ))}
        {tab.startsWith("c:") && (
          <button className={`tab-tool ${removing ? "is-danger" : ""}`} onClick={() => (removing ? onDeleteLibrary(tab) : setRemoving(true))} aria-label="Eliminar esta biblioteca">
            <Trash2 size={15} aria-hidden="true" />
            {removing && "¿Eliminar?"}
          </button>
        )}
        {naming === null ? (
          <button className="tab-tool" onClick={() => setNaming("")} aria-label="Nueva biblioteca" title="Nueva biblioteca">
            <Plus size={16} aria-hidden="true" />
          </button>
        ) : (
          <form
            className="tab-new"
            onSubmit={(e) => {
              e.preventDefault();
              if (naming.trim()) onNewLibrary(naming.trim());
              setNaming(null);
            }}
          >
            <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} onBlur={() => naming.trim() === "" && setNaming(null)} placeholder="Nombre de la biblioteca" aria-label="Nombre de la biblioteca nueva" maxLength={30} />
          </form>
        )}
      </nav>

      <label className="search">
        <Search size={17} aria-hidden="true" />
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Buscar un juego" aria-label="Buscar un juego" spellCheck={false} />
        {query && (
          <button className="search-clear" onClick={() => onQuery("")} aria-label="Borrar búsqueda">
            <X size={15} />
          </button>
        )}
      </label>

      <div className="topbar-actions">
        {updateVersion && (
          <button className="update-pill" onClick={() => onOpen("update")}>
            <Download size={16} aria-hidden="true" />
            Actualizar a {updateVersion}
          </button>
        )}
        <button className="icon-btn" onClick={() => onView(next.id)} aria-label={`Vista: ${current.label}. Cambiar a ${next.label.toLowerCase()}`} title={`Vista: ${current.label}`}>
          <ViewIcon size={19} />
        </button>
        <Clock />
        <button className="profile-btn" onClick={() => onOpen("profile")}>
          <Avatar profile={profile} size="sm" />
          <span className="profile-text">
            <span>{firstName(profile.name)}</span>
            {balance !== null ? (
              <small className={`profile-wallet ${playing ? "is-playing" : ""}`} title={playing ? `Jugando ${playing}` : undefined}>
                {playing && <i aria-hidden="true" />}
                <Coins size={12} aria-hidden="true" /> {balance.toLocaleString("es")} RLC
              </small>
            ) : (
              playing && (
                <small className="profile-playing">
                  <i aria-hidden="true" />
                  Jugando {playing}
                </small>
              )
            )}
          </span>
        </button>
        {/* Barra lateral: los accesos de siempre, con nombre, en un solo sitio. Abajo, minimizar y apagar. */}
        <nav className="rail" aria-label="Accesos">
          <button className="rail-btn" onClick={() => onOpen("store")} aria-label="Red Level Store">
            <ShoppingBag size={22} aria-hidden="true" />
            <span>Tienda</span>
          </button>
          <button className="rail-btn" onClick={() => onOpen("news")} aria-label="Novedades: noticias y lanzamientos">
            <Newspaper size={22} aria-hidden="true" />
            <span>Novedades</span>
          </button>
          <button className="rail-btn has-badge" onClick={() => onOpen("friends")} aria-label={socialCount > 0 ? `Amigos: ${socialCount} sin leer` : "Amigos"}>
            <Users size={22} aria-hidden="true" />
            <span>Amigos</span>
            {socialCount > 0 && <b className="badge">{socialCount}</b>}
          </button>
          <button className="rail-btn" onClick={() => onOpen("monitor")} aria-label="Segundo monitor">
            <Monitor size={22} aria-hidden="true" />
            <span>Pantallas</span>
          </button>
          <button className="rail-btn" onClick={() => onOpen("wifi")} aria-label="Redes wifi">
            {wifiOn === false ? <WifiOff size={22} aria-hidden="true" /> : <Wifi size={22} aria-hidden="true" />}
            <span>Wifi</span>
          </button>
          <Disks disks={disks} />
          <button className="rail-btn" onClick={() => onOpen("profile")} aria-label="Mi cuenta y ajustes">
            <SlidersHorizontal size={22} aria-hidden="true" />
            <span>Ajustes</span>
          </button>
          <span className="rail-gap" aria-hidden="true" />
          <button className="rail-btn" onClick={onMinimize} aria-label="Minimizar Red Level" title="Minimizar Red Level">
            <Minimize2 size={22} aria-hidden="true" />
            <span>Minimizar</span>
          </button>
          <button className="rail-btn" onClick={() => onOpen("power")} aria-label="Salir o apagar">
            <Power size={22} aria-hidden="true" />
            <span>Apagar</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
