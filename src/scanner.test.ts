/**
 * Tests for scanner module: file discovery and filtering
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadGitignore,
  scanDirectory,
  filterByContent,
  hasGlobChars,
  expandPattern,
  DEFAULT_IGNORE_PATTERNS
} from "./scanner";

describe("hasGlobChars", () => {
  test("detects asterisk", () => {
    expect(hasGlobChars("*.ts")).toBe(true);
    expect(hasGlobChars("**/*.ts")).toBe(true);
  });

  test("detects question mark", () => {
    expect(hasGlobChars("file?.ts")).toBe(true);
  });

  test("detects brackets", () => {
    expect(hasGlobChars("[abc].ts")).toBe(true);
    expect(hasGlobChars("{a,b}.ts")).toBe(true);
  });

  test("detects negation", () => {
    expect(hasGlobChars("!dist")).toBe(true);
  });

  test("returns false for plain strings", () => {
    expect(hasGlobChars("file.ts")).toBe(false);
    expect(hasGlobChars("src/components")).toBe(false);
  });
});

describe("expandPattern", () => {
  test("returns glob patterns as-is", () => {
    const patterns = expandPattern("**/*.ts");
    expect(patterns).toEqual(["**/*.ts"]);
  });

  test("expands simple path to multiple patterns", () => {
    const patterns = expandPattern("src");
    expect(patterns.length).toBeGreaterThan(1);
    expect(patterns).toContain("src");
    expect(patterns).toContain("**/src");
    expect(patterns).toContain("src/**");
    expect(patterns).toContain("**/src/**");
  });

  test("strips leading ./ from paths", () => {
    const patterns = expandPattern("./src");
    expect(patterns).toContain("src");
    expect(patterns).not.toContain("./src");
  });

  test("preserves leading dots for hidden files", () => {
    const patterns = expandPattern(".claude");
    expect(patterns).toContain(".claude");
  });
});

describe("DEFAULT_IGNORE_PATTERNS", () => {
  test("includes node_modules", () => {
    expect(DEFAULT_IGNORE_PATTERNS).toContain("**/node_modules/**");
  });

  test("includes .git", () => {
    expect(DEFAULT_IGNORE_PATTERNS).toContain("**/.git/**");
  });

  test("includes common build directories", () => {
    expect(DEFAULT_IGNORE_PATTERNS).toContain("**/dist/**");
    expect(DEFAULT_IGNORE_PATTERNS).toContain("**/build/**");
  });

  test("includes lockfiles", () => {
    expect(DEFAULT_IGNORE_PATTERNS).toContain("**/package-lock.json");
    expect(DEFAULT_IGNORE_PATTERNS).toContain("**/yarn.lock");
  });
});

describe("loadGitignore", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-gitignore-test-"));

    // Create a .gitignore file
    await fs.writeFile(path.join(tmpDir, ".gitignore"), `
# Comments are ignored
node_modules/
dist/
*.log
.env
`);
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("loads .gitignore rules", async () => {
    const ig = await loadGitignore(tmpDir);
    expect(ig.ignores("node_modules/package.json")).toBe(true);
    expect(ig.ignores("dist/index.js")).toBe(true);
    expect(ig.ignores("app.log")).toBe(true);
    expect(ig.ignores(".env")).toBe(true);
  });

  test("does not ignore non-matching paths", async () => {
    const ig = await loadGitignore(tmpDir);
    expect(ig.ignores("src/index.ts")).toBe(false);
    expect(ig.ignores("package.json")).toBe(false);
  });

  test("returns empty ignore for directory without .gitignore", async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-empty-"));
    const ig = await loadGitignore(emptyDir);
    expect(ig.ignores("anything.ts")).toBe(false);
    await fs.rm(emptyDir, { recursive: true, force: true });
  });
});

describe("scanDirectory", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-scan-test-"));

    // Create sample files
    await fs.writeFile(path.join(tmpDir, "main.ts"), "console.log('main')");
    await fs.writeFile(path.join(tmpDir, "helper.ts"), "export function help() {}");
    await fs.writeFile(path.join(tmpDir, "config.json"), '{"name": "test"}');
    await fs.writeFile(path.join(tmpDir, "README.md"), "# Test");

    // Create subdirectory
    await fs.mkdir(path.join(tmpDir, "src"));
    await fs.writeFile(path.join(tmpDir, "src", "utils.ts"), "export const util = 1");

    // Create node_modules (should be ignored)
    await fs.mkdir(path.join(tmpDir, "node_modules"));
    await fs.writeFile(path.join(tmpDir, "node_modules", "pkg.ts"), "ignored");

    // Create .gitignore
    await fs.writeFile(path.join(tmpDir, ".gitignore"), "*.log\n");
    await fs.writeFile(path.join(tmpDir, "debug.log"), "log content");
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("finds files by extension", async () => {
    const tsExt = new Set([".ts"]);
    const files = await scanDirectory(tmpDir, tsExt, []);

    const fileNames = files.map(f => path.basename(f));
    expect(fileNames).toContain("main.ts");
    expect(fileNames).toContain("helper.ts");
    expect(fileNames).toContain("utils.ts");
    expect(fileNames).not.toContain("config.json");
    expect(fileNames).not.toContain("README.md");
  });

  test("respects exclude patterns", async () => {
    const tsExt = new Set([".ts"]);
    const files = await scanDirectory(tmpDir, tsExt, ["**/utils.ts"]);

    const fileNames = files.map(f => path.basename(f));
    expect(fileNames).toContain("main.ts");
    expect(fileNames).not.toContain("utils.ts");
  });

  test("ignores node_modules by default", async () => {
    const tsExt = new Set([".ts"]);
    const files = await scanDirectory(tmpDir, tsExt, []);

    const fileNames = files.map(f => path.basename(f));
    expect(fileNames).not.toContain("pkg.ts");
  });

  test("respects .gitignore when enabled", async () => {
    const allExt = new Set([".ts", ".log"]);
    const files = await scanDirectory(tmpDir, allExt, [], false, true);

    const fileNames = files.map(f => path.basename(f));
    expect(fileNames).toContain("main.ts");
    expect(fileNames).not.toContain("debug.log"); // .gitignore excludes *.log
  });
});

describe("filterByContent", () => {
  let tmpDir: string;
  let files: string[];

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-filter-test-"));

    await fs.writeFile(path.join(tmpDir, "has-todo.ts"), "// TODO: implement");
    await fs.writeFile(path.join(tmpDir, "no-todo.ts"), "console.log('done')");
    await fs.writeFile(path.join(tmpDir, "has-fixme.ts"), "// FIXME: broken");

    files = [
      path.join(tmpDir, "has-todo.ts"),
      path.join(tmpDir, "no-todo.ts"),
      path.join(tmpDir, "has-fixme.ts")
    ];
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("filters files containing pattern", async () => {
    const result = await filterByContent(files, /TODO/, null);
    expect(result.map(f => path.basename(f))).toEqual(["has-todo.ts"]);
  });

  test("filters files containing multiple patterns", async () => {
    const result = await filterByContent(files, /TODO|FIXME/, null);
    const names = result.map(f => path.basename(f)).sort();
    expect(names).toEqual(["has-fixme.ts", "has-todo.ts"]);
  });

  test("excludes files matching exclude pattern", async () => {
    const result = await filterByContent(files, /TODO|FIXME/, /broken/);
    const names = result.map(f => path.basename(f));
    expect(names).toContain("has-todo.ts");
    expect(names).not.toContain("has-fixme.ts"); // Contains "broken"
  });

  test("includes all files when pattern is null", async () => {
    const result = await filterByContent(files, null, null);
    expect(result).toHaveLength(3);
  });
});
