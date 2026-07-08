import { consola } from 'consola'
import pc from 'picocolors'

export const logger = consola.withTag('nestkit')

export const c = pc

/** Format a duration in ms as a short human string. */
export function ms(duration: number): string {
  return duration < 1000 ? `${Math.round(duration)}ms` : `${(duration / 1000).toFixed(2)}s`
}
