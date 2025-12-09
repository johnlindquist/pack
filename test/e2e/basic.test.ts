/**
 * E2E tests for basic packx functionality
 */

import { describe, test, expect } from "bun:test";
import { runCLI, getFixturePath } from "./helpers";

describe("E2E: Basic functionality", () => {
  const simplePath = getFixturePath("simple-project");

  describe("Help and version", () => {
    test("--help shows usage information", async () => {
      const { stdout, code } = await runCLI(["--help"]);
      expect(code).toBe(0);
      expect(stdout).toContain("PACKX");
      expect(stdout).toContain("AI Context Bundler");
      expect(stdout).toContain("--strings");
    });

    test("--version shows version number", async () => {
      const { stdout, code } = await runCLI(["--version"]);
      expect(code).toBe(0);
      expect(stdout).toMatch(/packx v\d+\.\d+\.\d+/);
    });

    test("-h is alias for --help", async () => {
      const { stdout, code } = await runCLI(["-h"]);
      expect(code).toBe(0);
      expect(stdout).toContain("PACKX");
    });

    test("-v is alias for --version", async () => {
      const { stdout, code } = await runCLI(["-v"]);
      expect(code).toBe(0);
      expect(stdout).toMatch(/packx v\d+\.\d+\.\d+/);
    });
  });

  describe("String search with -s", () => {
    test("finds files containing TODO", async () => {
      const { stdout, code } = await runCLI(["-s", "TODO", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("index.ts");
      expect(stdout).toContain("utils.ts");
      expect(stdout).toContain("config.ts");
    });

    test("finds files containing FIXME", async () => {
      const { stdout, code } = await runCLI(["-s", "FIXME", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("utils.ts");
      expect(stdout).not.toContain("index.ts");
    });

    test("finds files containing console.log", async () => {
      const { stdout, code } = await runCLI(["-s", "console.log", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("index.ts");
      expect(stdout).toContain("utils.ts");
    });

    test("multiple -s flags use OR logic", async () => {
      const { stdout, code } = await runCLI(["-s", "TODO", "-s", "FIXME", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("index.ts");
      expect(stdout).toContain("utils.ts");
      expect(stdout).toContain("config.ts");
    });

    test("case-insensitive search by default", async () => {
      const { stdout, code } = await runCLI(["-s", "todo", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("index.ts"); // Contains TODO in uppercase
    });

    test("case-sensitive search with -C", async () => {
      const { stdout, code } = await runCLI(["-s", "todo", "-C", "--preview"], { cwd: simplePath });
      // Should not find files with TODO (uppercase)
      expect(stdout).not.toContain("index.ts");
    });
  });

  describe("Extension filtering with -e", () => {
    test("filters by TypeScript extension", async () => {
      const { stdout, code } = await runCLI(["-e", "ts", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("index.ts");
      expect(stdout).toContain("utils.ts");
      expect(stdout).not.toContain("README.md");
      expect(stdout).not.toContain("package.json");
    });

    test("filters by markdown extension", async () => {
      const { stdout, code } = await runCLI(["-e", "md", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("README.md");
      expect(stdout).not.toContain("index.ts");
    });

    test("filters by multiple extensions", async () => {
      const { stdout, code } = await runCLI(["-e", "ts,md", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("index.ts");
      expect(stdout).toContain("README.md");
      expect(stdout).not.toContain("package.json");
    });

    test("combines -s and -e filters", async () => {
      const { stdout, code } = await runCLI(["-s", "TODO", "-e", "ts", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("index.ts");
      expect(stdout).toContain("utils.ts");
      expect(stdout).not.toContain("README.md"); // Has TODO but not .ts
    });
  });

  describe("Exclude patterns with -x", () => {
    test("excludes files matching pattern", async () => {
      const { stdout, code } = await runCLI(["-e", "ts", "-x", "**/config.ts", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("index.ts");
      expect(stdout).not.toContain("config.ts");
    });

    test("multiple -x flags", async () => {
      const { stdout, code } = await runCLI(["-e", "ts", "-x", "**/config.ts", "-x", "**/index.ts", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("utils.ts");
      expect(stdout).not.toContain("index.ts");
      expect(stdout).not.toContain("config.ts");
    });
  });

  describe("Exclude strings with -S", () => {
    test("excludes files containing specific strings", async () => {
      const { stdout, code } = await runCLI(["-s", "console.log", "-S", "Debug", "-e", "ts", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("index.ts");
      expect(stdout).not.toContain("utils.ts"); // Contains "Debug"
    });
  });

  describe("Context lines with -l", () => {
    test("extracts context around matches", async () => {
      const { stdout, code } = await runCLI(["-s", "TODO", "-e", "ts", "-l", "2"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("Pack Summary");
      expect(stdout).toContain("Context Lines: 2");
      expect(stdout).toContain("Total Matches:");
      expect(stdout).toContain("Context Windows:");
    });

    test("larger context with -l 5", async () => {
      const { stdout, code } = await runCLI(["-s", "TODO", "-e", "ts", "-l", "5"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("Context Lines: 5");
    });
  });

  describe("Exit codes", () => {
    test("exits with 0 on success", async () => {
      const { code } = await runCLI(["-s", "TODO", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
    });

    test("exits with 2 when no files found", async () => {
      const { code } = await runCLI(["-e", "py", "--preview"], { cwd: simplePath });
      expect(code).toBe(2);
    });

    test("exits with 3 when no matches found", async () => {
      const { code } = await runCLI(["-s", "NONEXISTENT_STRING_XYZ", "-e", "ts"], { cwd: simplePath });
      expect(code).toBe(3);
    });
  });

  describe("Preview mode", () => {
    test("--preview lists matched files", async () => {
      const { stdout, code } = await runCLI(["-s", "TODO", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("Matched files");
      expect(stdout).toContain("Total:");
    });

    test("preview shows sample of files", async () => {
      const { stdout, code } = await runCLI(["--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toMatch(/\d+ file\(s\)/);
    });
  });

  describe("Regex mode with -R", () => {
    test("uses raw regex patterns", async () => {
      const { stdout, code } = await runCLI(["-s", "function\\s+\\w+", "-R", "-e", "ts", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("utils.ts");
    });

    test("regex pattern for TODO comments", async () => {
      const { stdout, code } = await runCLI(["-s", "//\\s*TODO:", "-R", "-e", "ts", "--preview"], { cwd: simplePath });
      expect(code).toBe(0);
      expect(stdout).toContain("index.ts");
    });
  });
});
