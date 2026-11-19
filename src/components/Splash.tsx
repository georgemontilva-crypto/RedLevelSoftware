import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionStyle } from "motion/react";
import { AnimatedMark } from "./Logo";
import { RING_INNER } from "./logoPaths";

const INTRO_MS = 2600;
// El logo se dibuja grande y se muestra reducido: así el aro sigue nítido mientras crece.
const BASE = 0.25;
const word = [..."RED", ..."LEVEL"];

/// Entrada de la app. El logo se enciende y, cuando la biblioteca está lista, el aro se abre:
/// crece hasta salirse de la pantalla y deja ver Red Level a través de él.
export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const logo = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const reduced = useReducedMotion();
  const [introDone, setIntroDone] = useState(false);
  const [open, setOpen] = useState(false);
  const hole = useMotionValue(-4);
  const scale = useMotionValue(BASE);
  const fade = useMotionValue(1);
  const holePx = useTransform(hole, (value) => `${value}px`);

  useEffect(() => {
    const timer = setTimeout(() => setIntroDone(true), reduced ? 500 : INTRO_MS);
    return () => clearTimeout(timer);
  }, [reduced]);

  useEffect(() => {
    if (!ready || !introDone || started.current) return;
    started.current = true;
    setOpen(true);
    (async () => {
      if (reduced) {
        await animate(fade, 0, { duration: 0.3 });
        onDone();
        return;
      }
      const size = logo.current?.getBoundingClientRect().width ?? 190;
      // La abertura nace justo por dentro del aro y crece con él, así el aro es siempre su borde.
      const start = size * ((RING_INNER + 3) / 232);
      const reach = Math.hypot(window.innerWidth, window.innerHeight) / 2;
      const grow = Math.max(8, (reach / start) * 1.12);
      await animate(hole, start, { duration: 0.38, ease: [0.3, 0, 0.2, 1] });
      const opening = { duration: 0.95, ease: [0.76, 0, 0.24, 1] as [number, number, number, number] };
      await Promise.all([animate(scale, BASE * grow, opening), animate(hole, start * grow, opening)]);
      onDone();
    })();
  }, [ready, introDone, reduced, hole, scale, fade, onDone]);

  return (
    <motion.div className="splash" style={{ "--hole": holePx, opacity: fade } as MotionStyle}>
      <motion.div className="splash-glow" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: open ? 0 : [0, 1, 0.55], scale: 1 }} transition={{ duration: open ? 0.3 : 1.3, delay: open ? 0 : 1.2 }} />
      <motion.div className="splash-logo" ref={logo} style={{ scale }}>
        <AnimatedMark open={open} />
      </motion.div>
      <motion.h1 className="splash-name" aria-label="Red Level" animate={{ opacity: open ? 0 : 1 }} transition={{ duration: 0.25 }}>
        {word.map((letter, i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            className={i < 3 ? "is-red" : ""}
            initial={{ opacity: 0, y: "0.45em" }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 1.45 + i * 0.05 }}
          >
            {letter}
          </motion.span>
        ))}
      </motion.h1>
    </motion.div>
  );
}
