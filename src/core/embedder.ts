import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

// Simple in-memory vector cache to avoid redundant API calls
const vectorCache = new Map<string, number[]>();

function getCacheKey(text: string): string {
  // Simple hash for cache key
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${text.length}_${hash}`;
}

export interface EmbeddingResult {
  vector: number[];
  model: string;
  dimension: number;
}

export class EmbedderService {
  private config = getConfig();
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env[this.config.embedder.apiKeyEnv];
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const cacheKey = getCacheKey(text);

    // Check cache first
    const cached = vectorCache.get(cacheKey);
    if (cached) {
      return {
        vector: cached,
        model: this.config.embedder.model,
        dimension: this.config.embedder.dimension,
      };
    }

    // Use OpenAI API if key available
    if (this.apiKey) {
      return this.embedWithOpenAI(text);
    }

    // Fallback: generate a simple hash-based pseudo-embedding
    // This is NOT a real semantic embedding, just a placeholder
    logger.warn('No OpenAI API key found, using placeholder embedding');
    return this.embedPlaceholder(text);
  }

  private async embedWithOpenAI(text: string): Promise<EmbeddingResult> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.embedder.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    const vector = data.data[0].embedding;

    // Cache the result
    vectorCache.set(getCacheKey(text), vector);

    return {
      vector,
      model: this.config.embedder.model,
      dimension: vector.length,
    };
  }

  private embedPlaceholder(text: string): EmbeddingResult {
    // Generate a deterministic pseudo-embedding based on text
    const dimension = this.config.embedder.dimension;
    const vector = new Array(dimension).fill(0);

    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      vector[i % dimension] += char * 0.01;
    }

    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    for (let i = 0; i < dimension; i++) {
      vector[i] /= magnitude;
    }

    // Cache the result
    vectorCache.set(getCacheKey(text), vector);

    return {
      vector,
      model: 'placeholder',
      dimension,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// Singleton instance
let embedderInstance: EmbedderService | null = null;

export function getEmbedder(): EmbedderService {
  if (!embedderInstance) {
    embedderInstance = new EmbedderService();
  }
  return embedderInstance;
}
