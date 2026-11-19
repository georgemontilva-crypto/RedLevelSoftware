import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowLeft, type LucideIcon } from "lucide-react";

export interface ScreenTab {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface Props {
  title: string;
  tabs: ScreenTab[];
  tab: string;
  onTab: (id: string) => void;
  onClose: () => void;
  /// Lo que va a la derecha del título (por ejemplo, un aviso de lo que se está probando).
  aside?: ReactNode;
  children: ReactNode;
}

/// Pantalla completa con categorías a la izquierda. La usan la tienda y los ajustes: lo que no cabe en un panel lateral.
export function Screen({ title, tabs, tab, onTab, onClose, aside, children }: Props) {
  return (
    <motion.div className="screen" role="dialog" aria-label={title} initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
      <header className="screen-head">
        <button className="icon-btn" onClick={onClose} aria-label="Volver a la biblioteca">
          <ArrowLeft size={22} />
        </button>
        <h2>{title}</h2>
        {aside}
      </header>
      <div className="screen-body">
        <nav className="screen-nav" aria-label="Categorías">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} className={tab === id ? "is-on" : ""} onClick={() => onTab(id)} aria-pressed={tab === id}>
              <Icon size={19} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <div className="screen-content" key={tab}>
          {children}
        </div>
      </div>
    </motion.div>
  );
}
