/**
 * Tests for context module: smart context extraction
 */

import { describe, test, expect } from "bun:test";
import {
  findAllMatches,
  extractContextWindows,
  formatContextWindows,
  escRegex,
  buildPattern
} from "./context";

describe("findAllMatches", () => {
  test("finds single match", () => {
    const matches = findAllMatches("hello world", /world/);
    expect(matches).toHaveLength(1);
    expect(matches[0].line).toBe(1);
    expect(matches[0].column).toBe(6);
    expect(matches[0].match).toBe("world");
  });

  test("finds multiple matches on same line", () => {
    const matches = findAllMatches("foo bar foo", /foo/g);
    expect(matches).toHaveLength(2);
    expect(matches[0].column).toBe(0);
    expect(matches[1].column).toBe(8);
  });

  test("finds matches across lines", () => {
    const content = "line1 TODO\nline2\nline3 TODO";
    const matches = findAllMatches(content, /TODO/g);
    expect(matches).toHaveLength(2);
    expect(matches[0].line).toBe(1);
    expect(matches[1].line).toBe(3);
  });

  test("returns empty for no matches", () => {
    const matches = findAllMatches("hello world", /xyz/);
    expect(matches).toHaveLength(0);
  });
});

describe("extractContextWindows - basic", () => {
  test("extracts simple context", async () => {
    const content = "line1\nline2 TODO\nline3";
    const windows = await extractContextWindows(content, /TODO/, 1, false);
    expect(windows).toHaveLength(1);
    expect(windows[0].startLine).toBe(1);
    expect(windows[0].endLine).toBe(3);
  });

  test("merges overlapping windows", async () => {
    const content = "line1 TODO\nline2\nline3 TODO";
    const windows = await extractContextWindows(content, /TODO/, 2, false);
    expect(windows).toHaveLength(1); // Should merge into one
    expect(windows[0].matches).toHaveLength(2);
  });

  test("keeps separate non-overlapping windows", async () => {
    const content = Array.from({ length: 20 }, (_, i) => `line${i + 1}${i === 5 || i === 15 ? " TODO" : ""}`).join("\n");
    const windows = await extractContextWindows(content, /TODO/, 2, false);
    expect(windows).toHaveLength(2);
  });
});

describe("extractContextWindows - smart mode", () => {
  test("expands to include function block", async () => {
    const content = `function hello() {
  console.log("start");
  // TODO: fix this
  console.log("end");
}`;
    const windows = await extractContextWindows(content, /TODO/, 1, true);
    expect(windows).toHaveLength(1);
    // Should include the function declaration
    expect(windows[0].lines.some(l => l.includes("function hello"))).toBe(true);
  });

  test("expands to include if block", async () => {
    const content = `if (condition) {
  doSomething();
  // TODO: handle error
  doSomethingElse();
}`;
    const windows = await extractContextWindows(content, /TODO/, 1, true);
    expect(windows).toHaveLength(1);
    expect(windows[0].lines.some(l => l.includes("if (condition)"))).toBe(true);
  });

  test("respects max expansion limit", async () => {
    // Create a very deep nested structure
    const content = Array.from({ length: 100 }, (_, i) => {
      if (i === 50) return "    // TODO: deep";
      return `${"  ".repeat(Math.min(i, 10))}line${i}`;
    }).join("\n");

    const windows = await extractContextWindows(content, /TODO/, 5, true);
    expect(windows).toHaveLength(1);
    // Should not include the entire file
    expect(windows[0].lines.length).toBeLessThan(50);
  });
});

describe("formatContextWindows", () => {
  test("formats with line numbers", () => {
    const windows = [{
      startLine: 10,
      endLine: 12,
      lines: ["line 10", "line 11", "line 12"],
      matches: [{ line: 11, column: 0, match: "line 11" }]
    }];
    const output = formatContextWindows(windows, "test.ts");
    expect(output).toContain("    10|");
    expect(output).toContain("    11|");
    expect(output).toContain("    12|");
  });

  test("adds separator between windows", () => {
    const windows = [
      { startLine: 1, endLine: 2, lines: ["a", "b"], matches: [] },
      { startLine: 10, endLine: 11, lines: ["x", "y"], matches: [] }
    ];
    const output = formatContextWindows(windows, "test.ts");
    expect(output).toContain("...");
  });

  test("returns empty for no windows", () => {
    expect(formatContextWindows([], "test.ts")).toBe("");
  });
});

describe("escRegex", () => {
  test("escapes special characters", () => {
    expect(escRegex("foo.bar")).toBe("foo\\.bar");
    expect(escRegex("a*b+c?")).toBe("a\\*b\\+c\\?");
    expect(escRegex("(a|b)")).toBe("\\(a\\|b\\)");
    expect(escRegex("[abc]")).toBe("\\[abc\\]");
    expect(escRegex("{1,2}")).toBe("\\{1,2\\}");
    expect(escRegex("^$")).toBe("\\^\\$");
    expect(escRegex("a\\b")).toBe("a\\\\b");
  });

  test("keeps normal text unchanged", () => {
    expect(escRegex("hello world")).toBe("hello world");
    expect(escRegex("foo_bar")).toBe("foo_bar");
    expect(escRegex("foo-bar")).toBe("foo-bar");
  });
});

describe("buildPattern", () => {
  test("returns null for empty strings", () => {
    expect(buildPattern([], false, false)).toBeNull();
  });

  test("builds case-insensitive pattern by default", () => {
    const pattern = buildPattern(["hello"], false, false);
    expect(pattern).not.toBeNull();
    expect(pattern!.test("HELLO")).toBe(true);
    expect(pattern!.test("hello")).toBe(true);
  });

  test("builds case-sensitive pattern when requested", () => {
    const pattern = buildPattern(["hello"], true, false);
    expect(pattern).not.toBeNull();
    expect(pattern!.test("hello")).toBe(true);
    expect(pattern!.test("HELLO")).toBe(false);
  });

  test("escapes regex special chars in literal mode", () => {
    const pattern = buildPattern(["foo.bar"], false, false);
    expect(pattern).not.toBeNull();
    expect(pattern!.test("foo.bar")).toBe(true);
    expect(pattern!.test("fooXbar")).toBe(false); // . is escaped, not a wildcard
  });

  test("uses raw regex in regex mode", () => {
    const pattern = buildPattern(["foo.bar"], false, true);
    expect(pattern).not.toBeNull();
    expect(pattern!.test("foo.bar")).toBe(true);
    expect(pattern!.test("fooXbar")).toBe(true); // . matches any char
  });

  test("combines multiple patterns with OR", () => {
    const pattern = buildPattern(["foo", "bar"], false, false);
    expect(pattern).not.toBeNull();
    expect(pattern!.test("foo")).toBe(true);
    expect(pattern!.test("bar")).toBe(true);
    expect(pattern!.test("baz")).toBe(false);
  });

  test("supports regex patterns", () => {
    const pattern = buildPattern(["function\\s+\\w+"], false, true);
    expect(pattern).not.toBeNull();
    expect(pattern!.test("function hello")).toBe(true);
    expect(pattern!.test("function123")).toBe(false);
  });
});
