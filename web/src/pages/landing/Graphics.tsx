import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { PILL, RING_PATH, RING_WIDTH, SKULL_PATH } from "../../logoPaths";

/// Fondo de la entrada: líneas de barrido, el nombre en grande y cortes que saltan de vez en cuando.
export function GlitchBackdrop() {
  return (
    <div className="glitch" aria-hidden="true">
      <span className="glitch-word" data-text="REDLEVEL">
        REDLEVEL
      </span>
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={`glitch-bar glitch-bar-${n}`} />
      ))}
    </div>
  );
}

/// El logo encendiéndose como un neón, con un parpadeo de señal de vez en cuando.
export function HeroLogo() {
  const ring = { d: RING_PATH, strokeWidth: RING_WIDTH, strokeLinecap: "round" as const, fill: "none" };
  return (
    <div className="l-logo" aria-hidden="true">
      <motion.div className="l-logo-glow" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.4, delay: 0.8 }} />
      {/* Dos copias desplazadas que solo asoman durante el parpadeo. */}
      <svg className="l-logo-ghost is-a" viewBox="-116 -116 232 232">
        <path {...ring} stroke="#fff" />
        <path d={SKULL_PATH} fill="#fff" fillRule="evenodd" />
      </svg>
      <svg className="l-logo-ghost is-b" viewBox="-116 -116 232 232">
        <path {...ring} stroke="var(--red-bright)" />
        <path d={SKULL_PATH} fill="var(--red-bright)" fillRule="evenodd" />
      </svg>
      <svg className="l-logo-main" viewBox="-116 -116 232 232">
        <motion.path {...ring} stroke="var(--red)" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ pathLength: { duration: 1.2, ease: [0.65, 0, 0.35, 1], delay: 0.15 }, opacity: { duration: 0.1, delay: 0.15 } }} />
        <motion.rect {...PILL} fill="var(--red)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.25, duration: 0.3 }} />
        <motion.path d={SKULL_PATH} fill="#fff" fillRule="evenodd" style={{ transformBox: "fill-box", transformOrigin: "center" }} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.9, duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
      </svg>
    </div>
  );
}

/// Cinta de palabras que cruza la pantalla sin parar.
export function Marquee({ words }: { words: string[] }) {
  const row = [...words, ...words, ...words, ...words];
  return (
    <div className="marquee" aria-hidden="true">
      <div>
        {row.map((word, i) => (
          <span key={i} className={i % 2 ? "is-solid" : ""}>
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Dibujos de las ventajas ──────────────────────────────────

function Stack() {
  return (
    <div className="g g-stack">
      {["Steam", "Epic", "Locales"].map((name, i) => (
        <span key={name} style={{ ["--n" as string]: i }}>
          {name}
        </span>
      ))}
    </div>
  );
}

function Ring() {
  const total = 2 * Math.PI * 34;
  return (
    <div className="g g-ring">
      <svg viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="34" stroke="rgba(255,255,255,.14)" strokeWidth="6" fill="none" />
        <motion.circle cx="40" cy="40" r="34" stroke="var(--red)" strokeWidth="6" fill="none" strokeLinecap="round" strokeDasharray={total} transform="rotate(-90 40 40)" initial={{ strokeDashoffset: total }} whileInView={{ strokeDashoffset: total * (1 - 19 / 30) }} viewport={{ once: true }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} />
      </svg>
      <b>19/30</b>
      <div className="g-bars">
        {[0.9, 0.55, 0.75, 0.35, 0.6].map((h, i) => (
          <motion.i key={i} initial={{ scaleY: 0 }} whileInView={{ scaleY: h }} viewport={{ once: true }} transition={{ duration: 0.7, delay: 0.1 * i, ease: [0.16, 1, 0.3, 1] }} />
        ))}
      </div>
    </div>
  );
}

function Timer() {
  const [seconds, setSeconds] = useState(5047);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="g g-timer">
      <i />
      {pad(Math.floor(seconds / 3600))}:{pad(Math.floor((seconds % 3600) / 60))}:{pad(seconds % 60)}
    </div>
  );
}

function Loop() {
  return (
    <div className="g g-loop">
      <span>Juego</span>
      <svg viewBox="0 0 120 40">
        <path d="M6 12 H114" stroke="rgba(255,255,255,.2)" strokeWidth="2" strokeDasharray="4 5" />
        <path d="M114 28 H6" stroke="rgba(255,255,255,.2)" strokeWidth="2" strokeDasharray="4 5" />
        <circle r="5" fill="var(--red)">
          <animateMotion dur="3.2s" repeatCount="indefinite" path="M6 12 H114 V28 H6 Z" />
        </circle>
      </svg>
      <span>Biblioteca</span>
    </div>
  );
}

function Size({ size }: { size: string }) {
  return (
    <div className="g g-size">
      <b>{size}</b>
      <div>
        <motion.i initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 0.9, ease: [0.6, 0, 0.2, 1], delay: 0.2 }} />
      </div>
    </div>
  );
}

function Switch() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => setOn((v) => !v), 2400);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="g g-switch">
      <span className={on ? "is-on" : ""}>
        <i />
      </span>
      {on ? "Compartiendo" : "Sin compartir"}
    </div>
  );
}

export function AdvantageArt({ kind, size }: { kind: string; size: string }) {
  if (kind === "stack") return <Stack />;
  if (kind === "ring") return <Ring />;
  if (kind === "timer") return <Timer />;
  if (kind === "loop") return <Loop />;
  if (kind === "size") return <Size size={size} />;
  return <Switch />;
}

/// Cuadro de torneo que se va dibujando.
export function Bracket() {
  const line = { stroke: "var(--red)", strokeWidth: 2, fill: "none" };
  const draw = (delay: number) => ({ initial: { pathLength: 0 }, whileInView: { pathLength: 1 }, viewport: { once: true }, transition: { duration: 0.7, delay, ease: [0.6, 0, 0.2, 1] as [number, number, number, number] } });
  const slots = [10, 50, 100, 140];
  return (
    <svg className="bracket" viewBox="0 0 320 170" aria-hidden="true">
      {slots.map((y) => (
        <rect key={y} x="2" y={y} width="86" height="22" rx="6" fill="#140506" stroke="rgba(255,255,255,.25)" />
      ))}
      <motion.path d="M88 21 H110 V41 H126 M88 61 H110 V41" {...line} {...draw(0.1)} />
      <motion.path d="M88 111 H110 V131 H126 M88 151 H110 V131" {...line} {...draw(0.25)} />
      <rect x="126" y="30" width="86" height="22" rx="6" fill="#140506" stroke="rgba(255,255,255,.25)" />
      <rect x="126" y="120" width="86" height="22" rx="6" fill="#140506" stroke="rgba(255,255,255,.25)" />
      <motion.path d="M212 41 H232 V86 H246 M212 131 H232 V86" {...line} {...draw(0.6)} />
      <motion.rect x="246" y="72" width="72" height="28" rx="8" fill="var(--red)" initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.2, duration: 0.4 }} style={{ transformBox: "fill-box", transformOrigin: "center" }} />
      <motion.path d="M274 80 h16 v4 a8 8 0 0 1 -16 0 z M279 92 h6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 1.45 }} />
    </svg>
  );
}
