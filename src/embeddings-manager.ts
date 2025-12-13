/**
 * Embeddings cache manager for semantic search
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { verbose } from "./logger.js";
import {
  type FileEmbeddingEntry,
  type ChunkEmbedding,
  type EmbeddingsCache,
  type SemanticSearchResult,
  getEmbeddingPipeline,
  embedText,
  cosineSimilarity,
  chunkText,
  extractFileSummary,
  EMBEDDINGS_CACHE_DIR,
  MODEL_NAME,
  computeHash,
} from "./embeddings.js";

const EMBEDDINGS_FILE = "embeddings.json";
const EMBEDDINGS_VERSION = 1;

export class EmbeddingsManager {
  private rootDir: string;
  private cacheDir: string;
  private cacheFile: string;
  private cache: EmbeddingsCache;
  private dirty = false;

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = path.resolve(rootDir);
    this.cacheDir = path.join(this.rootDir, EMBEDDINGS_CACHE_DIR);
    this.cacheFile = path.join(this.cacheDir, EMBEDDINGS_FILE);
    this.cache = { version: EMBEDDINGS_VERSION, modelName: MODEL_NAME, entries: {} };
  }

  private toRelativeKey(filePath: string): string {
    const absPath = path.resolve(filePath);
    return path.relative(this.rootDir, absPath).split(path.sep).join("/");
  }

  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.cacheFile, "utf8");
      const parsed = JSON.parse(content) as EmbeddingsCache;
      if (parsed.version === EMBEDDINGS_VERSION && parsed.modelName === MODEL_NAME) {
        this.cache = parsed;
        verbose("Loaded embeddings cache", { entries: Object.keys(this.cache.entries).length });
      } else {
        verbose("Embeddings cache version/model mismatch, starting fresh");
      }
    } catch {
      verbose("No embeddings cache found, starting fresh");
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await fs.writeFile(this.cacheFile, JSON.stringify(this.cache), "utf8");
      this.dirty = false;
      verbose("Saved embeddings cache", { entries: Object.keys(this.cache.entries).length });
    } catch (err) {
      verbose("Failed to save embeddings cache", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  async getCached(filePath: string): Promise<FileEmbeddingEntry | null> {
    const key = this.toRelativeKey(filePath);
    const entry = this.cache.entries[key];
    if (!entry) return null;
    try {
      const stat = await fs.stat(filePath);
      const mtime = Math.floor(stat.mtimeMs);
      if (entry.mtime === mtime) return entry;
      const content = await fs.readFile(filePath, "utf8");
      const hash = computeHash(content);
      if (entry.contentHash === hash) {
        entry.mtime = mtime;
        this.dirty = true;
        return entry;
      }
      return null;
    } catch {
      return null;
    }
  }

  async embedFile(filePath: string, content?: string, onProgress?: (msg: string) => void): Promise<FileEmbeddingEntry> {
    const key = this.toRelativeKey(filePath);
    if (!content) content = await fs.readFile(filePath, "utf8");
    const stat = await fs.stat(filePath);
    const mtime = Math.floor(stat.mtimeMs);
    const contentHash = computeHash(content);
    const summary = extractFileSummary(content);
    const textChunks = chunkText(summary);
    if (onProgress) onProgress(`Embedding ${path.basename(filePath)} (${textChunks.length} chunks)`);

    const chunks: ChunkEmbedding[] = [];
    for (const chunk of textChunks) {
      const embedding = await embedText(chunk.text);
      chunks.push({ text: chunk.text, startChar: chunk.startChar, endChar: chunk.endChar, embedding });
    }
    const entry: FileEmbeddingEntry = { contentHash, mtime, chunks };
    this.cache.entries[key] = entry;
    this.dirty = true;
    return entry;
  }

  async getOrCreateEmbeddings(filePath: string, onProgress?: (msg: string) => void): Promise<FileEmbeddingEntry> {
    const cached = await this.getCached(filePath);
    if (cached) return cached;
    return this.embedFile(filePath, undefined, onProgress);
  }

  async buildIndex(files: string[], onProgress?: (current: number, total: number, file: string) => void): Promise<void> {
    await getEmbeddingPipeline();
    for (let i = 0; i < files.length; i++) {
      if (onProgress) onProgress(i + 1, files.length, files[i]);
      try {
        await this.getOrCreateEmbeddings(files[i]);
      } catch (err) {
        verbose("Failed to embed file", { file: files[i], error: err instanceof Error ? err.message : String(err) });
      }
    }
    await this.save();
  }

  async search(query: string, files: string[], topK = 20, minScore = 0.3): Promise<SemanticSearchResult[]> {
    const queryEmbedding = await embedText(query);
    const results: SemanticSearchResult[] = [];

    for (const file of files) {
      try {
        const entry = await this.getOrCreateEmbeddings(file);
        const chunkScores = entry.chunks.map((chunk) => ({
          text: chunk.text, score: cosineSimilarity(queryEmbedding, chunk.embedding),
          startChar: chunk.startChar, endChar: chunk.endChar,
        }));
        const maxScore = Math.max(...chunkScores.map((c) => c.score));
        if (maxScore >= minScore) {
          const topChunks = chunkScores.filter((c) => c.score >= minScore).sort((a, b) => b.score - a.score).slice(0, 3);
          results.push({ filePath: file, relPath: this.toRelativeKey(file), score: maxScore, matchedChunks: topChunks });
        }
      } catch (err) {
        verbose("Failed to search file", { file, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  getStats(): { entryCount: number; cacheFile: string } {
    return { entryCount: Object.keys(this.cache.entries).length, cacheFile: this.cacheFile };
  }

  clear(): void {
    this.cache.entries = {};
    this.dirty = true;
  }
}

export function createEmbeddingsManager(rootDir?: string): EmbeddingsManager {
  return new EmbeddingsManager(rootDir);
}
