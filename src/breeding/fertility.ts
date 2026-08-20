/**
 * Litter size.
 *
 * Each cat carries a hidden fertility coefficient in [1.0, 1.25], rolled as the
 * lower of two uniform draws — so the mean sits near 1.083, not 1.125. A pair's
 * twin chance is exactly the product minus one, peaking at 56.25%.
 *
 * Fertility is invisible in game, which makes it one of the genuinely new
 * things this tool can tell a player. It must not dominate the ranking though:
 * twins from a mediocre pairing are worth less than one kitten from a great one.
 */

export const FERTILITY_MIN = 1.0;
export const FERTILITY_MAX = 1.25;
export const MAX_TWIN_CHANCE = FERTILITY_MAX * FERTILITY_MAX - 1;
/** Expected fertility given the "lower of two uniform draws" roll. */
export const AVERAGE_FERTILITY = 1 + (FERTILITY_MAX - FERTILITY_MIN) / 3;

export function twinChance(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.min(1, Math.max(0, a * b - 1));
}

export function describeFertility(value: number | null): string {
  if (value === null) return 'unknown';
  if (value >= 1.2) return 'excellent';
  if (value >= 1.15) return 'good';
  if (value >= AVERAGE_FERTILITY) return 'above average';
  if (value >= 1.04) return 'below average';
  return 'poor';
}
