// Tema de color de la cuenta en la web, igual que en el programa. El aspecto (tema, interfaz y Motion Pack) se
// guarda en la cuenta; aquí se pinta con los mismos colores que el launcher, así lo que cambias en el PC se ve
// igual en el teléfono. Las paletas son las mismas que en el programa (src/lib/themes.ts).

type Vars = Record<string, string>;

function palette(accent: string, bright: string, deep: string, logo: string, surface: string, raised: string, glow: string, glowStrong: string, accentRgb: string, logoRgb: string, onAccent = "#fff"): Vars {
  return { "--red": accent, "--red-bright": bright, "--red-deep": deep, "--logo": logo, "--surface": surface, "--raised": raised, "--glow": glow, "--glow-strong": glowStrong, "--accent-rgb": accentRgb, "--logo-rgb": logoRgb, "--on-accent": onAccent };
}

// red-level (el de serie) no cambia nada: deja los colores de la marca de la web.
const THEMES: Record<string, Vars> = {
  medianoche: palette("#2f6bff", "#5c8dff", "#0b2a78", "#1a47b8", "#03060c", "#0a1220", "#00081d", "#001238", "47, 107, 255", "26, 71, 184"),
  esmeralda: palette("#12b76a", "#3ddc91", "#064e2e", "#0a8a4e", "#030a06", "#0a1a11", "#001d0e", "#00361a", "18, 183, 106", "10, 138, 78", "#04140b"),
  dark: palette("#d4d4d8", "#fafafa", "#27272a", "#52525b", "#050505", "#131314", "#000000", "#0b0b0c", "212, 212, 216", "82, 82, 91", "#0a0a0a"),
  "neon-violeta": palette("#a855f7", "#c084fc", "#4c1d95", "#7e22ce", "#07030c", "#140a20", "#12001d", "#240038", "168, 85, 247", "126, 34, 206"),
  ambar: palette("#f59e0b", "#fbbf24", "#78350f", "#b45309", "#0c0703", "#1a1108", "#1d1000", "#382000", "245, 158, 11", "180, 83, 9", "#1a1000"),
  hielo: palette("#22d3ee", "#67e8f9", "#155e75", "#0891b2", "#03090c", "#08161a", "#00161d", "#002a38", "34, 211, 238", "8, 145, 178", "#04141a"),
};

const NAMES = ["--red", "--red-bright", "--red-deep", "--logo", "--surface", "--raised", "--glow", "--glow-strong", "--accent-rgb", "--logo-rgb", "--on-accent"];
const LOOKS = ["glitch", "cristal"];
const MOTIONS = ["brasas", "aurora", "rejilla", "estrellas"];

export interface Appearance {
  theme: string;
  look: string;
  motion: string;
}

/// Pinta la web con el aspecto de la cuenta: colores del tema, y marca la interfaz y el Motion Pack en el <html>
/// (el CSS que los dibuja llegará con el resto de la interfaz; de momento al menos se sincronizan los colores).
export function applyAppearance(a: Appearance | null): void {
  const root = document.documentElement;
  const vars = a ? THEMES[a.theme] : undefined;
  for (const name of NAMES) {
    if (vars && vars[name]) root.style.setProperty(name, vars[name]);
    else root.style.removeProperty(name);
  }
  if (a && LOOKS.includes(a.look)) root.dataset.look = a.look;
  else delete root.dataset.look;
  if (a && MOTIONS.includes(a.motion)) root.dataset.motion = a.motion;
  else delete root.dataset.motion;
}
