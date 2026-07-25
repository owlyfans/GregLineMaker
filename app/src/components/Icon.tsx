import { useIconStore } from "../state/iconStore";

/** Renders nothing if this id has no resolved icon (most GTCEu material items and all fluids
 * currently don't - see pipeline/extract_icons.mjs) so callers don't need to guard themselves. */
export function Icon({ id, size = 16, className = "" }: { id: string; size?: number; className?: string }) {
  const src = useIconStore((s) => s.icons[id]);
  if (!src) return null;
  return <img src={src} alt="" className={`inline-icon ${className}`} style={{ width: size, height: size }} />;
}
