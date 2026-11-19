// Temas visuales de Red Level. Cada uno cambia los colores de la interfaz; el de serie no cambia nada.
// Los "incluidos" vienen con el programa. Los de "tienda" se pueden probar, y se venderán en Red Level Store.

export interface Theme {
  id: string;
  name: string;
  about: string;
  /// "incluido": gratis con el programa. "tienda": producto de Red Level Store.
  kind: "incluido" | "tienda";
  /// Precio de referencia en la tienda.
  price?: string;
  /// Tres colores para la muestra: fondo, acento y acento vivo.
  swatch: [string, string, string];
  vars: Record<string, string>;
}

function palette(accent: string, bright: string, deep: string, logo: string, surface: string, raised: string, glow: string, glowStrong: string, accentRgb: string, logoRgb: string, onAccent = "#fff"): Record<string, string> {
  return { "--red": accent, "--red-bright": bright, "--red-deep": deep, "--logo": logo, "--surface": surface, "--raised": raised, "--glow": glow, "--glow-strong": glowStrong, "--accent-rgb": accentRgb, "--logo-rgb": logoRgb, "--on-accent": onAccent };
}

export const themes: Theme[] = [
  { id: "red-level", name: "Red Level", about: "El de siempre: negro y rojo.", kind: "incluido", swatch: ["#0c0304", "#9e0000", "#ff2e3a"], vars: {} },
  {
    id: "medianoche",
    name: "Medianoche",
    about: "Azul eléctrico sobre negro.",
    kind: "incluido",
    swatch: ["#03060c", "#1a47b8", "#5c8dff"],
    vars: palette("#2f6bff", "#5c8dff", "#0b2a78", "#1a47b8", "#03060c", "#0a1220", "#00081d", "#001238", "47, 107, 255", "26, 71, 184"),
  },
  {
    id: "esmeralda",
    name: "Esmeralda",
    about: "Verde intenso y fondo profundo.",
    kind: "incluido",
    swatch: ["#030a06", "#0a8a4e", "#3ddc91"],
    vars: palette("#12b76a", "#3ddc91", "#064e2e", "#0a8a4e", "#030a06", "#0a1a11", "#001d0e", "#00361a", "18, 183, 106", "10, 138, 78", "#04140b"),
  },
  {
    id: "neon-violeta",
    name: "Neón violeta",
    about: "Luces de neón moradas.",
    kind: "tienda",
    price: "US$0.99",
    swatch: ["#07030c", "#7e22ce", "#c084fc"],
    vars: palette("#a855f7", "#c084fc", "#4c1d95", "#7e22ce", "#07030c", "#140a20", "#12001d", "#240038", "168, 85, 247", "126, 34, 206"),
  },
  {
    id: "ambar",
    name: "Ámbar",
    about: "Cálido, como una consola clásica.",
    kind: "tienda",
    price: "US$0.99",
    swatch: ["#0c0703", "#b45309", "#fbbf24"],
    vars: palette("#f59e0b", "#fbbf24", "#78350f", "#b45309", "#0c0703", "#1a1108", "#1d1000", "#382000", "245, 158, 11", "180, 83, 9", "#1a1000"),
  },
  {
    id: "hielo",
    name: "Hielo",
    about: "Cian frío y brillante.",
    kind: "tienda",
    price: "US$1.99",
    swatch: ["#03090c", "#0891b2", "#67e8f9"],
    vars: palette("#22d3ee", "#67e8f9", "#155e75", "#0891b2", "#03090c", "#08161a", "#00161d", "#002a38", "34, 211, 238", "8, 145, 178", "#04141a"),
  },
];

/// Colores del tema de serie, para dibujar su miniatura aunque en ese momento haya otro tema puesto.
export const DEFAULT_VARS: Record<string, string> = palette("#dc0f1b", "#ff2e3a", "#6b0000", "#9e0000", "#0c0304", "#1a090b", "#1d0000", "#3a0000", "220, 15, 27", "158, 0, 0");

const names = ["--red", "--red-bright", "--red-deep", "--logo", "--surface", "--raised", "--glow", "--glow-strong", "--accent-rgb", "--logo-rgb", "--on-accent"];

/// Un aspecto cambia las formas y los efectos de la interfaz, sea cual sea el color elegido.
export interface Look {
  id: string;
  name: string;
  about: string;
  kind: "incluido" | "tienda";
  price?: string;
  /// Lo que cambia, en pocas palabras, para la tarjeta de la tienda.
  traits: string[];
}

export const looks: Look[] = [
  { id: "clasico", name: "Clásica", about: "Limpia y de bordes suaves. La de siempre.", kind: "incluido", traits: ["Bordes suaves", "Sin efectos"] },
  {
    id: "glitch",
    name: "Glitch",
    about: "Cortes en ángulo, líneas de barrido e interferencias, como la web de Red Level.",
    kind: "incluido",
    traits: ["Esquinas cortadas", "Títulos con interferencias", "Líneas de barrido"],
  },
  {
    id: "cristal",
    name: "Cristal",
    about: "Paneles translúcidos que dejan ver el arte del juego.",
    kind: "tienda",
    price: "US$4.99",
    traits: ["Paneles de vidrio", "Botones en píldora", "Brillos suaves"],
  },
];

/// Pinta la interfaz con ese tema y, si se indica, con ese aspecto.
/// Un tema desconocido (o el de serie) deja los colores de la marca; un aspecto desconocido, el clásico.
export function applyTheme(id: string, look?: string): void {
  if (look !== undefined) {
    if (look !== "clasico" && looks.some((l) => l.id === look)) document.documentElement.dataset.look = look;
    else delete document.documentElement.dataset.look;
  }
  const theme = themes.find((t) => t.id === id);
  const root = document.documentElement.style;
  for (const name of names) {
    const value = theme?.vars[name];
    if (value) root.setProperty(name, value);
    else root.removeProperty(name);
  }
}

/// Los temas de tienda todavía no se venden: se pueden probar, pero el que queda guardado es uno incluido.
/// Se puede dejar puesto lo que viene incluido y lo que la cuenta ha comprado en la tienda.
export const canKeep = (id: string, owned: string[] = []) => themes.find((t) => t.id === id)?.kind === "incluido" || owned.includes(`theme:${id}`);
export const canKeepLook = (id: string, owned: string[] = []) => looks.find((l) => l.id === id)?.kind === "incluido" || owned.includes(`look:${id}`);
