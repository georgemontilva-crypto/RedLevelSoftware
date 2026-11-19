import { useState, type MouseEvent, type ReactNode } from "react";
import { motion } from "motion/react";

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
