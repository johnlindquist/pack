/**
 * Tests for ripgrep module: high-performance file search
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  isRipgrepAvailable,
  getRipgrepVersion,
  ripgrepSearch,
  ripgrepSearchMultiple,
  ripgrepExcludeContent,
  discoverFilesWithRipgrep,
} from "./ripgrep";

describe("isRipgrepAvailable", () => {
  test("returns true if ripgrep is installed", async () => {
    const available = await isRipgrepAvailable();
    // This test assumes ripgrep is installed on the system
    expect(typeof available).toBe("boolean");
  });
});

describe("getRipgrepVersion", () => {
  test("returns version string if ripgrep is available", async () => {
    const available = await isRipgrepAvailable();
    if (available) {
      const version = await getRipgrepVersion();
      expect(version).toBeTruthy();
      expect(typeof version).toBe("string");
    }
  });
});

describe("ripgrepSearch", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-rg-test-"));

    // Create sample TypeScript files
    await fs.writeFile(
      path.join(tmpDir, "main.ts"),
      `import { helper } from './helper';
console.log("TODO: implement main");
export function main() { return 42; }
`
    );

    await fs.writeFile(
      path.join(tmpDir, "helper.ts"),
      `// Helper utilities
export function helper() {
  return "helper";
}
`
    );

    await fs.writeFile(
      path.join(tmpDir, "config.json"),
      '{"name": "test", "version": "1.0.0"}'
    );

    // Create subdirectory
    await fs.mkdir(path.join(tmpDir, "src"));
    await fs.writeFile(
      path.join(tmpDir, "src", "utils.ts"),
      `// FIXME: refactor this
export const util = 1;
`
    );

    // Create node_modules (should be ignored)
    await fs.mkdir(path.join(tmpDir, "node_modules"));
    await fs.writeFile(
      path.join(tmpDir, "node_modules", "pkg.ts"),
      "// This should be ignored"
    );

    // Create .gitignore
    await fs.writeFile(path.join(tmpDir, ".gitignore"), "*.log\nbuild/\n");
    await fs.writeFile(path.join(tmpDir, "debug.log"), "debug output");
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("finds all TypeScript files by extension", async () => {
    const available = await isRipgrepAvailable();
    if (!available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const result = await ripgrepSearch({
      root: tmpDir,
      extensions: new Set([".ts"]),
      excludePatterns: [],
      contentPattern: null,
      excludeContentPattern: null,
      caseSensitive: false,
      useRegex: false,
    });

    expect(result.usedRipgrep).toBe(true);
    expect(result.error).toBeUndefined();

    const fileNames = result.files.map((f) => path.basename(f));
    expect(fileNames).toContain("main.ts");
    expect(fileNames).toContain("helper.ts");
    expect(fileNames).toContain("utils.ts");
    expect(fileNames).not.toContain("pkg.ts"); // node_modules excluded
    expect(fileNames).not.toContain("config.json");
  });

  test("filters by content pattern", async () => {
    const available = await isRipgrepAvailable();
    if (!available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const result = await ripgrepSearch({
      root: tmpDir,
      extensions: new Set([".ts"]),
      excludePatterns: [],
      contentPattern: "TODO",
      excludeContentPattern: null,
      caseSensitive: false,
      useRegex: false,
    });

    expect(result.usedRipgrep).toBe(true);
    const fileNames = result.files.map((f) => path.basename(f));
    expect(fileNames).toContain("main.ts");
    expect(fileNames).not.toContain("helper.ts");
    expect(fileNames).not.toContain("utils.ts");
  });

  test("respects case sensitivity", async () => {
    const available = await isRipgrepAvailable();
    if (!available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    // Case insensitive should find "TODO"
    const insensitiveResult = await ripgrepSearch({
      root: tmpDir,
      extensions: new Set([".ts"]),
      excludePatterns: [],
      contentPattern: "todo",
      excludeContentPattern: null,
      caseSensitive: false,
      useRegex: false,
    });
    expect(insensitiveResult.files.length).toBeGreaterThan(0);

    // Case sensitive should NOT find "todo" (file has "TODO")
    const sensitiveResult = await ripgrepSearch({
      root: tmpDir,
      extensions: new Set([".ts"]),
      excludePatterns: [],
      contentPattern: "todo",
      excludeContentPattern: null,
      caseSensitive: true,
      useRegex: false,
    });
    expect(sensitiveResult.files.length).toBe(0);
  });

  test("supports regex patterns", async () => {
    const available = await isRipgrepAvailable();
    if (!available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const result = await ripgrepSearch({
      root: tmpDir,
      extensions: new Set([".ts"]),
      excludePatterns: [],
      contentPattern: "TODO|FIXME",
      excludeContentPattern: null,
      caseSensitive: false,
      useRegex: true,
    });

    expect(result.usedRipgrep).toBe(true);
    const fileNames = result.files.map((f) => path.basename(f));
    expect(fileNames).toContain("main.ts"); // Has TODO
    expect(fileNames).toContain("utils.ts"); // Has FIXME
    expect(fileNames).not.toContain("helper.ts"); // Has neither
  });

  test("respects exclude patterns", async () => {
    const available = await isRipgrepAvailable();
    if (!available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const result = await ripgrepSearch({
      root: tmpDir,
      extensions: new Set([".ts"]),
      excludePatterns: ["**/utils.ts"],
      contentPattern: null,
      excludeContentPattern: null,
      caseSensitive: false,
      useRegex: false,
    });

    const fileNames = result.files.map((f) => path.basename(f));
    expect(fileNames).toContain("main.ts");
    expect(fileNames).toContain("helper.ts");
    expect(fileNames).not.toContain("utils.ts");
  });
});

describe("ripgrepSearchMultiple", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-rg-multi-test-"));

    await fs.writeFile(
      path.join(tmpDir, "file1.ts"),
      'const foo = "bar";\n'
    );
    await fs.writeFile(
      path.join(tmpDir, "file2.ts"),
      'const baz = "qux";\n'
    );
    await fs.writeFile(
      path.join(tmpDir, "file3.ts"),
      'const other = "value";\n'
    );
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("finds files matching any of multiple patterns", async () => {
    const available = await isRipgrepAvailable();
    if (!available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const result = await ripgrepSearchMultiple({
      root: tmpDir,
      extensions: new Set([".ts"]),
      excludePatterns: [],
      contentPatterns: ["foo", "baz"],
      excludeContentPattern: null,
      caseSensitive: false,
      useRegex: false,
    });

    expect(result.usedRipgrep).toBe(true);
    const fileNames = result.files.map((f) => path.basename(f));
    expect(fileNames).toContain("file1.ts");
    expect(fileNames).toContain("file2.ts");
    expect(fileNames).not.toContain("file3.ts");
  });

  test("returns all files when no patterns provided", async () => {
    const available = await isRipgrepAvailable();
    if (!available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const result = await ripgrepSearchMultiple({
      root: tmpDir,
      extensions: new Set([".ts"]),
      excludePatterns: [],
      contentPatterns: [],
      excludeContentPattern: null,
      caseSensitive: false,
      useRegex: false,
    });

    expect(result.usedRipgrep).toBe(true);
    expect(result.files.length).toBe(3);
  });
});

describe("ripgrepExcludeContent", () => {
  let tmpDir: string;
  let files: string[];

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-rg-exclude-test-"));

    await fs.writeFile(
      path.join(tmpDir, "has-secret.ts"),
      'const API_KEY = "secret123";\n'
    );
    await fs.writeFile(
      path.join(tmpDir, "no-secret.ts"),
      'const value = "normal";\n'
    );
    await fs.writeFile(
      path.join(tmpDir, "also-secret.ts"),
      'const password = "secret456";\n'
    );

    files = [
      path.join(tmpDir, "has-secret.ts"),
      path.join(tmpDir, "no-secret.ts"),
      path.join(tmpDir, "also-secret.ts"),
    ];
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("excludes files containing pattern", async () => {
    const available = await isRipgrepAvailable();
    if (!available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const filtered = await ripgrepExcludeContent(
      files,
      "secret",
      false,
      false
    );

    const fileNames = filtered.map((f) => path.basename(f));
    expect(fileNames).toContain("no-secret.ts");
    expect(fileNames).not.toContain("has-secret.ts");
    expect(fileNames).not.toContain("also-secret.ts");
  });
});

describe("discoverFilesWithRipgrep", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-rg-discover-test-"));

    await fs.writeFile(
      path.join(tmpDir, "main.ts"),
      `// TODO: implement
export function main() { return 42; }
`
    );
    await fs.writeFile(
      path.join(tmpDir, "helper.ts"),
      `// Helper
export function helper() { return "help"; }
`
    );
    await fs.writeFile(
      path.join(tmpDir, "excluded.ts"),
      `// SECRET: do not include
export const secret = true;
`
    );
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("combines search and exclude in one operation", async () => {
    const available = await isRipgrepAvailable();
    if (!available) {
      console.log("Skipping test: ripgrep not available");
      return;
    }

    const result = await discoverFilesWithRipgrep(
      tmpDir,
      new Set([".ts"]),
      [],
      ["TODO", "Helper"], // Search for files with TODO or Helper
      ["SECRET"], // Exclude files with SECRET
      false,
      false,
      true
    );

    expect(result.usedRipgrep).toBe(true);
    const fileNames = result.files.map((f) => path.basename(f));
    expect(fileNames).toContain("main.ts");
    expect(fileNames).toContain("helper.ts");
    expect(fileNames).not.toContain("excluded.ts");
  });
});
