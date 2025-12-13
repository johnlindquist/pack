/**
 * Semantic search with local embeddings using transformers.js
 * Provides natural language search over file contents
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";
import { verbose } from "./logger.js";

// Cache directory for embeddings
const EMBEDDINGS_CACHE_DIR = ".packx-cache";
const EMBEDDINGS_FILE = "embeddings.json";
const EMBEDDINGS_VERSION = 1;

// Model configuration
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

export type FileEmbeddingEntry = {
  contentHash: string;
  mtime: number;
  chunks: ChunkEmbedding[];
};

export type ChunkEmbedding = {
  text: string;
  startChar: number;
  endChar: number;
  embedding: number[];
};

export type EmbeddingsCache = {
  version: number;
  modelName: string;
  entries: Record<string, FileEmbeddingEntry>;
};

export type SemanticSearchResult = {
  filePath: string;
  relPath: string;
  score: number;
  matchedChunks: Array<{
    text: string;
    score: number;
    startChar: number;
    endChar: number;
  }>;
};

// Singleton embedding pipeline
let embeddingPipeline: FeatureExtractionPipeline | null = null;
let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

export async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (embeddingPipeline) return embeddingPipeline;
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    verbose("Loading embedding model...", { model: MODEL_NAME });
    const pipe = await pipeline("feature-extraction", MODEL_NAME, { quantized: true });
    embeddingPipeline = pipe;
    verbose("Embedding model loaded", { model: MODEL_NAME });
    return pipe;
  })();

  return pipelinePromise;
}

export async function embedText(text: string): Promise<number[]> {
  const pipe = await getEmbeddingPipeline();
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): Array<{ text: string; startChar: number; endChar: number }> {
  const chunks: Array<{ text: string; startChar: number; endChar: number }> = [];
  if (text.length <= chunkSize) return [{ text, startChar: 0, endChar: text.length }];

  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunkText = text.slice(start, end);
    let actualEnd = end;
    if (end < text.length) {
      const lastSpace = chunkText.lastIndexOf(" ");
      if (lastSpace > chunkSize * 0.5) actualEnd = start + lastSpace;
    }
    chunks.push({ text: text.slice(start, actualEnd).trim(), startChar: start, endChar: actualEnd });
    start = actualEnd - overlap;
    if (start >= text.length - overlap) break;
  }
  return chunks.filter((c) => c.text.length > 0);
}

export function extractFileSummary(content: string, maxChars = 1000): string {
  const summaryParts: string[] = [content.slice(0, Math.min(500, maxChars / 2))];
  const patterns = [
    /(?:function|const|let|var)\s+(\w+)\s*[=(:]/g,
    /(?:class|interface|type|enum)\s+(\w+)/g,
    /def\s+(\w+)\s*\(/g, /class\s+(\w+)/g,
    /fn\s+(\w+)\s*\(/g, /func\s+(\w+)\s*\(/g,
    /pub\s+(?:fn|struct|enum)\s+(\w+)/g,
  ];
  const names = new Set<string>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1] && match[1].length > 2) names.add(match[1]);
    }
  }
  if (names.size > 0) summaryParts.push("\nIdentifiers: " + Array.from(names).slice(0, 20).join(", "));
  return summaryParts.join("").slice(0, maxChars);
}

function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export { EMBEDDINGS_CACHE_DIR, MODEL_NAME, computeHash };
