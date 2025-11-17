export const MAX_DECAY_OCCURRENCES = 4;

export function calculateDecayFactor(occurrenceCount: number): number {
  const cappedCount = Math.min(occurrenceCount, MAX_DECAY_OCCURRENCES);
  return Math.pow(0.5, cappedCount);
}

export function calculateDecayedPenalty(baseRiskWeight: number, occurrenceCount: number): number {
  const decayFactor = calculateDecayFactor(occurrenceCount);
  return baseRiskWeight * decayFactor;
}

export function getDecayPercentage(occurrenceCount: number): number {
  return calculateDecayFactor(occurrenceCount) * 100;
}
