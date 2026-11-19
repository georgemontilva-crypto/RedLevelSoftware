import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

const blocked = [
  { id: "win", keys: ["⊞ Win"], does: "Abre el menú Inicio en mitad de la partida" },
  { id: "alttab", keys: ["Alt", "Tab"], does: "Te cambia a otra ventana" },
  { id: "altf4", keys: ["Alt", "F4"], does: "Cierra lo que tengas delante" },
  { id: "ctrlesc", keys: ["Ctrl", "Esc"], does: "Otra forma de abrir Inicio" },
];

/// Las teclas que Red Level anula. Se pueden pulsar: aquí no pasa nada, igual que en el programa.
export function Keys() {
  const [hit, setHit] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const press = (id: string) => {
    setHit(id);
    setCount((n) => n + 1);
  };

  // La tecla Windows de verdad también cuenta.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Meta" && press("win");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!hit) return;
    const timer = setTimeout(() => setHit(null), 1600);
    return () => clearTimeout(timer);
  }, [hit, count]);

  const current = blocked.find((b) => b.id === hit);
  return (
    <div className="keys">
      <div className="keys-row">
        {blocked.map((b) => (
          <motion.button key={b.id} className={`combo ${hit === b.id ? "is-hit" : ""}`} onClick={() => press(b.id)} animate={hit === b.id ? { x: [0, -5, 5, -3, 3, 0] } : { x: 0 }} transition={{ duration: 0.35 }}>
            {b.keys.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
          </motion.button>
        ))}
      </div>
      <p className="keys-status" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.span key={current?.id ?? "idle"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {current ? (
              <>
                <b>Anulada.</b> {current.does}; con Red Level abierto no hace nada.
              </>
            ) : (
              "Pulsa una. Con Red Level abierto, ninguna te saca del juego."
            )}
          </motion.span>
        </AnimatePresence>
      </p>
      <p className="fine">
        Siempre tienes una salida: <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>Mayús</kbd> <kbd>Q</kbd> cierra Red Level y deja Windows como estaba.
      </p>
    </div>
  );
}

const apps = [
  { id: "Discord", lines: ["# general", "Lu: ¿entramos ya?", "Tú: dame dos minutos"] },
  { id: "Spotify", lines: ["Sonando ahora", "Lista para jugar de noche", "▮▮  1:42 ─────── 3:58"] },
  { id: "YouTube", lines: ["Guía del jefe final", "12 min", "▶ Reproduciendo"] },
];

/// Dos monitores: el juego en uno y, en el otro, la barra de Red Level para cambiar de app.
export function TwoScreens() {
  const [app, setApp] = useState(apps[0]);
  return (
    <div className="screens">
      <div className="screen screen-game">
        <span>Tu juego, a pantalla completa</span>
      </div>
      <div className="screen screen-second">
        <div className="screen-bar">
          {apps.map((a) => (
            <button key={a.id} className={a.id === app.id ? "is-on" : ""} onClick={() => setApp(a)}>
              {a.id}
              {a.id === app.id && <motion.i layoutId="screen-line" />}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={app.id} className="screen-app" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <strong>{app.id}</strong>
            {app.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/// Tarjeta que se inclina hacia el cursor.
export function Tilt({ children, className }: { children: ReactNode; className?: string }) {
  const [style, setStyle] = useState({ rotateX: 0, rotateY: 0 });
  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    setStyle({ rotateX: -y * 9, rotateY: x * 11 });
  };
  return (
    <div className={`tilt ${className ?? ""}`} onMouseMove={onMove} onMouseLeave={() => setStyle({ rotateX: 0, rotateY: 0 })}>
      <motion.div animate={style} transition={{ type: "spring", stiffness: 180, damping: 18 }} style={{ transformPerspective: 900 }}>
        {children}
      </motion.div>
    </div>
  );
}

/// Aparece al entrar en pantalla, una sola vez.
export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-12% 0px" }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay }}>
      {children}
    </motion.div>
  );
}
