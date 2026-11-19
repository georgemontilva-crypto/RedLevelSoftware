import { useEffect, useMemo, useState } from "react";
import { fileSrc, type Game } from "../lib/api";
import { hash } from "../lib/format";

// Tonos oscuros para los juegos sin carátula: cada juego conserva siempre el mismo.
const palettes = [
  ["#6b1428", "#1c080e"],
  ["#274566", "#0b131d"],
  ["#46306e", "#120c1d"],
  ["#17534b", "#081813"],
  ["#664514", "#1a1106"],
  ["#3d4653", "#0e1116"],
];

export function paletteOf(game: Game): string[] {
  return palettes[hash(game.id + game.title) % palettes.length];
}

function useFallbackChain(candidates: string[], resetKey: string) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [resetKey]);
  return { src: candidates[index] as string | undefined, next: () => setIndex((i) => i + 1) };
}

/// Carátula vertical: la del disco, si no la de internet, y si no una hecha con el nombre.
export function Cover({ game }: { game: Game }) {
  const candidates = useMemo(() => [...(game.coverFile ? [fileSrc(game.coverFile)] : []), ...game.coverUrls], [game.coverFile, game.coverUrls]);
  const { src, next } = useFallbackChain(candidates, `${game.id}|${game.coverFile}`);
  if (src) return <img className="cover-img" src={src} onError={next} alt="" loading="lazy" draggable={false} />;
  const [from, to] = paletteOf(game);
  return (
    <div className="cover-blank" style={{ background: `linear-gradient(160deg, ${from}, ${to} 78%)` }}>
      <span className="cover-blank-letter" aria-hidden="true">
        {game.title.trim()[0]?.toUpperCase()}
      </span>
      <span className="cover-blank-title">{game.title}</span>
    </div>
  );
}

/// Fondo de pantalla del juego enfocado.
export function Backdrop({ game }: { game: Game }) {
  const candidates = useMemo(
    () => [...(game.heroFile ? [fileSrc(game.heroFile)] : []), ...game.heroUrls, ...(game.coverFile ? [fileSrc(game.coverFile)] : []), ...game.coverUrls],
    [game.heroFile, game.heroUrls, game.coverFile, game.coverUrls],
  );
  const { src, next } = useFallbackChain(candidates, `${game.id}|${game.heroFile}|${game.coverFile}`);
  const [from, to] = paletteOf(game);
  return (
    <div className="backdrop-art" style={{ background: `radial-gradient(120% 90% at 78% 18%, ${from}, ${to} 62%, var(--bg))` }}>
      {src && <img src={src} onError={next} alt="" draggable={false} />}
    </div>
  );
}
