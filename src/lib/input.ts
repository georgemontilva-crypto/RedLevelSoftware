// Manejo sin ratón: flechas o WASD, Tab para cambiar de biblioteca y mandos (Xbox, PS4, PS5 y compatibles).
// Todo se traduce a las mismas acciones, así teclado y mando hacen siempre lo mismo.

import { useEffect, useRef } from "react";

export type Action = "left" | "right" | "up" | "down" | "accept" | "back" | "details" | "nextTab" | "prevTab" | "menu";

const keys: Record<string, Action> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  a: "left",
  d: "right",
  w: "up",
  s: "down",
  Escape: "back",
};

// Botones del mando en la disposición estándar del navegador: sirve igual para Xbox y PlayStation.
const buttons: Record<number, Action> = { 0: "accept", 1: "back", 2: "details", 4: "prevTab", 5: "nextTab", 9: "menu", 12: "up", 13: "down", 14: "left", 15: "right" };
const FIRST_REPEAT = 380;
const NEXT_REPEAT = 130;

/// Marca que se está manejando sin ratón, para dibujar bien visible dónde está el foco.
function usingKeys(on: boolean): void {
  if (on) document.body.dataset.nav = "keys";
  else delete document.body.dataset.nav;
}

/// Escucha teclado y mando y avisa de cada acción. `active` apaga el mando mientras se juega.
export function useInput(onAction: (action: Action, fromPad: boolean) => void, active: boolean): void {
  const handler = useRef(onAction);
  handler.current = onAction;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      // Tab solo cambia de biblioteca, también desde el buscador.
      if (event.key === "Tab") {
        event.preventDefault();
        if (typing) (event.target as HTMLElement).blur();
        usingKeys(true);
        handler.current(event.shiftKey ? "prevTab" : "nextTab", false);
        return;
      }
      const action = keys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (!action || (typing && action !== "back")) return;
      usingKeys(true);
      if (action !== "back") event.preventDefault();
      handler.current(action, false);
    };
    const onMouse = () => usingKeys(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", onMouse);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", onMouse);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    // Cuándo se pulsó cada botón y cuándo toca repetirlo si se mantiene.
    const held = new Map<string, number>();
    let frame = 0;
    const fire = (id: string, pressed: boolean, action: Action, now: number) => {
      if (!pressed) {
        held.delete(id);
        return;
      }
      const next = held.get(id);
      if (next === undefined) {
        held.set(id, now + FIRST_REPEAT);
      } else if (now >= next && (action === "left" || action === "right" || action === "up" || action === "down")) {
        held.set(id, now + NEXT_REPEAT);
      } else {
        return;
      }
      usingKeys(true);
      handler.current(action, true);
    };
    // El mando se consulta en cada fotograma, pero solo mientras hay un mando conectado y Red Level tiene el foco.
    // Sin mando, o con un juego delante, no se pide ni un fotograma: la interfaz quieta no despierta al procesador.
    let running = false;
    const hasPad = () => Array.from(navigator.getGamepads?.() ?? []).some(Boolean);
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
      held.clear();
    };
    const poll = (now: number) => {
      if (!document.hasFocus() || !hasPad()) return stop();
      frame = requestAnimationFrame(poll);
      for (const pad of navigator.getGamepads?.() ?? []) {
        if (!pad) continue;
        for (const [index, action] of Object.entries(buttons)) fire(`${pad.index}:b${index}`, pad.buttons[Number(index)]?.pressed ?? false, action, now);
        const [x = 0, y = 0] = pad.axes;
        fire(`${pad.index}:x-`, x < -0.55, "left", now);
        fire(`${pad.index}:x+`, x > 0.55, "right", now);
        fire(`${pad.index}:y-`, y < -0.55, "up", now);
        fire(`${pad.index}:y+`, y > 0.55, "down", now);
      }
    };
    const start = () => {
      if (running || !document.hasFocus() || !hasPad()) return;
      running = true;
      frame = requestAnimationFrame(poll);
    };
    // El navegador avisa al conectar un mando (o al pulsar su primer botón) y al volver el foco a la ventana.
    window.addEventListener("gamepadconnected", start);
    window.addEventListener("focus", start);
    window.addEventListener("blur", stop);
    start();
    return () => {
      stop();
      window.removeEventListener("gamepadconnected", start);
      window.removeEventListener("focus", start);
      window.removeEventListener("blur", stop);
    };
  }, [active]);
}

const FOCUSABLE = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

function focusables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
}

/// Mueve el foco al elemento anterior o siguiente dentro de una zona. Devuelve si se movió.
export function moveFocus(root: ParentNode | null, delta: 1 | -1): boolean {
  if (!root) return false;
  const list = focusables(root);
  if (list.length === 0) return false;
  const index = list.indexOf(document.activeElement as HTMLElement);
  const next = index === -1 ? (delta === 1 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, index + delta));
  if (next === index) return false;
  list[next].focus();
  list[next].scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

/// El elemento con el foco, si está dentro de esa zona.
export function focusedIn(root: ParentNode | null): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null;
  return root && el && el !== document.body && root.contains(el) ? el : null;
}
