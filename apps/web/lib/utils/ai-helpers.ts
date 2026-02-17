/**
 * Shared AI utility functions used across multiple AI hooks.
 * Extracted to avoid star export conflicts.
 */

/**
 * Get color class based on risk level
 */
export function getRiskLevelColor(riskLevel: 'low' | 'medium' | 'high' | string): string {
  const level = typeof riskLevel === 'string' ? riskLevel.toLowerCase() : riskLevel;
  switch (level) {
    case 'low':
      return 'text-green-600';
    case 'medium':
      return 'text-yellow-600';
    case 'high':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}

/**
 * Get human-readable label for risk level
 */
export function getRiskLevelLabel(riskLevel: 'low' | 'medium' | 'high' | string): string {
  const level = typeof riskLevel === 'string' ? riskLevel.toLowerCase() : riskLevel;
  switch (level) {
    case 'low':
      return 'Low Risk';
    case 'medium':
      return 'Medium Risk';
    case 'high':
      return 'High Risk';
    default:
      return 'Unknown';
  }
}

/**
 * Get color class based on confidence score (0-1)
 */
export function getConfidenceColor(confidence: number | null): string {
  if (confidence === null || confidence === undefined) return 'text-muted-foreground';
  if (confidence >= 0.8) return 'text-green-600';
  if (confidence >= 0.6) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Format confidence score as percentage
 */
export function formatConfidence(confidence: number | null): string {
  if (confidence === null || confidence === undefined) return 'N/A';
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Get badge variant based on confidence score
 */
export function getConfidenceBadgeVariant(
  confidence: number,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (confidence >= 0.8) return 'default';
  if (confidence >= 0.6) return 'secondary';
  return 'destructive';
}

/**
 * Get badge variant based on risk level
 */
export function getRiskBadgeVariant(
  riskLevel: 'low' | 'medium' | 'high' | string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const level = typeof riskLevel === 'string' ? riskLevel.toLowerCase() : riskLevel;
  switch (level) {
    case 'low':
      return 'default';
    case 'medium':
      return 'secondary';
    case 'high':
      return 'destructive';
    default:
      return 'outline';
  }
}
