// Sonidos de la interfaz, hechos al vuelo con el sintetizador del navegador: no hay archivos de audio.

let context: AudioContext | null = null;
let enabled = true;

export const setSounds = (on: boolean) => void (enabled = on);

function tone(frequency: number, duration: number, volume: number, type: OscillatorType = "sine", glideTo?: number, delay = 0): void {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (glideTo) oscillator.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  } catch {
    /* sin audio disponible: la interfaz sigue igual */
  }
}

export const sfx = {
  /// Pasar de un juego o de un botón a otro.
  move: () => tone(620, 0.07, 0.05, "triangle"),
  /// Cambiar de biblioteca.
  tab: () => tone(440, 0.09, 0.05, "triangle", 660),
  /// Abrir un panel.
  open: () => tone(380, 0.14, 0.06, "sine", 760),
  /// Cerrar o volver atrás.
  back: () => tone(520, 0.13, 0.05, "sine", 260),
  /// Lanzar un juego.
  launch: () => {
    tone(330, 0.16, 0.07, "sine", 660);
    tone(660, 0.28, 0.06, "sine", 990, 0.12);
  },
};
