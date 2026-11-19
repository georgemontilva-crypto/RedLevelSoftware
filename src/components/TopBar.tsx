import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Monitor, Power, Search, Wifi, WifiOff, X } from "lucide-react";
import { fileSrc, type Profile, type StoreId } from "../lib/api";
import { firstName, initials, storeShort } from "../lib/format";
import { Mark } from "./Logo";

export type Tab = "all" | StoreId;

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
  tab: Tab;
  counts: Record<Tab, number>;
  onTab: (tab: Tab) => void;
  query: string;
  onQuery: (query: string) => void;
  profile: Profile;
  wifiOn: boolean | null;
  onOpen: (panel: "wifi" | "monitor" | "profile" | "power") => void;
}

export function TopBar({ tab, counts, onTab, query, onQuery, profile, wifiOn, onOpen }: Props) {
  const tabs: Tab[] = ["all", "steam", "epic", "local"];
  return (
    <header className="topbar">
      <Mark size={30} />
      <nav className="tabs" aria-label="Tiendas">
        {tabs.map((id) => (
          <button key={id} className={`tab ${tab === id ? "is-active" : ""}`} onClick={() => onTab(id)} aria-pressed={tab === id}>
            {id === "all" ? "Todos" : storeShort[id]}
            <span className="tab-count">{counts[id]}</span>
            {tab === id && <motion.span className="tab-line" layoutId="tab-line" transition={{ type: "spring", stiffness: 520, damping: 42 }} />}
          </button>
        ))}
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
        <button className="icon-btn" onClick={() => onOpen("wifi")} aria-label="Redes wifi">
          {wifiOn === false ? <WifiOff size={19} /> : <Wifi size={19} />}
        </button>
        <button className="icon-btn" onClick={() => onOpen("monitor")} aria-label="Segundo monitor">
          <Monitor size={19} />
        </button>
        <Clock />
        <button className="profile-btn" onClick={() => onOpen("profile")}>
          <Avatar profile={profile} size="sm" />
          <span>{firstName(profile.name)}</span>
        </button>
        <button className="icon-btn" onClick={() => onOpen("power")} aria-label="Salir o apagar">
          <Power size={19} />
        </button>
      </div>
    </header>
  );
}
