import { LOGO_VIEWBOX, PILL, RING_PATH, RING_WIDTH, SKULL_PATH } from "./logoPaths";

/// Logo de Red Level: el aro abierto con la calavera.
export function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox={LOGO_VIEWBOX} fill="none" aria-hidden="true">
      <path d={RING_PATH} stroke="var(--logo)" strokeWidth={RING_WIDTH} strokeLinecap="round" />
      <rect {...PILL} fill="var(--logo)" />
      <path d={SKULL_PATH} fill="#fff" fillRule="evenodd" />
    </svg>
  );
}
