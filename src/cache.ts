/**
 * Caching module for packx
 * Stores file hashes and processing results to speed up iterative runs
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

// Cache directory name
const CACHE_DIR = ".packx_cache";
const CACHE_FILE = "cache.json";
const CACHE_VERSION = 2;

/**
 * Cached data for a single file
 */
export type FileCacheEntry = {
  // File identification
  mtime: number;          // Modification time (ms since epoch)
  size: number;           // File size in bytes
  contentHash: string;    // SHA-256 hash of file content

  // Cached results
  isBinary: boolean;
  tokens: number;         // Token count (0 if binary)
};

/**
 * Complete cache structure
 */
export type CacheData = {
  version: number;
  entries: Record<string, FileCacheEntry>;  // Key is relative POSIX file path
};

/**
 * Cache manager class
 */
export class CacheManager {
  private rootDir: string;
  private cacheDir: string;
  private cacheFile: string;
  private data: CacheData;
  private dirty: boolean = false;
  private enabled: boolean = true;

  constructor(rootDir: string = process.cwd(), enabled: boolean = true) {
    this.rootDir = path.resolve(rootDir);
    this.cacheDir = path.join(this.rootDir, CACHE_DIR);
    this.cacheFile = path.join(this.cacheDir, CACHE_FILE);
    this.enabled = enabled;
    this.data = { version: CACHE_VERSION, entries: {} };
  }

  /**
   * Convert absolute file path to relative POSIX path for cache key
   */
  private toRelativeKey(filePath: string): string {
    const absPath = path.resolve(filePath);
    const relPath = path.relative(this.rootDir, absPath);
    // Convert to POSIX format for cross-platform compatibility
    return relPath.split(path.sep).join("/");
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Load cache from disk
   */
  async load(): Promise<void> {
    if (!this.enabled) return;

    try {
      const content = await fs.readFile(this.cacheFile, "utf8");
      const parsed = JSON.parse(content) as CacheData;

      // Check version compatibility
      if (parsed.version === CACHE_VERSION) {
        this.data = parsed;
      } else {
        // Version mismatch - start fresh
        this.data = { version: CACHE_VERSION, entries: {} };
      }
    } catch {
      // File doesn't exist or invalid - start fresh
      this.data = { version: CACHE_VERSION, entries: {} };
    }
  }

  /**
   * Save cache to disk (only if dirty)
   */
  async save(): Promise<void> {
    if (!this.enabled || !this.dirty) return;

    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await fs.writeFile(this.cacheFile, JSON.stringify(this.data, null, 2), "utf8");
      this.dirty = false;
    } catch (err) {
      // Cache save failure is non-fatal - just log and continue
      console.error("Warning: Failed to save cache:", err);
    }
  }

  /**
   * Get cached entry for a file (returns null if not cached or stale)
   */
  async get(filePath: string): Promise<FileCacheEntry | null> {
    if (!this.enabled) return null;

    const relKey = this.toRelativeKey(filePath);
    const absPath = path.resolve(filePath);
    const entry = this.data.entries[relKey];

    if (!entry) return null;

    try {
      const stat = await fs.stat(absPath);
      const mtime = Math.floor(stat.mtimeMs);
      const size = stat.size;

      // Fast check: if mtime and size match, entry is likely valid
      if (entry.mtime === mtime && entry.size === size) {
        return entry;
      }

      // Size changed - definitely stale
      if (entry.size !== size) {
        return null;
      }

      // mtime changed but size same - verify with hash
      const content = await fs.readFile(absPath);
      const hash = computeHash(content);

      if (entry.contentHash === hash) {
        // Content unchanged despite mtime change - update mtime and return
        entry.mtime = mtime;
        this.dirty = true;
        return entry;
      }

      // Content actually changed
      return null;
    } catch {
      // File doesn't exist or can't be read
      return null;
    }
  }

  /**
   * Set cached entry for a file
   */
  async set(
    filePath: string,
    content: Buffer | string,
    results: { isBinary: boolean; tokens: number }
  ): Promise<void> {
    if (!this.enabled) return;

    const relKey = this.toRelativeKey(filePath);
    const absPath = path.resolve(filePath);

    try {
      const stat = await fs.stat(absPath);
      const contentBuffer = typeof content === "string" ? Buffer.from(content) : content;

      this.data.entries[relKey] = {
        mtime: Math.floor(stat.mtimeMs),
        size: stat.size,
        contentHash: computeHash(contentBuffer),
        isBinary: results.isBinary,
        tokens: results.tokens,
      };

      this.dirty = true;
    } catch {
      // File doesn't exist - don't cache
    }
  }

  /**
   * Invalidate a specific file's cache entry
   */
  invalidate(filePath: string): void {
    const relKey = this.toRelativeKey(filePath);
    if (this.data.entries[relKey]) {
      delete this.data.entries[relKey];
      this.dirty = true;
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.data.entries = {};
    this.dirty = true;
  }

  /**
   * Get cache statistics
   */
  getStats(): { entryCount: number; enabled: boolean } {
    return {
      entryCount: Object.keys(this.data.entries).length,
      enabled: this.enabled,
    };
  }

  /**
   * Prune stale entries (files that no longer exist)
   */
  async prune(): Promise<number> {
    if (!this.enabled) return 0;

    const entries = Object.keys(this.data.entries);
    let pruned = 0;

    for (const relKey of entries) {
      // Convert relative key back to absolute path for file access check
      const absPath = path.join(this.rootDir, relKey);
      try {
        await fs.access(absPath);
      } catch {
        delete this.data.entries[relKey];
        pruned++;
      }
    }

    if (pruned > 0) {
      this.dirty = true;
    }

    return pruned;
  }
}

/**
 * Compute SHA-256 hash of content
 */
export function computeHash(content: Buffer | string): string {
  const hash = crypto.createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}

/**
 * Create a cache manager for the given directory
 */
export function createCacheManager(rootDir?: string, enabled: boolean = true): CacheManager {
  return new CacheManager(rootDir, enabled);
}
