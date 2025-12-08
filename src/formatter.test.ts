import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  findAllMatches,
  formatFileAsJsonl,
  formatAsJsonl,
} from "./formatter";
import type { JsonlFileEntry } from "./types";

describe("findAllMatches", () => {
  test("finds single match on single line", () => {
    const matches = findAllMatches("hello world", /world/);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ line: 1, column: 6, match: "world" });
  });

  test("finds multiple matches on same line", () => {
    const matches = findAllMatches("foo bar foo baz foo", /foo/);
    expect(matches).toHaveLength(3);
    expect(matches[0]).toEqual({ line: 1, column: 0, match: "foo" });
    expect(matches[1]).toEqual({ line: 1, column: 8, match: "foo" });
    expect(matches[2]).toEqual({ line: 1, column: 16, match: "foo" });
  });

  test("finds matches across multiple lines", () => {
    const content = "line1 TODO\nline2\nline3 TODO";
    const matches = findAllMatches(content, /TODO/);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({ line: 1, column: 6, match: "TODO" });
    expect(matches[1]).toEqual({ line: 3, column: 6, match: "TODO" });
  });

  test("returns empty array for no matches", () => {
    const matches = findAllMatches("hello world", /foo/);
    expect(matches).toHaveLength(0);
  });

  test("handles case-insensitive patterns", () => {
    const matches = findAllMatches("TODO todo Todo", /todo/i);
    expect(matches).toHaveLength(3);
  });

  test("handles regex with global flag already set", () => {
    const matches = findAllMatches("foo bar foo", /foo/g);
    expect(matches).toHaveLength(2);
  });
});

describe("formatFileAsJsonl", () => {
  let tempDir: string;
  let testFile: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-jsonl-test-"));
    testFile = path.join(tempDir, "test.ts");
    await fs.writeFile(testFile, `// This is a test file
function hello() {
  console.log("TODO: implement");
}

// TODO: add more functions
export { hello };
`);
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  test("formats file as JSONL entry with matches", async () => {
    const { entry, stats } = await formatFileAsJsonl(testFile, "test.ts", {
      style: "jsonl",
      pattern: /TODO/,
    });

    expect(entry.path).toBe("test.ts");
    expect(entry.content).toContain("function hello()");
    expect(entry.tokens).toBeGreaterThan(0);
    expect(entry.matches).toHaveLength(2);
    expect(entry.matches[0].match).toBe("TODO");
    expect(entry.matches[1].match).toBe("TODO");

    expect(stats.path).toBe("test.ts");
    expect(stats.matchCount).toBe(2);
  });

  test("formats file as JSONL entry without pattern", async () => {
    const { entry, stats } = await formatFileAsJsonl(testFile, "test.ts", {
      style: "jsonl",
    });

    expect(entry.path).toBe("test.ts");
    expect(entry.content).toContain("function hello()");
    expect(entry.matches).toHaveLength(0);
    expect(stats.matchCount).toBe(0);
  });

  test("applies stripComments processing", async () => {
    const { entry } = await formatFileAsJsonl(testFile, "test.ts", {
      style: "jsonl",
      stripComments: true,
    });

    expect(entry.content).not.toContain("// This is a test file");
    expect(entry.content).toContain("function hello()");
  });
});

describe("formatAsJsonl", () => {
  let tempDir: string;
  let testFile1: string;
  let testFile2: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-jsonl-test2-"));
    testFile1 = path.join(tempDir, "file1.ts");
    testFile2 = path.join(tempDir, "file2.ts");

    await fs.writeFile(testFile1, `const x = 1;
// TODO: fix this
const y = 2;`);

    await fs.writeFile(testFile2, `export function foo() {
  // TODO: implement
  return "bar";
}`);
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  test("formats multiple files as JSONL", async () => {
    const { output, stats, totalTokens, totalChars } = await formatAsJsonl(
      [testFile1, testFile2],
      tempDir,
      { style: "jsonl", pattern: /TODO/ }
    );

    // Output should be newline-delimited JSON
    const lines = output.split("\n");
    expect(lines).toHaveLength(2);

    // Each line should be valid JSON
    const entry1: JsonlFileEntry = JSON.parse(lines[0]);
    const entry2: JsonlFileEntry = JSON.parse(lines[1]);

    expect(entry1.path).toBe("file1.ts");
    expect(entry1.matches).toHaveLength(1);
    expect(entry1.matches[0].match).toBe("TODO");

    expect(entry2.path).toBe("file2.ts");
    expect(entry2.matches).toHaveLength(1);
    expect(entry2.matches[0].match).toBe("TODO");

    // Stats should be collected
    expect(stats).toHaveLength(2);
    expect(totalTokens).toBeGreaterThan(0);
    expect(totalChars).toBeGreaterThan(0);
  });

  test("handles special characters in content (JSON escaping)", async () => {
    const specialFile = path.join(tempDir, "special.ts");
    await fs.writeFile(specialFile, `const str = "line1\\nline2";
const obj = { "key": "value" };
const template = \`multi
line\`;`);

    const { output } = await formatAsJsonl([specialFile], tempDir, {
      style: "jsonl",
    });

    // Should be valid JSON
    const entry: JsonlFileEntry = JSON.parse(output);
    expect(entry.path).toBe("special.ts");
    expect(entry.content).toContain("line1\\nline2");
    expect(entry.content).toContain('"key"');

    // Cleanup
    await fs.unlink(specialFile);
  });

  test("returns empty output for empty file list", async () => {
    const { output, stats, totalTokens, totalChars } = await formatAsJsonl(
      [],
      tempDir,
      { style: "jsonl" }
    );

    expect(output).toBe("");
    expect(stats).toHaveLength(0);
    expect(totalTokens).toBe(0);
    expect(totalChars).toBe(0);
  });
});
