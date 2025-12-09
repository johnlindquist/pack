import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { startWatcher } from "./watcher";
import type { PackerOptions } from "./types.js";
import type { PackResult } from "./packer.js";

// Helper to create default packer options for testing
function createTestOptions(overrides: Partial<PackerOptions> = {}): PackerOptions {
  return {
    roots: ["."],
    searchStrings: [],
    excludeStrings: [],
    caseSensitive: false,
    useRegex: false,
    extensions: new Set([".ts", ".js"]),
    excludePatterns: [],
    includePatterns: [],
    explicitFiles: [],
    gitMode: null,
    stripComments: false,
    minify: false,
    contextLines: undefined,
    smartContext: false,
    includeRelated: false,
    followImports: false,
    transforms: [],
    outputStyle: "xml",
    outputFile: undefined,
    copyToClipboard: false,
    toStdout: false,
    previewOnly: false,
    interactive: false,
    watch: true,
    promptText: undefined,
    useRipgrep: 'auto',
    noCache: false,
    usePackignore: true,
    explainMode: false,
    verbose: false,
    ...overrides,
  };
}

describe("watcher module", () => {
  let testDir: string;
  let cleanup: (() => Promise<void>) | null = null;

  beforeEach(async () => {
    // Create a temporary test directory (without leading dot to avoid being ignored)
    testDir = path.join(process.cwd(), "tmp-test-watch-" + Date.now());
    await fs.mkdir(testDir, { recursive: true });

    // Create a test file
    await fs.writeFile(
      path.join(testDir, "test.ts"),
      'const hello = "world";\n'
    );
  });

  afterEach(async () => {
    // Clean up watcher
    if (cleanup) {
      await cleanup();
      cleanup = null;
    }

    // Remove test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test("startWatcher returns cleanup function", async () => {
    const packResults: PackResult[] = [];
    const logs: string[] = [];

    const options = createTestOptions({
      roots: [testDir],
    });

    cleanup = await startWatcher(options, {
      onPack: async (result) => {
        packResults.push(result);
      },
      log: (msg) => {
        logs.push(msg);
      },
    });

    expect(typeof cleanup).toBe("function");

    // Give it a moment to run initial pack
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should have received at least one pack result from initial run
    expect(packResults.length).toBeGreaterThanOrEqual(1);
  });

  test("watcher detects file changes", async () => {
    const packResults: PackResult[] = [];
    const logs: string[] = [];

    const options = createTestOptions({
      roots: [testDir],
    });

    cleanup = await startWatcher(options, {
      onPack: async (result) => {
        packResults.push(result);
      },
      log: (msg) => {
        logs.push(msg);
      },
    });

    // Wait for initial pack and watcher to be ready
    await new Promise((resolve) => setTimeout(resolve, 500));

    const initialPackCount = packResults.length;

    // Modify the test file
    await fs.writeFile(
      path.join(testDir, "test.ts"),
      'const hello = "updated world";\n'
    );

    // Wait for watcher to detect change and repack (longer timeout for file system events)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Should have received another pack result
    expect(packResults.length).toBeGreaterThan(initialPackCount);
  }, 10000);

  test("watcher detects new files", async () => {
    const packResults: PackResult[] = [];
    const logs: string[] = [];

    const options = createTestOptions({
      roots: [testDir],
    });

    cleanup = await startWatcher(options, {
      onPack: async (result) => {
        packResults.push(result);
      },
      log: (msg) => {
        logs.push(msg);
      },
    });

    // Wait for initial pack and watcher to be ready
    await new Promise((resolve) => setTimeout(resolve, 500));

    const initialPackCount = packResults.length;

    // Add a new file
    await fs.writeFile(
      path.join(testDir, "new-file.ts"),
      'export const newFile = true;\n'
    );

    // Wait for watcher to detect change and repack (longer timeout for file system events)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Should have received another pack result
    expect(packResults.length).toBeGreaterThan(initialPackCount);
  }, 10000);

  test("cleanup function stops the watcher", async () => {
    const logs: string[] = [];

    const options = createTestOptions({
      roots: [testDir],
    });

    cleanup = await startWatcher(options, {
      onPack: async () => {},
      log: (msg) => {
        logs.push(msg);
      },
    });

    // Call cleanup
    await cleanup();
    cleanup = null;

    // Should have logged stopping message
    const hasStoppingMessage = logs.some((log) => log.includes("Stopping"));
    expect(hasStoppingMessage).toBe(true);
  });
});
