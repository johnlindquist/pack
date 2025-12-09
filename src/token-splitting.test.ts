import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Packer, type PackResult } from "./packer";
import type { PackerOptions, OutputChunk } from "./types";
import { parseArgs } from "./cli";

// Helper to create test options
function createTestOptions(overrides: Partial<PackerOptions> = {}): PackerOptions {
  return {
    roots: ['.'],
    searchStrings: [],
    excludeStrings: [],
    caseSensitive: false,
    useRegex: false,
    extensions: new Set(['.ts', '.js']),
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
    outputStyle: 'xml',
    outputFile: undefined,
    copyToClipboard: false,
    toStdout: false,
    previewOnly: false,
    interactive: false,
    watch: false,
    promptText: undefined,
    useRipgrep: 'auto',
    noCache: false,
    usePackignore: true,
    explainMode: false,
    verbose: false,
    ...overrides,
  };
}

describe("CLI --max-tokens parsing", () => {
  test("parses --max-tokens flag", () => {
    const args = parseArgs(["--max-tokens", "5000"]);
    expect(args["max-tokens"]).toBe(5000);
  });

  test("parses -M short flag", () => {
    const args = parseArgs(["-M", "10000"]);
    expect(args["max-tokens"]).toBe(10000);
  });

  test("parses max-tokens with other flags", () => {
    const args = parseArgs(["-s", "TODO", "--max-tokens", "8000", "-o", "output.xml"]);
    expect(args["max-tokens"]).toBe(8000);
    expect(args.strings).toBe("TODO");
    expect(args.output).toBe("output.xml");
  });
});

describe("Token splitting logic", () => {
  const testDir = path.join(process.cwd(), "test-token-split-temp");

  beforeAll(async () => {
    // Create test directory and files
    await fs.mkdir(testDir, { recursive: true });

    // Create several test files with known content
    // Each file should be large enough to force chunking but small enough to fit individually
    const fileContent1 = "// File 1\n" + "const a = 1;\n".repeat(200);
    const fileContent2 = "// File 2\n" + "const b = 2;\n".repeat(200);
    const fileContent3 = "// File 3\n" + "const c = 3;\n".repeat(200);

    await fs.writeFile(path.join(testDir, "file1.ts"), fileContent1);
    await fs.writeFile(path.join(testDir, "file2.ts"), fileContent2);
    await fs.writeFile(path.join(testDir, "file3.ts"), fileContent3);
  });

  afterAll(async () => {
    // Cleanup test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test("does not chunk when under maxTokens limit", async () => {
    const options = createTestOptions({
      roots: [testDir],
      maxTokens: 100000, // Very high limit
    });

    const packer = new Packer(options);
    const result = await packer.pack();

    expect(result.chunks).toBeUndefined();
    expect(result.output.length).toBeGreaterThan(0);
  });

  test("chunks output when exceeding maxTokens limit", async () => {
    const options = createTestOptions({
      roots: [testDir],
      maxTokens: 2000, // Higher limit to allow chunking without skipping
    });

    const packer = new Packer(options);
    const result = await packer.pack();

    expect(result.chunks).toBeDefined();
    expect(result.chunks!.length).toBeGreaterThan(1);
  });

  test("each chunk has proper headers", async () => {
    const options = createTestOptions({
      roots: [testDir],
      maxTokens: 2000,
      outputStyle: 'xml',
    });

    const packer = new Packer(options);
    const result = await packer.pack();

    expect(result.chunks).toBeDefined();

    for (const chunk of result.chunks!) {
      // Check for chunk info header
      expect(chunk.output).toContain(`<chunk_info part="${chunk.chunkNumber}" total="${chunk.totalChunks}" />`);
      // Check for file_summary
      expect(chunk.output).toContain("<file_summary>");
      // Check for files section
      expect(chunk.output).toContain("<files>");
      expect(chunk.output).toContain("</files>");
    }
  });

  test("markdown chunks have proper headers", async () => {
    const options = createTestOptions({
      roots: [testDir],
      maxTokens: 2000,
      outputStyle: 'markdown',
    });

    const packer = new Packer(options);
    const result = await packer.pack();

    expect(result.chunks).toBeDefined();

    for (const chunk of result.chunks!) {
      // Check for markdown chunk header
      expect(chunk.output).toContain(`**Part ${chunk.chunkNumber} of ${chunk.totalChunks}**`);
      // Check for Packx header
      expect(chunk.output).toContain("# Packx Output");
    }
  });

  test("chunk numbers are sequential", async () => {
    const options = createTestOptions({
      roots: [testDir],
      maxTokens: 2000,
    });

    const packer = new Packer(options);
    const result = await packer.pack();

    expect(result.chunks).toBeDefined();

    const chunks = result.chunks!;
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkNumber).toBe(i + 1);
      expect(chunks[i].totalChunks).toBe(chunks.length);
    }
  });

  test("all files are distributed across chunks", async () => {
    const options = createTestOptions({
      roots: [testDir],
      maxTokens: 2000,
    });

    const packer = new Packer(options);
    const result = await packer.pack();

    expect(result.chunks).toBeDefined();

    // Collect all file paths from chunks
    const chunkFiles = new Set<string>();
    for (const chunk of result.chunks!) {
      for (const file of chunk.files) {
        chunkFiles.add(file.path);
      }
    }

    // Should have all 3 test files
    expect(chunkFiles.size).toBe(3);
  });

  test("chunks respect token budget", async () => {
    const maxTokens = 1000;
    const options = createTestOptions({
      roots: [testDir],
      maxTokens,
    });

    const packer = new Packer(options);
    const result = await packer.pack();

    if (result.chunks) {
      // Allow some overhead for headers, but chunks should be close to maxTokens
      for (const chunk of result.chunks) {
        // Each chunk should not exceed maxTokens by more than 50% (header overhead)
        expect(chunk.tokens).toBeLessThan(maxTokens * 1.5);
      }
    }
  });

  test("skips oversized files and tracks them", async () => {
    const options = createTestOptions({
      roots: [testDir],
      maxTokens: 500, // Very low limit to force all files to be skipped
    });

    const packer = new Packer(options);
    const result = await packer.pack();

    // All files should be skipped
    expect(result.skippedFiles).toBeDefined();
    expect(result.skippedFiles!.length).toBe(3);

    // Each skipped file should have the correct properties
    for (const skipped of result.skippedFiles!) {
      expect(skipped.reason).toBe('oversized');
      expect(skipped.tokens).toBeGreaterThan(0);
      expect(skipped.path).toBeTruthy();
    }

    // No chunks should be created when all files are skipped
    expect(result.chunks).toBeDefined();
    expect(result.chunks!.length).toBe(0);
  });

  test("tracks both chunked and skipped files separately", async () => {
    // Create a mix: one small file and one large file
    const mixedTestDir = path.join(process.cwd(), "test-mixed-sizes");
    await fs.mkdir(mixedTestDir, { recursive: true });

    const smallFile = "const x = 1;\n"; // Small file
    const largeFile = "const y = 2;\n".repeat(1000); // Large file

    await fs.writeFile(path.join(mixedTestDir, "small.ts"), smallFile);
    await fs.writeFile(path.join(mixedTestDir, "large.ts"), largeFile);

    const options = createTestOptions({
      roots: [mixedTestDir],
      maxTokens: 800, // Limit that allows small but not large
    });

    const packer = new Packer(options);
    const result = await packer.pack();

    // Should have chunks with the small file
    expect(result.chunks).toBeDefined();
    expect(result.chunks!.length).toBeGreaterThan(0);

    // Should have the large file skipped
    expect(result.skippedFiles).toBeDefined();
    expect(result.skippedFiles!.length).toBe(1);
    expect(result.skippedFiles![0].path).toContain("large.ts");

    // Cleanup
    await fs.rm(mixedTestDir, { recursive: true, force: true });
  });
});

describe("OutputChunk type", () => {
  test("chunk has required properties", () => {
    const chunk: OutputChunk = {
      chunkNumber: 1,
      totalChunks: 3,
      output: "<files>...</files>",
      files: [{ path: "test.ts", size: 100, tokens: 25 }],
      tokens: 50,
      chars: 200,
    };

    expect(chunk.chunkNumber).toBe(1);
    expect(chunk.totalChunks).toBe(3);
    expect(chunk.output).toBe("<files>...</files>");
    expect(chunk.files).toHaveLength(1);
    expect(chunk.tokens).toBe(50);
    expect(chunk.chars).toBe(200);
  });
});
