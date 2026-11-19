import { motion } from "motion/react";
import { AnimatedMark } from "./Logo";

const letters = "Red Level".split("");

/// Entrada de la app. Un solo movimiento: se dibuja la marca, aparece el nombre
/// y una línea roja "sube de nivel" a lo ancho de la pantalla.
export function Splash() {
  return (
    <motion.div className="splash" exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}>
      <div className="splash-center">
        <AnimatedMark size={132} />
        <h1 className="splash-name" aria-label="Red Level">
          {letters.map((letter, i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              initial={{ opacity: 0, y: "0.5em" }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 1.15 + i * 0.045 }}
            >
              {letter === " " ? " " : letter}
            </motion.span>
          ))}
        </h1>
      </div>
      <motion.div
        className="splash-line"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.9, ease: [0.7, 0, 0.2, 1], delay: 1.55 }}
      />
    </motion.div>
  );
}
