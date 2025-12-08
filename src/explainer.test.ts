import { describe, test, expect } from "bun:test";
import { runExplainMode } from "./explainer";
import type { PackerOptions } from "./types";

describe("explainer", () => {
  function createOptions(overrides: Partial<PackerOptions> = {}): PackerOptions {
    return {
      roots: ["."],
      searchStrings: [],
      excludeStrings: [],
      caseSensitive: false,
      useRegex: false,
      extensions: new Set([".ts"]),
      excludePatterns: [],
      includePatterns: [],
      explicitFiles: [],
      gitMode: null,
      stripComments: false,
      minify: false,
      contextLines: undefined,
      smartContext: false,
      includeRelated: false,
      outputStyle: "xml",
      outputFile: undefined,
      copyToClipboard: false,
      toStdout: false,
      previewOnly: false,
      interactive: false,
      promptText: undefined,
      explainMode: true,
      ...overrides,
    };
  }

  function captureOutput(): { lines: string[]; logger: (msg: string) => void } {
    const lines: string[] = [];
    return { lines, logger: (msg: string) => lines.push(msg) };
  }

  test("runExplainMode outputs section headers", async () => {
    const { lines, logger } = captureOutput();
    await runExplainMode(createOptions(), logger);

    const text = lines.join("\n");
    expect(text).toContain("EXPLAIN MODE");
    expect(text).toContain("CONFIGURATION");
    expect(text).toContain("FILE DISCOVERY");
    expect(text).toContain("CONTENT FILTERING");
    expect(text).toContain("SUMMARY");
  });

  test("runExplainMode shows search patterns when provided", async () => {
    const { lines, logger } = captureOutput();
    await runExplainMode(createOptions({ searchStrings: ["TODO", "FIXME"] }), logger);

    const text = lines.join("\n");
    expect(text).toContain("TODO");
    expect(text).toContain("FIXME");
  });

  test("runExplainMode shows processing options", async () => {
    const { lines, logger } = captureOutput();
    await runExplainMode(createOptions({
      stripComments: true,
      minify: true,
      contextLines: 5,
    }), logger);

    const text = lines.join("\n");
    expect(text).toContain("strip-comments");
    expect(text).toContain("minify");
    expect(text).toContain("5 lines");
  });

  test("runExplainMode shows git mode", async () => {
    const { lines, logger } = captureOutput();
    await runExplainMode(createOptions({ gitMode: "staged" }), logger);

    const text = lines.join("\n");
    expect(text).toContain("staged");
  });

  test("runExplainMode shows output file when set", async () => {
    const { lines, logger } = captureOutput();
    await runExplainMode(createOptions({ outputFile: "my-output.xml" }), logger);

    const text = lines.join("\n");
    expect(text).toContain("my-output.xml");
  });

  test("runExplainMode shows dry run notice", async () => {
    const { lines, logger } = captureOutput();
    await runExplainMode(createOptions(), logger);

    const text = lines.join("\n");
    expect(text).toContain("Dry run");
  });

  test("runExplainMode shows hint to run without explain", async () => {
    const { lines, logger } = captureOutput();
    await runExplainMode(createOptions(), logger);

    const text = lines.join("\n");
    expect(text).toContain("without --explain");
  });

  test("runExplainMode shows default exclusion patterns", async () => {
    const { lines, logger } = captureOutput();
    await runExplainMode(createOptions(), logger);

    const text = lines.join("\n");
    expect(text).toContain("node_modules");
  });

  test("runExplainMode shows file discovery count", async () => {
    const { lines, logger } = captureOutput();
    await runExplainMode(createOptions(), logger);

    const text = lines.join("\n");
    expect(text).toMatch(/Found.*\d+.*candidate/i);
  });

  test("runExplainMode shows filtering results", async () => {
    const { lines, logger } = captureOutput();
    await runExplainMode(createOptions(), logger);

    const text = lines.join("\n");
    expect(text).toMatch(/\d+.*file.*passed/i);
  });
});
