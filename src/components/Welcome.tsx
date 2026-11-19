import { useState } from "react";
import { motion } from "motion/react";
import { Camera } from "lucide-react";
import type { Profile } from "../lib/api";
import { Mark } from "./Logo";
import { Avatar } from "./TopBar";

interface Props {
  windowsName: string;
  profile: Profile;
  gameCount: number;
  onAvatar: () => void;
  onDone: (name: string) => void;
}

/// Primera vez: Red Level toma el nombre de la cuenta de Windows y deja cambiarlo y poner foto.
export function Welcome({ windowsName, profile, gameCount, onAvatar, onDone }: Props) {
  const [name, setName] = useState(profile.name || windowsName);
  return (
    <motion.div className="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
      <motion.form
        className="welcome-card"
        initial={{ y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onDone(name.trim());
        }}
      >
        <Mark size={40} />
        <h2>Este es tu perfil</h2>
        <p className="muted">
          {gameCount > 0
            ? `Encontré ${gameCount} ${gameCount === 1 ? "juego" : "juegos"} en este PC. Antes de entrar, confirma cómo quieres que te llame.`
            : "Tomé tu nombre de Windows. Cámbialo si quieres y ponle una foto."}
        </p>
        <div className="welcome-row">
          <button type="button" className="avatar-edit" onClick={onAvatar} aria-label="Elegir foto de perfil">
            <Avatar profile={{ ...profile, name }} size="lg" />
            <span className="avatar-edit-badge">
              <Camera size={15} aria-hidden="true" />
            </span>
          </button>
          <div className="profile-name">
            <label htmlFor="welcome-name">Tu nombre</label>
            <input id="welcome-name" className="field field-big" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
          </div>
        </div>
        <button className="btn btn-play" type="submit" disabled={!name.trim()}>
          Entrar a Red Level
        </button>
      </motion.form>
    </motion.div>
  );
}
