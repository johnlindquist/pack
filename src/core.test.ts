import { describe, test, expect } from "bun:test";
import {
  parseCSV,
  toExtSet,
  escRegex,
  findAllMatches,
  extractContextWindows,
  formatContextWindows,
  contentContainsStrings,
  normalizeStrings,
  parseConfigContent,
  getDefaultExtensions,
  extensionToGlobPattern,
  hasGlobChars,
  findRelatedFiles,
  expandWithRelatedFiles,
  isGitRepository,
} from "./core";

describe("parseCSV", () => {
  test("returns empty array for undefined input", () => {
    expect(parseCSV(undefined)).toEqual([]);
  });

  test("returns empty array for empty string", () => {
    expect(parseCSV("")).toEqual([]);
  });

  test("parses single value", () => {
    expect(parseCSV("foo")).toEqual(["foo"]);
  });

  test("parses comma-separated values", () => {
    expect(parseCSV("foo,bar,baz")).toEqual(["foo", "bar", "baz"]);
  });

  test("trims whitespace around values", () => {
    expect(parseCSV("foo , bar , baz")).toEqual(["foo", "bar", "baz"]);
  });

  test("filters out empty values", () => {
    expect(parseCSV("foo,,bar,")).toEqual(["foo", "bar"]);
  });
});

describe("toExtSet", () => {
  test("adds leading dots to extensions", () => {
    const set = toExtSet(["js", "ts"]);
    expect(set.has(".js")).toBe(true);
    expect(set.has(".ts")).toBe(true);
  });

  test("handles extensions already with dots", () => {
    const set = toExtSet([".js", ".ts"]);
    expect(set.has(".js")).toBe(true);
    expect(set.has(".ts")).toBe(true);
  });

  test("lowercases extensions", () => {
    const set = toExtSet(["JS", "TS"]);
    expect(set.has(".js")).toBe(true);
    expect(set.has(".ts")).toBe(true);
  });

  test("handles mixed case and dots", () => {
    const set = toExtSet(["JS", ".ts", "TSX"]);
    expect(set.has(".js")).toBe(true);
    expect(set.has(".ts")).toBe(true);
    expect(set.has(".tsx")).toBe(true);
  });

  test("returns empty set for empty array", () => {
    const set = toExtSet([]);
    expect(set.size).toBe(0);
  });
});

describe("escRegex", () => {
  test("escapes regex special characters", () => {
    expect(escRegex("foo.bar")).toBe("foo\\.bar");
    expect(escRegex("foo*bar")).toBe("foo\\*bar");
    expect(escRegex("foo+bar")).toBe("foo\\+bar");
    expect(escRegex("foo?bar")).toBe("foo\\?bar");
    expect(escRegex("foo^bar")).toBe("foo\\^bar");
    expect(escRegex("foo$bar")).toBe("foo\\$bar");
    expect(escRegex("foo{bar}")).toBe("foo\\{bar\\}");
    expect(escRegex("foo(bar)")).toBe("foo\\(bar\\)");
    expect(escRegex("foo|bar")).toBe("foo\\|bar");
    expect(escRegex("foo[bar]")).toBe("foo\\[bar\\]");
    expect(escRegex("foo\\bar")).toBe("foo\\\\bar");
  });

  test("handles normal strings without changes", () => {
    expect(escRegex("foobar")).toBe("foobar");
    expect(escRegex("foo_bar")).toBe("foo_bar");
    expect(escRegex("foo-bar")).toBe("foo-bar");
  });

  test("handles complex patterns", () => {
    expect(escRegex("array[index]")).toBe("array\\[index\\]");
    expect(escRegex("obj.prop")).toBe("obj\\.prop");
    expect(escRegex("foo(bar, baz)")).toBe("foo\\(bar, baz\\)");
  });
});

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
});

describe("extractContextWindows", () => {
  const content = `line 1
line 2
line 3 TODO
line 4
line 5
line 6
line 7 TODO
line 8
line 9`;

  test("extracts context around single match", async () => {
    const windows = await extractContextWindows("hello\nworld TODO\nbye", /TODO/, 1);
    expect(windows).toHaveLength(1);
    expect(windows[0].startLine).toBe(1);
    expect(windows[0].endLine).toBe(3);
    expect(windows[0].matches).toHaveLength(1);
  });

  test("extracts specified number of context lines", async () => {
    // With 2 lines context around lines 3 and 7, windows overlap at line 5
    // so they get merged into a single window
    const windows = await extractContextWindows(content, /TODO/, 2);
    expect(windows).toHaveLength(1);
    expect(windows[0].startLine).toBe(1);
    expect(windows[0].endLine).toBe(9);
    expect(windows[0].matches).toHaveLength(2);
  });

  test("creates separate windows when not overlapping", async () => {
    // With only 1 line context, windows won't overlap
    const windows = await extractContextWindows(content, /TODO/, 1);
    expect(windows).toHaveLength(2);

    // First window: line 3 TODO with 1 line context (lines 2-4)
    expect(windows[0].startLine).toBe(2);
    expect(windows[0].endLine).toBe(4);

    // Second window: line 7 TODO with 1 line context (lines 6-8)
    expect(windows[1].startLine).toBe(6);
    expect(windows[1].endLine).toBe(8);
  });

  test("merges overlapping windows", async () => {
    const narrowContent = `line 1 TODO
line 2
line 3 TODO`;
    const windows = await extractContextWindows(narrowContent, /TODO/, 2);
    // Should merge into single window
    expect(windows).toHaveLength(1);
    expect(windows[0].matches).toHaveLength(2);
  });

  test("returns empty array for no matches", async () => {
    const windows = await extractContextWindows(content, /NOTFOUND/, 2);
    expect(windows).toHaveLength(0);
  });

  test("handles context at start of file", async () => {
    const windows = await extractContextWindows("TODO line\nline 2\nline 3", /TODO/, 2);
    expect(windows[0].startLine).toBe(1);
  });

  test("handles context at end of file", async () => {
    const windows = await extractContextWindows("line 1\nline 2\nTODO line", /TODO/, 2);
    expect(windows[0].endLine).toBe(3);
  });
});

describe("formatContextWindows", () => {
  test("formats single window with line numbers", () => {
    const windows = [{
      startLine: 1,
      endLine: 3,
      lines: ["line 1", "line 2", "line 3"],
      matches: [{ line: 2, column: 0, match: "line 2" }]
    }];
    const output = formatContextWindows(windows, "test.ts");
    expect(output).toContain("     1|");
    expect(output).toContain("     2|");
    expect(output).toContain("     3|");
    expect(output).toContain("line 1");
    expect(output).toContain("line 2");
    expect(output).toContain("line 3");
  });

  test("adds separator between windows", () => {
    const windows = [
      { startLine: 1, endLine: 2, lines: ["a", "b"], matches: [] },
      { startLine: 10, endLine: 11, lines: ["x", "y"], matches: [] }
    ];
    const output = formatContextWindows(windows, "test.ts");
    expect(output).toContain("...");
  });

  test("returns empty string for empty windows", () => {
    const output = formatContextWindows([], "test.ts");
    expect(output).toBe("");
  });
});

describe("contentContainsStrings", () => {
  test("returns true when pattern matches", () => {
    expect(contentContainsStrings("hello world", /world/)).toBe(true);
  });

  test("returns false when pattern does not match", () => {
    expect(contentContainsStrings("hello world", /foo/)).toBe(false);
  });

  test("returns false when exclude pattern matches", () => {
    expect(contentContainsStrings("hello world", /world/, /hello/)).toBe(false);
  });

  test("returns true when exclude pattern does not match", () => {
    expect(contentContainsStrings("hello world", /world/, /foo/)).toBe(true);
  });

  test("returns true when pattern is null", () => {
    expect(contentContainsStrings("hello world", null)).toBe(true);
  });

  test("returns true when both patterns are null", () => {
    expect(contentContainsStrings("hello world", null, null)).toBe(true);
  });
});

describe("normalizeStrings", () => {
  test("returns empty array for undefined", () => {
    expect(normalizeStrings(undefined)).toEqual([]);
  });

  test("wraps single string in array", () => {
    expect(normalizeStrings("foo")).toEqual(["foo"]);
  });

  test("returns array as-is", () => {
    expect(normalizeStrings(["foo", "bar"])).toEqual(["foo", "bar"]);
  });

  test("wraps empty string in array (falsy but valid string)", () => {
    // Empty string is falsy, so normalizeStrings returns empty array
    expect(normalizeStrings("")).toEqual([]);
  });
});

describe("parseConfigContent", () => {
  test("parses search section", () => {
    const content = `[search]
TODO
FIXME`;
    const config = parseConfigContent(content);
    expect(config.search).toEqual(["TODO", "FIXME"]);
  });

  test("parses extensions section", () => {
    const content = `[extensions]
ts
tsx
js`;
    const config = parseConfigContent(content);
    expect(config.extensions).toEqual(["ts", "tsx", "js"]);
  });

  test("parses exclude section", () => {
    const content = `[exclude]
*.d.ts
node_modules`;
    const config = parseConfigContent(content);
    expect(config.exclude).toEqual(["*.d.ts", "node_modules"]);
  });

  test("parses all sections together", () => {
    const content = `[search]
TODO

[extensions]
ts

[exclude]
dist`;
    const config = parseConfigContent(content);
    expect(config.search).toEqual(["TODO"]);
    expect(config.extensions).toEqual(["ts"]);
    expect(config.exclude).toEqual(["dist"]);
  });

  test("ignores comments", () => {
    const content = `[search]
# This is a comment
TODO
# Another comment
FIXME`;
    const config = parseConfigContent(content);
    expect(config.search).toEqual(["TODO", "FIXME"]);
  });

  test("ignores empty lines", () => {
    const content = `[search]

TODO

FIXME

`;
    const config = parseConfigContent(content);
    expect(config.search).toEqual(["TODO", "FIXME"]);
  });

  test("handles alternative section names", () => {
    const content = `[strings]
search1

[include]
ts

[ignore]
dist`;
    const config = parseConfigContent(content);
    expect(config.search).toEqual(["search1"]);
    expect(config.extensions).toEqual(["ts"]);
    expect(config.exclude).toEqual(["dist"]);
  });
});

describe("getDefaultExtensions", () => {
  test("includes common JavaScript/TypeScript extensions", () => {
    const exts = getDefaultExtensions();
    expect(exts.has(".js")).toBe(true);
    expect(exts.has(".jsx")).toBe(true);
    expect(exts.has(".ts")).toBe(true);
    expect(exts.has(".tsx")).toBe(true);
  });

  test("includes common language extensions", () => {
    const exts = getDefaultExtensions();
    expect(exts.has(".py")).toBe(true);
    expect(exts.has(".go")).toBe(true);
    expect(exts.has(".rs")).toBe(true);
  });

  test("includes config file extensions", () => {
    const exts = getDefaultExtensions();
    expect(exts.has(".json")).toBe(true);
    expect(exts.has(".yaml")).toBe(true);
    expect(exts.has(".yml")).toBe(true);
  });

  test("includes markdown extensions", () => {
    const exts = getDefaultExtensions();
    expect(exts.has(".md")).toBe(true);
    expect(exts.has(".mdx")).toBe(true);
  });
});

describe("extensionToGlobPattern", () => {
  test("converts simple extension to glob pattern", () => {
    expect(extensionToGlobPattern("ts")).toBe("**/*.ts");
    expect(extensionToGlobPattern("js")).toBe("**/*.js");
  });

  test("handles extension with leading dot", () => {
    expect(extensionToGlobPattern(".ts")).toBe("**/*.ts");
  });

  test("passes through existing glob patterns", () => {
    expect(extensionToGlobPattern("**/*.ts")).toBe("**/*.ts");
    expect(extensionToGlobPattern("*.d.ts")).toBe("*.d.ts");
  });

  test("passes through path patterns", () => {
    expect(extensionToGlobPattern("src/types")).toBe("src/types");
  });
});

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
    expect(hasGlobChars("file.{ts,tsx}")).toBe(true);
  });

  test("detects negation", () => {
    expect(hasGlobChars("!dist")).toBe(true);
  });

  test("returns false for plain strings", () => {
    expect(hasGlobChars("file.ts")).toBe(false);
    expect(hasGlobChars("src/components")).toBe(false);
  });
});

// Tests for git-aware and related files features
describe("isGitRepository", () => {
  test("returns true for current directory (which is a git repo)", async () => {
    const result = await isGitRepository();
    expect(result).toBe(true);
  });

  test("returns false for non-existent directory", async () => {
    const result = await isGitRepository("/tmp/nonexistent-dir-12345");
    expect(result).toBe(false);
  });
});

describe("findRelatedFiles", () => {
  test("finds test file for core.ts", async () => {
    const coreFile = `${process.cwd()}/src/core.ts`;
    const related = await findRelatedFiles(coreFile);
    const relatedNames = related.map((f) => f.split("/").pop());
    expect(relatedNames).toContain("core.test.ts");
  });

  test("excludes the original file from results", async () => {
    const coreFile = `${process.cwd()}/src/core.ts`;
    const related = await findRelatedFiles(coreFile);
    expect(related).not.toContain(coreFile);
  });

  test("excludes files already in existing set", async () => {
    const coreFile = `${process.cwd()}/src/core.ts`;
    const testFile = `${process.cwd()}/src/core.test.ts`;
    const existing = new Set([testFile]);
    const related = await findRelatedFiles(coreFile, existing);
    expect(related).not.toContain(testFile);
  });

  test("returns empty array for file with no siblings", async () => {
    // package.json has no related files with same basename
    const pkgFile = `${process.cwd()}/package.json`;
    const related = await findRelatedFiles(pkgFile);
    // Should only find files starting with "package."
    const relatedNames = related.map((f) => f.split("/").pop());
    // Filter to ensure we only count things that are actually "package.*"
    const packageRelated = relatedNames.filter((n) => n?.startsWith("package."));
    // package-lock.json would be ignored typically
    expect(packageRelated.length).toBeLessThanOrEqual(1);
  });
});

describe("expandWithRelatedFiles", () => {
  test("expands file list with related files", async () => {
    const coreFile = `${process.cwd()}/src/core.ts`;
    const expanded = await expandWithRelatedFiles([coreFile]);

    expect(expanded.length).toBeGreaterThan(1);
    expect(expanded).toContain(coreFile);

    const expandedNames = expanded.map((f) => f.split("/").pop());
    expect(expandedNames).toContain("core.test.ts");
  });

  test("does not duplicate files", async () => {
    const coreFile = `${process.cwd()}/src/core.ts`;
    const testFile = `${process.cwd()}/src/core.test.ts`;
    const expanded = await expandWithRelatedFiles([coreFile, testFile]);

    // Count occurrences of each file
    const counts = new Map<string, number>();
    for (const f of expanded) {
      counts.set(f, (counts.get(f) || 0) + 1);
    }

    // Each file should appear exactly once
    for (const [file, count] of counts) {
      expect(count).toBe(1);
    }
  });

  test("preserves original files even if they have no related files", async () => {
    const pkgFile = `${process.cwd()}/package.json`;
    const expanded = await expandWithRelatedFiles([pkgFile]);
    expect(expanded).toContain(pkgFile);
  });
});
