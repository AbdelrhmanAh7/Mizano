import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiFeedbackService } from './ai-feedback.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { findBestMatch } from '../utils/text-similarity.util';
import { BoundedCache } from '../utils/bounded-cache.util';
import { buildKnowledgeAssistantPrompt } from '../prompts/nlp.prompts';
import { PredictionMethod } from '../types/prediction-method.type';
import { describeError } from '../../../common/utils/redact';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const natural = require('natural');

/**
 * A single search result returned by the knowledge assistant.
 */
export interface KnowledgeSearchResult {
  id: string;
  title: string;
  description: string;
  relevanceScore: number;
  source: string;
  createdAt: Date;
}

export interface KnowledgeSearchResponse {
  results: KnowledgeSearchResult[];
  totalResults: number;
  predictionMethod?: PredictionMethod;
}

export interface IndexResult {
  indexed: number;
  totalDocuments: number;
}

export interface KnowledgeSuggestion {
  id: string;
  title: string;
  description: string;
  type: string;
  relevanceScore: number;
  createdAt: Date;
}

/**
 * Internal representation of a document stored in the TF-IDF index.
 */
interface IndexedDocument {
  id: string;
  title: string;
  text: string;
  source: string;
  createdAt: Date;
}

@Injectable()
export class KnowledgeAssistantService {
  private readonly logger = new Logger(KnowledgeAssistantService.name);

  /** Per-org TF-IDF instance (bounded: max 50, 2h TTL). */
  private tfidfInstances = new BoundedCache<unknown>(50, 2 * 60 * 60 * 1000);

  /** Per-org list of indexed documents (bounded: max 50, 2h TTL). */
  private documentMaps = new BoundedCache<IndexedDocument[]>(50, 2 * 60 * 60 * 1000);

  constructor(
    private prisma: PrismaService,
    private feedbackService: AiFeedbackService,
    private gateway: OllamaInferenceGateway,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Search the knowledge base for documents relevant to `query`.
   * Combines TF-IDF scoring with string-similarity ranking for robustness.
   */
  async search(
    organizationId: string,
    query: string,
    limit: number = 10,
  ): Promise<KnowledgeSearchResponse> {
    this.logger.log(`Searching knowledge base in org ${organizationId}: queryLen=${query.length}`);

    // --- Ollama-first inference path ---
    {
      try {
        // Build context from indexed documents
        await this.ensureIndex(organizationId);
        const documents = this.documentMaps.get(organizationId) ?? [];
        const contextText = documents
          .slice(0, 20)
          .map((d) => `[${d.title}]: ${d.text.slice(0, 300)}`)
          .join('\n');

        if (contextText.length > 0) {
          const prompt = buildKnowledgeAssistantPrompt(query, contextText);
          const ollamaResult = await this.gateway.infer<{
            answer: string;
            sources: string[];
            confidence: number;
          }>(prompt);

          if (ollamaResult) {
            const d = ollamaResult.data;
            const confidence = d.confidence ?? 0.8;

            // Map sources back to documents for structured results
            const results: KnowledgeSearchResult[] = (d.sources || [])
              .slice(0, limit)
              .map((source, idx) => {
                const matchedDoc = documents.find((doc) =>
                  source.toLowerCase().includes(doc.title.toLowerCase()),
                );
                return {
                  id: matchedDoc?.id ?? `ollama-${idx}`,
                  title: matchedDoc?.title ?? source,
                  description: matchedDoc ? matchedDoc.text.slice(0, 300) : d.answer.slice(0, 300),
                  relevanceScore: Math.max(confidence - idx * 0.1, 0.1),
                  source: matchedDoc?.source ?? 'ollama',
                  createdAt: matchedDoc?.createdAt ?? new Date(),
                };
              });

            // If no source matching, return the answer as a single result
            if (results.length === 0 && d.answer) {
              results.push({
                id: 'ollama-answer',
                title: 'AI Answer',
                description: d.answer.slice(0, 300),
                relevanceScore: confidence,
                source: 'ollama',
                createdAt: new Date(),
              });
            }
            return {
              results,
              totalResults: results.length,
              predictionMethod: 'OLLAMA',
            };
          }
        }
      } catch (error) {
        this.logger.warn(
          `Ollama knowledge search failed, falling back to TF-IDF: ${describeError(error)}`,
        );
      }
    }

    // --- Existing TF-IDF fallback ---

    // Ensure the index is loaded
    await this.ensureIndex(organizationId);

    const tfidf = this.tfidfInstances.get(organizationId);
    const documents = this.documentMaps.get(organizationId) ?? [];

    if (!tfidf || documents.length === 0) {
      return { results: [], totalResults: 0 };
    }

    // Score every document with TF-IDF
    const tfidfScores: number[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tfidf as any).tfidfs(query, (_i: number, measure: number) => {
      tfidfScores.push(measure);
    });

    // Secondary ranking via findBestMatch (string similarity)
    const titles = documents.map((d) => `${d.title} ${d.text}`);
    const bestMatchResult = findBestMatch(query, titles, 0);

    // Merge scores: TF-IDF is the primary signal; string similarity is additive
    const scored = documents.map((doc, idx) => {
      // Normalise TF-IDF score to 0-1 range
      const maxTfidf = Math.max(...tfidfScores, 1);
      const tfidfNorm = maxTfidf > 0 ? (tfidfScores[idx] ?? 0) / maxTfidf : 0;

      // String similarity bonus (0-0.3 range)
      let similarityBonus = 0;
      if (bestMatchResult.index === idx) {
        similarityBonus = bestMatchResult.similarity * 0.3;
      } else {
        // Calculate individual similarity for secondary matches
        const individualMatch = findBestMatch(query, [`${doc.title} ${doc.text}`], 0);
        similarityBonus = individualMatch.similarity * 0.2;
      }

      const combinedScore = Math.min(tfidfNorm * 0.7 + similarityBonus, 1);

      return {
        id: doc.id,
        title: doc.title,
        description: doc.text.slice(0, 300),
        relevanceScore: Math.round(combinedScore * 1000) / 1000,
        source: doc.source,
        createdAt: doc.createdAt,
      };
    });

    // Sort by relevance descending, filter out zero-score results
    const sorted = scored
      .filter((s) => s.relevanceScore > 0.01)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);

    const searchResponse: KnowledgeSearchResponse = {
      results: sorted,
      totalResults: sorted.length,
      predictionMethod: 'ML' as const,
    };

    // Store prediction for feedback tracking
    if (sorted.length > 0) {
      try {
        await this.feedbackService.storePrediction(
          organizationId,
          'KNOWLEDGE_ASSISTANT',
          { query },
          { resultIds: sorted.map((r) => r.id), topScore: sorted[0].relevanceScore },
          sorted[0].relevanceScore,
          1,
        );
      } catch (error) {
        this.logger.warn(`Failed to store search prediction: ${describeError(error)}`);
      }
    }

    return searchResponse;
  }

  /**
   * Build (or rebuild) the TF-IDF index for an organization from AIInsight records.
   */
  async indexDocuments(organizationId: string): Promise<IndexResult> {
    this.logger.log(`Indexing documents for org ${organizationId}`);

    const insights = await this.prisma.aIInsight.findMany({
      where: { organizationId },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (insights.length === 0) {
      this.logger.log(`No AIInsight records found for org ${organizationId}`);
      return { indexed: 0, totalDocuments: 0 };
    }

    // Build the TF-IDF instance
    const tfidf = new natural.TfIdf();
    const documents: IndexedDocument[] = [];

    for (const insight of insights) {
      const text = `${insight.title} ${insight.description}`;
      tfidf.addDocument(text);
      documents.push({
        id: insight.id,
        title: insight.title,
        text: insight.description,
        source: insight.type,
        createdAt: insight.createdAt,
      });
    }

    // Cache in memory
    this.tfidfInstances.set(organizationId, tfidf);
    this.documentMaps.set(organizationId, documents);

    // Model registry removed — index is kept in memory only

    this.logger.log(`Indexed ${documents.length} documents for org ${organizationId}`);

    return { indexed: documents.length, totalDocuments: insights.length };
  }

  /**
   * Return relevant suggestions based on optional context.
   * Without context, returns the most recent high-value AIInsights.
   * With context, ranks them by TF-IDF relevance.
   */
  async getSuggestions(
    organizationId: string,
    context?: string,
    limit: number = 5,
  ): Promise<KnowledgeSuggestion[]> {
    if (context) {
      // Use search to get context-relevant suggestions
      const searchResults = await this.search(organizationId, context, limit);
      return searchResults.results.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        type: r.source,
        relevanceScore: r.relevanceScore,
        createdAt: r.createdAt,
      }));
    }

    // No context: return recent high-priority insights
    const insights = await this.prisma.aIInsight.findMany({
      where: {
        organizationId,
        isRead: false,
      },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        severity: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });

    return insights.map((insight, idx) => ({
      id: insight.id,
      title: insight.title,
      description: insight.description.slice(0, 300),
      type: insight.type,
      // Assign descending relevance to recent insights
      relevanceScore: Math.round((1 - idx * 0.1) * 1000) / 1000,
      createdAt: insight.createdAt,
    }));
  }

  /**
   * Fully rebuild the search index for an organization.
   * Clears the existing in-memory index and re-indexes from the database.
   */
  async rebuildIndex(organizationId: string): Promise<IndexResult> {
    this.logger.log(`Rebuilding knowledge index for org ${organizationId}`);

    // Clear existing in-memory state
    this.tfidfInstances.delete(organizationId);
    this.documentMaps.delete(organizationId);

    return this.indexDocuments(organizationId);
  }

  /**
   * Record user feedback on a knowledge search result.
   * Stores whether the result was helpful; if not, it is treated as a
   * correction and may trigger index retraining when the threshold is reached.
   */
  async recordSearchFeedback(
    _organizationId: string,
    _query: string,
    _resultId: string,
    _wasHelpful: boolean,
  ): Promise<void> {
    // Feedback is recorded via AiFeedbackService.processFeedback
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Ensure the TF-IDF index is available for the organization.
   * First checks in-memory cache, then attempts to restore from the model
   * registry, and finally falls back to a fresh index build.
   */
  private async ensureIndex(organizationId: string): Promise<void> {
    // Already in memory
    if (this.tfidfInstances.has(organizationId)) {
      return;
    }

    // Model registry removed — build fresh index
    await this.indexDocuments(organizationId);
  }
}
