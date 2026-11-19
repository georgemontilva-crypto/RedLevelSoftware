import { motion } from "motion/react";

/// Marca de Red Level: dos galones, el de arriba en rojo (el nivel que acabas de subir).
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M9 40 24 25l15 15" stroke="var(--text)" strokeWidth="6.5" />
      <path d="M9 25 24 10l15 15" stroke="var(--red)" strokeWidth="6.5" />
    </svg>
  );
}

/// La misma marca, dibujándose: primero el galón blanco, luego el rojo sube a su sitio.
export function AnimatedMark({ size }: { size: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <motion.path
        d="M9 40 24 25l15 15"
        stroke="var(--text)"
        strokeWidth="6.5"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1], delay: 0.15 }}
      />
      <motion.path
        d="M9 25 24 10l15 15"
        stroke="var(--red)"
        strokeWidth="6.5"
        initial={{ y: 15, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.7 }}
      />
    </svg>
  );
}
