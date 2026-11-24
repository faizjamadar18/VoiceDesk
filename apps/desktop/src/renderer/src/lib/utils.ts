import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges Tailwind CSS class names with clsx conditional logic and twMerge conflict resolution.
 *
 * @param inputs - Class names, expressions, or objects to conditionally combine.
 * @returns Deduplicated and merged Tailwind class string.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

