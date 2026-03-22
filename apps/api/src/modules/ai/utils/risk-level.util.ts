export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Maps a 0-1 risk score to a risk level.
 * Standard thresholds: CRITICAL >= 0.8, HIGH >= 0.6, MEDIUM >= 0.4, LOW < 0.4
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score >= 0.8) return 'CRITICAL';
  if (score >= 0.6) return 'HIGH';
  if (score >= 0.4) return 'MEDIUM';
  return 'LOW';
}

/**
 * Returns true if the risk level is HIGH or CRITICAL.
 */
export function isHighRisk(level: RiskLevel): boolean {
  return level === 'CRITICAL' || level === 'HIGH';
}
