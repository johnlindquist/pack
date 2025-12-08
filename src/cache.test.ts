/**
 * Tests for cache module
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { CacheManager, createCacheManager, computeHash } from "./cache";

describe("computeHash", () => {
  test("returns consistent hash for same content", () => {
    const content = "Hello, world!";
    const hash1 = computeHash(content);
    const hash2 = computeHash(content);
    expect(hash1).toBe(hash2);
  });

  test("returns different hash for different content", () => {
    const hash1 = computeHash("Hello");
    const hash2 = computeHash("World");
    expect(hash1).not.toBe(hash2);
  });

  test("works with Buffer input", () => {
    const buffer = Buffer.from("Hello, world!");
    const hash = computeHash(buffer);
    expect(hash).toHaveLength(64); // SHA-256 hex is 64 chars
  });

  test("works with empty content", () => {
    const hash = computeHash("");
    expect(hash).toHaveLength(64);
  });
});

describe("CacheManager", () => {
  let tmpDir: string;
  let cacheManager: CacheManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-cache-test-"));
    cacheManager = createCacheManager(tmpDir, true);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("basic operations", () => {
    test("isEnabled returns true when enabled", () => {
      expect(cacheManager.isEnabled()).toBe(true);
    });

    test("isEnabled returns false when disabled", () => {
      const disabled = createCacheManager(tmpDir, false);
      expect(disabled.isEnabled()).toBe(false);
    });

    test("load creates empty cache when file doesn't exist", async () => {
      await cacheManager.load();
      const stats = cacheManager.getStats();
      expect(stats.entryCount).toBe(0);
      expect(stats.enabled).toBe(true);
    });

    test("save creates cache directory and file", async () => {
      const testFile = path.join(tmpDir, "test.txt");
      await fs.writeFile(testFile, "Hello, world!");

      await cacheManager.load();
      await cacheManager.set(testFile, "Hello, world!", { isBinary: false, tokens: 5 });
      await cacheManager.save();

      const cacheFile = path.join(tmpDir, ".packx_cache", "cache.json");
      const exists = await fs.access(cacheFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("get/set operations", () => {
    test("get returns null for non-existent entry", async () => {
      await cacheManager.load();
      const result = await cacheManager.get("/nonexistent/file.txt");
      expect(result).toBeNull();
    });

    test("set and get work correctly", async () => {
      const testFile = path.join(tmpDir, "test.txt");
      const content = "Hello, world!";
      await fs.writeFile(testFile, content);

      await cacheManager.load();
      await cacheManager.set(testFile, content, { isBinary: false, tokens: 5 });

      const result = await cacheManager.get(testFile);
      expect(result).not.toBeNull();
      expect(result?.isBinary).toBe(false);
      expect(result?.tokens).toBe(5);
    });

    test("get returns null when file is modified", async () => {
      const testFile = path.join(tmpDir, "test.txt");
      await fs.writeFile(testFile, "Original content");

      await cacheManager.load();
      await cacheManager.set(testFile, "Original content", { isBinary: false, tokens: 5 });

      // Modify the file
      await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different mtime
      await fs.writeFile(testFile, "Modified content");

      const result = await cacheManager.get(testFile);
      expect(result).toBeNull();
    });

    test("get returns entry when only mtime changes but content same", async () => {
      const testFile = path.join(tmpDir, "test.txt");
      const content = "Same content";
      await fs.writeFile(testFile, content);

      await cacheManager.load();
      await cacheManager.set(testFile, content, { isBinary: false, tokens: 5 });

      // Touch the file to change mtime without changing content
      await new Promise(resolve => setTimeout(resolve, 10));
      const currentTime = new Date();
      await fs.utimes(testFile, currentTime, currentTime);

      const result = await cacheManager.get(testFile);
      expect(result).not.toBeNull();
      expect(result?.tokens).toBe(5);
    });
  });

  describe("invalidate", () => {
    test("removes entry from cache", async () => {
      const testFile = path.join(tmpDir, "test.txt");
      await fs.writeFile(testFile, "content");

      await cacheManager.load();
      await cacheManager.set(testFile, "content", { isBinary: false, tokens: 5 });

      // Verify entry exists
      let result = await cacheManager.get(testFile);
      expect(result).not.toBeNull();

      // Invalidate
      cacheManager.invalidate(testFile);

      // Verify entry is gone
      result = await cacheManager.get(testFile);
      expect(result).toBeNull();
    });
  });

  describe("clear", () => {
    test("removes all entries", async () => {
      const testFile1 = path.join(tmpDir, "test1.txt");
      const testFile2 = path.join(tmpDir, "test2.txt");
      await fs.writeFile(testFile1, "content1");
      await fs.writeFile(testFile2, "content2");

      await cacheManager.load();
      await cacheManager.set(testFile1, "content1", { isBinary: false, tokens: 5 });
      await cacheManager.set(testFile2, "content2", { isBinary: false, tokens: 10 });

      expect(cacheManager.getStats().entryCount).toBe(2);

      cacheManager.clear();

      expect(cacheManager.getStats().entryCount).toBe(0);
    });
  });

  describe("prune", () => {
    test("removes entries for deleted files", async () => {
      const testFile = path.join(tmpDir, "test.txt");
      await fs.writeFile(testFile, "content");

      await cacheManager.load();
      await cacheManager.set(testFile, "content", { isBinary: false, tokens: 5 });

      // Delete the file
      await fs.unlink(testFile);

      const pruned = await cacheManager.prune();
      expect(pruned).toBe(1);
      expect(cacheManager.getStats().entryCount).toBe(0);
    });

    test("keeps entries for existing files", async () => {
      const testFile = path.join(tmpDir, "test.txt");
      await fs.writeFile(testFile, "content");

      await cacheManager.load();
      await cacheManager.set(testFile, "content", { isBinary: false, tokens: 5 });

      const pruned = await cacheManager.prune();
      expect(pruned).toBe(0);
      expect(cacheManager.getStats().entryCount).toBe(1);
    });
  });

  describe("persistence", () => {
    test("cache survives reload", async () => {
      const testFile = path.join(tmpDir, "test.txt");
      await fs.writeFile(testFile, "persistent content");

      // Create and populate cache
      await cacheManager.load();
      await cacheManager.set(testFile, "persistent content", { isBinary: false, tokens: 10 });
      await cacheManager.save();

      // Create new cache manager and load
      const newManager = createCacheManager(tmpDir, true);
      await newManager.load();

      const result = await newManager.get(testFile);
      expect(result).not.toBeNull();
      expect(result?.tokens).toBe(10);
    });
  });

  describe("disabled cache", () => {
    test("get always returns null when disabled", async () => {
      const disabled = createCacheManager(tmpDir, false);
      const testFile = path.join(tmpDir, "test.txt");
      await fs.writeFile(testFile, "content");

      await disabled.load();
      await disabled.set(testFile, "content", { isBinary: false, tokens: 5 });

      const result = await disabled.get(testFile);
      expect(result).toBeNull();
    });

    test("save does nothing when disabled", async () => {
      const disabled = createCacheManager(tmpDir, false);
      await disabled.load();
      await disabled.save();

      const cacheDir = path.join(tmpDir, ".packx_cache");
      const exists = await fs.access(cacheDir).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });
});
