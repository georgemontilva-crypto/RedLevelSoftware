import { useState } from "react";
import { motion } from "motion/react";
import { LogOut, Power, RotateCcw } from "lucide-react";
import type { PowerAction } from "../lib/api";

const options: { id: PowerAction; label: string; hint: string; confirm: string; Icon: typeof Power }[] = [
  { id: "exit", label: "Salir al escritorio", hint: "Cierra Red Level y devuelve Windows a la normalidad.", confirm: "Salir", Icon: LogOut },
  { id: "restart", label: "Reiniciar el PC", hint: "Se cerrará todo lo que tengas abierto.", confirm: "Reiniciar ahora", Icon: RotateCcw },
  { id: "shutdown", label: "Apagar el PC", hint: "Se cerrará todo lo que tengas abierto.", confirm: "Apagar ahora", Icon: Power },
];

export function PowerMenu({ onAction, onClose }: { onAction: (action: PowerAction) => void; onClose: () => void }) {
  const [pending, setPending] = useState<PowerAction | null>(null);
  return (
    <>
      <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
      <motion.div
        className="power"
        role="dialog"
        aria-label="Salir o apagar"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {options.map(({ id, label, hint, confirm, Icon }) =>
          pending === id ? (
            <div key={id} className="power-confirm">
              <p>{hint}</p>
              <div className="row">
                <button className="btn btn-ghost btn-small" onClick={() => setPending(null)}>
                  Cancelar
                </button>
                <button className="btn btn-play btn-small" onClick={() => onAction(id)} autoFocus>
                  {confirm}
                </button>
              </div>
            </div>
          ) : (
            <button key={id} className="power-option" onClick={() => (id === "exit" ? onAction(id) : setPending(id))}>
              <Icon size={20} aria-hidden="true" />
              {label}
            </button>
          ),
        )}
      </motion.div>
    </>
  );
}
