import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Standard shadcn/ui utility — merges Tailwind classes, later ones
 * winning over conflicting earlier ones. `components.json` already
 * declares the `@/lib` alias this file fills. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
