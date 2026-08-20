/**
 * Trait inheritance probabilities.
 *
 * Unlike stat inheritance, these curves saturate almost immediately: an active
 * ability is guaranteed at Stimulation 32, a passive at 95. That asymmetry is
 * the single most useful thing to tell a player, because it means Stimulation
 * past ~95 buys nothing except stat bias, and stat bias is the expensive part.
 */

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** First active-ability attempt. Can overwrite a collarless ability. */
export function activeAbilityChance(stimulation: number): number {
  return clamp01(0.2 + 0.025 * stimulation);
}

/** Second active-ability attempt. Adds rather than overwrites. */
export function secondActiveAbilityChance(stimulation: number): number {
  return clamp01(0.02 + 0.005 * stimulation);
}

export function passiveAbilityChance(stimulation: number): number {
  return clamp01(0.05 + 0.01 * stimulation);
}

/**
 * When a body slot is inherited, the chance of taking the mutated version over
 * the ordinary one.
 */
export function mutationBias(stimulation: number): number {
  return clamp01(0.5 + (0.5 * stimulation) / (200 + Math.abs(stimulation)));
}

/** Each parent independently gets one roll to pass a disorder along. */
export const DISORDER_CHANCE_PER_PARENT = 0.15;

/**
 * Extra disorder risk from inbreeding, applied when fewer than two disorders
 * were inherited normally. Requires a decoded pedigree, so this is only
 * reachable once inbreeding is known.
 */
export function inbreedingDisorderChance(inbreedingCoefficient: number): number {
  return Math.min(0.34, Math.max(0.02, 0.4 * inbreedingCoefficient - 0.06));
}

/** Birth-defect chance from inbreeding. Guaranteed at 66.6%. */
export function birthDefectChance(inbreedingCoefficient: number): number {
  return clamp01(1.5 * inbreedingCoefficient);
}

/** The Stimulation at which each trait mechanic stops improving. */
export const SATURATION_POINTS = {
  activeAbility: 32,
  secondActiveAbility: 196,
  passiveAbility: 95,
} as const;

/**
 * Probability that the kitten ends up with at least one of the named traits,
 * given how many of the two parents carry it.
 *
 * Each parent's copy is an independent roll at the per-trait chance.
 */
export function traitInheritanceChance(parentsWithTrait: number, perParentChance: number): number {
  if (parentsWithTrait <= 0) return 0;
  return 1 - (1 - perParentChance) ** parentsWithTrait;
}
