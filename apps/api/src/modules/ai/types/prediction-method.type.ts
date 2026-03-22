/**
 * How a prediction was generated.
 *
 * - OLLAMA:     Ollama LLM inference
 * - ML:         Custom trained model (RandomForest, LogReg, Bayes, etc.)
 * - RULE_BASED: Deterministic rules / heuristics
 * - HYBRID:     Blended result from multiple methods
 */
export type PredictionMethod = 'OLLAMA' | 'ML' | 'RULE_BASED' | 'HYBRID';
