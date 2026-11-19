import { motion } from "motion/react";
import { LOGO_VIEWBOX, PILL, RING_PATH, RING_WIDTH, SKULL_PATH } from "./logoPaths";

/// Logo de Red Level: el aro abierto con la calavera.
export function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox={LOGO_VIEWBOX} fill="none" aria-hidden="true">
      <path d={RING_PATH} stroke="var(--logo)" strokeWidth={RING_WIDTH} strokeLinecap="round" />
      <rect {...PILL} fill="var(--logo)" />
      <path d={SKULL_PATH} fill="var(--text)" fillRule="evenodd" />
    </svg>
  );
}

/// El logo encendiéndose: el aro se traza, la calavera aparece y la pieza de arriba cierra el circuito.
/// `open` apaga la calavera para que el aro quede como marco de la apertura.
export function AnimatedMark({ open }: { open: boolean }) {
  return (
    <svg className="mark" width="100%" height="100%" viewBox={LOGO_VIEWBOX} fill="none" aria-hidden="true" overflow="visible">
      <motion.path
        d={RING_PATH}
        stroke="var(--logo)"
        strokeWidth={RING_WIDTH}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ pathLength: { duration: 1.05, ease: [0.65, 0, 0.35, 1], delay: 0.25 }, opacity: { duration: 0.1, delay: 0.25 } }}
      />
      <motion.rect
        {...PILL}
        fill="var(--logo)"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        initial={{ opacity: 0, scaleX: 0.2 }}
        animate={{ opacity: open ? 0 : 1, scaleX: 1 }}
        transition={{ duration: open ? 0.2 : 0.35, ease: [0.16, 1, 0.3, 1], delay: open ? 0 : 1.25 }}
      />
      <motion.path
        d={SKULL_PATH}
        fill="var(--text)"
        fillRule="evenodd"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        initial={{ opacity: 0, scale: 0.82 }}
        animate={{ opacity: open ? 0 : 1, scale: open ? 0.9 : 1 }}
        transition={{ duration: open ? 0.25 : 0.6, ease: [0.16, 1, 0.3, 1], delay: open ? 0 : 0.85 }}
      />
    </svg>
  );
}
