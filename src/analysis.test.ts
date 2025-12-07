/**
 * Tests for analysis module: token counting and binary detection
 */

import { describe, test, expect } from "bun:test";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  countTokens,
  countTokensHeuristic,
  isBinaryFile,
  isBinaryContent,
  formatTokenCount,
  getTokenWarning
} from "./analysis";

describe("countTokens", () => {
  test("counts tokens in simple text", () => {
    const text = "Hello, world!";
    const tokens = countTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10);
  });

  test("counts tokens in code", () => {
    const code = `function hello() {
  console.log("Hello, world!");
}`;
    const tokens = countTokens(code);
    expect(tokens).toBeGreaterThan(10);
    expect(tokens).toBeLessThan(30);
  });

  test("returns 0 for empty string", () => {
    expect(countTokens("")).toBe(0);
  });

  test("handles unicode text", () => {
    const text = "Hello, 世界! 🌍";
    const tokens = countTokens(text);
    expect(tokens).toBeGreaterThan(0);
  });
});

describe("countTokensHeuristic", () => {
  test("returns approximately 1/4 of character count", () => {
    const text = "Hello, world!"; // 13 chars
    const tokens = countTokensHeuristic(text);
    expect(tokens).toBe(Math.round(13 / 4));
  });

  test("works for longer text", () => {
    const text = "a".repeat(1000);
    const tokens = countTokensHeuristic(text);
    expect(tokens).toBe(250);
  });
});

describe("isBinaryFile", () => {
  let tmpDir: string;

  test("detects text file as non-binary", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-binary-test-"));
    const textFile = path.join(tmpDir, "text.txt");
    await fs.writeFile(textFile, "Hello, world!\nThis is a text file.");

    const result = await isBinaryFile(textFile);
    expect(result).toBe(false);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("detects file with null bytes as binary", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-binary-test-"));
    const binaryFile = path.join(tmpDir, "binary.dat");
    await fs.writeFile(binaryFile, Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x57, 0x6f, 0x72, 0x6c, 0x64]));

    const result = await isBinaryFile(binaryFile);
    expect(result).toBe(true);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("returns false for empty file", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-binary-test-"));
    const emptyFile = path.join(tmpDir, "empty.txt");
    await fs.writeFile(emptyFile, "");

    const result = await isBinaryFile(emptyFile);
    expect(result).toBe(false);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("returns false for non-existent file", async () => {
    const result = await isBinaryFile("/nonexistent/path/file.txt");
    expect(result).toBe(false);
  });
});

describe("isBinaryContent", () => {
  test("detects text content as non-binary", () => {
    const result = isBinaryContent("Hello, world!");
    expect(result).toBe(false);
  });

  test("detects content with null bytes as binary", () => {
    const result = isBinaryContent(Buffer.from([0x48, 0x00, 0x69]));
    expect(result).toBe(true);
  });

  test("returns false for empty content", () => {
    expect(isBinaryContent("")).toBe(false);
    expect(isBinaryContent(Buffer.from([]))).toBe(false);
  });
});

describe("formatTokenCount", () => {
  test("formats small numbers as-is", () => {
    expect(formatTokenCount(500)).toBe("500");
    expect(formatTokenCount(999)).toBe("999");
  });

  test("formats thousands with K suffix", () => {
    expect(formatTokenCount(1000)).toBe("1.0K");
    expect(formatTokenCount(5500)).toBe("5.5K");
    expect(formatTokenCount(12345)).toBe("12.3K");
  });

  test("formats millions with M suffix", () => {
    expect(formatTokenCount(1000000)).toBe("1.0M");
    expect(formatTokenCount(2500000)).toBe("2.5M");
  });
});

describe("getTokenWarning", () => {
  test("returns null for small token counts", () => {
    expect(getTokenWarning(10000)).toBeNull();
    expect(getTokenWarning(50000)).toBeNull();
  });

  test("warns for large context", () => {
    const warning = getTokenWarning(100001);
    expect(warning).not.toBeNull();
    expect(warning).toContain("Large context");
  });

  test("warns for exceeding GPT-4 Turbo limit", () => {
    const warning = getTokenWarning(128001);
    expect(warning).not.toBeNull();
    expect(warning).toContain("GPT-4 Turbo");
  });

  test("warns for exceeding Claude limit", () => {
    const warning = getTokenWarning(200001);
    expect(warning).not.toBeNull();
    expect(warning).toContain("Claude");
  });
});
