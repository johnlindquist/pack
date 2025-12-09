/**
 * End-to-end integration tests for packx CLI
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";

const CLI_PATH = path.join(process.cwd(), "src/index.ts");

// Helper to run CLI commands
async function runCLI(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn("bun", ["run", CLI_PATH, ...args], {
      cwd: cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => (stdout += data.toString()));
    proc.stderr.on("data", (data) => (stderr += data.toString()));

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code: code || 0 });
    });
  });
}

// Create a temporary test directory with sample files
async function createTestFixture(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-test-"));

  // Create sample files
  await fs.writeFile(path.join(tmpDir, "main.ts"), `
// Main entry point
import { helper } from "./helper";

function main() {
  // TODO: implement main logic
  console.log("Hello world");
  helper();
}

main();
`);

  await fs.writeFile(path.join(tmpDir, "helper.ts"), `
// Helper functions
export function helper() {
  // FIXME: this is broken
  console.log("Helper called");
}

export function unused() {
  // This function is not used
}
`);

  await fs.writeFile(path.join(tmpDir, "config.json"), `{
  "name": "test-project",
  "version": "1.0.0"
}
`);

  await fs.writeFile(path.join(tmpDir, "README.md"), `# Test Project

This is a test project for packx E2E testing.

## TODO

- Add more features
- Write more tests
`);

  // Create a binary file (should be skipped)
  const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd]);
  await fs.writeFile(path.join(tmpDir, "binary.dat"), binaryContent);

  // Create a nested directory
  await fs.mkdir(path.join(tmpDir, "src"));
  await fs.writeFile(path.join(tmpDir, "src/utils.ts"), `
// Utility functions
export function formatDate(date: Date): string {
  // TODO: implement proper formatting
  return date.toISOString();
}
`);

  // Create a test file
  await fs.writeFile(path.join(tmpDir, "main.test.ts"), `
import { describe, test, expect } from "bun:test";

describe("main", () => {
  test("should work", () => {
    expect(true).toBe(true);
  });
});
`);

  // Create a .gitignore file
  await fs.writeFile(path.join(tmpDir, ".gitignore"), `
node_modules/
dist/
*.log
`);

  // Create node_modules directory (should be ignored)
  await fs.mkdir(path.join(tmpDir, "node_modules"));
  await fs.writeFile(path.join(tmpDir, "node_modules/package.ts"), `
// This should be ignored
export const pkg = "ignored";
`);

  return tmpDir;
}

describe("E2E: packx CLI", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = await createTestFixture();
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("Basic functionality", () => {
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
  });

  describe("String search", () => {
    test("finds files containing TODO", async () => {
      const { stdout, code } = await runCLI(["-s", "TODO", "--preview"], testDir);
      expect(code).toBe(0);
      expect(stdout).toContain("main.ts");
      expect(stdout).toContain("README.md");
      expect(stdout).toContain("utils.ts");
    });

    test("finds files containing FIXME", async () => {
      const { stdout, code } = await runCLI(["-s", "FIXME", "--preview"], testDir);
      expect(code).toBe(0);
      expect(stdout).toContain("helper.ts");
    });

    test("multiple strings with OR logic", async () => {
      const { stdout, code } = await runCLI(["-s", "TODO", "-s", "FIXME", "--preview"], testDir);
      expect(code).toBe(0);
      expect(stdout).toContain("main.ts");
      expect(stdout).toContain("helper.ts");
    });

    test("case-insensitive search by default", async () => {
      const { stdout, code } = await runCLI(["-s", "todo", "--preview"], testDir);
      expect(code).toBe(0);
      expect(stdout).toContain("main.ts"); // Contains TODO in uppercase
    });

    test("case-sensitive search with -C", async () => {
      const { stdout, code } = await runCLI(["-s", "todo", "-C", "--preview"], testDir);
      // Should not find files with TODO (uppercase)
      expect(stdout).not.toContain("main.ts");
    });
  });

  describe("Extension filtering", () => {
    test("filters by TypeScript extension", async () => {
      const { stdout, code } = await runCLI(["-e", "ts", "--preview"], testDir);
      expect(code).toBe(0);
      expect(stdout).toContain("main.ts");
      expect(stdout).toContain("helper.ts");
      expect(stdout).not.toContain("config.json");
      expect(stdout).not.toContain("README.md");
    });

    test("filters by multiple extensions", async () => {
      const { stdout, code } = await runCLI(["-e", "ts,json", "--preview"], testDir);
      expect(code).toBe(0);
      expect(stdout).toContain("main.ts");
      expect(stdout).toContain("config.json");
      expect(stdout).not.toContain("README.md");
    });

    test("excludes patterns with -x", async () => {
      const { stdout, code } = await runCLI(["-e", "ts", "-x", "test.ts", "--preview"], testDir);
      expect(code).toBe(0);
      expect(stdout).toContain("main.ts");
      expect(stdout).not.toContain("main.test.ts");
    });
  });

  describe("Exclude strings (-S)", () => {
    test("excludes files containing specific strings", async () => {
      const { stdout, code } = await runCLI(["-s", "function", "-S", "unused", "-e", "ts", "--preview"], testDir);
      expect(code).toBe(0);
      expect(stdout).toContain("main.ts");
      expect(stdout).not.toContain("helper.ts"); // Contains "unused"
    });
  });

  describe("Output generation", () => {
    test("generates XML output by default", async () => {
      const outputFile = path.join(testDir, "output.xml");
      const { code } = await runCLI(["-s", "TODO", "-e", "ts", "-o", outputFile], testDir);
      expect(code).toBe(0);

      const content = await fs.readFile(outputFile, "utf8");
      expect(content).toContain("<file_summary>");
      expect(content).toContain("<files>");
      expect(content).toContain('<file path="');
      expect(content).toContain("TODO");
    });

    test("generates Markdown output with --style markdown", async () => {
      const outputFile = path.join(testDir, "output.md");
      const { code } = await runCLI(["-s", "TODO", "-e", "ts", "-o", outputFile, "--style", "markdown"], testDir);
      expect(code).toBe(0);

      const content = await fs.readFile(outputFile, "utf8");
      expect(content).toContain("# Packx Output");
      expect(content).toContain("```ts");
      expect(content).toContain("TODO");
    });

    test("summary only mode without -o", async () => {
      const { stdout, code } = await runCLI(["-s", "TODO", "-e", "ts"], testDir);
      expect(code).toBe(0);
      expect(stdout).toContain("Pack Summary");
      expect(stdout).toContain("Total Files");
      expect(stdout).toContain("Total Tokens");
    });
  });

  describe("Context lines", () => {
    test("extracts context around matches with -l", async () => {
      const outputFile = path.join(testDir, "context.xml");
      const { code } = await runCLI(["-s", "TODO", "-e", "ts", "-l", "2", "-o", outputFile], testDir);
      expect(code).toBe(0);

      const content = await fs.readFile(outputFile, "utf8");
      expect(content).toContain("matches=");
      expect(content).toContain("windows=");
    });
  });

  describe("Binary file handling", () => {
    test("skips binary files", async () => {
      const { stdout, code } = await runCLI(["--preview"], testDir);
      expect(code).toBe(0);
      expect(stdout).not.toContain("binary.dat");
    });
  });

  describe(".gitignore support", () => {
    test("respects .gitignore patterns", async () => {
      const { stdout, code } = await runCLI(["-e", "ts", "--preview"], testDir);
      expect(code).toBe(0);
      expect(stdout).not.toContain("node_modules");
    });
  });

  describe("Regex mode", () => {
    test("uses raw regex with -R flag", async () => {
      const { stdout, code } = await runCLI(["-s", "function\\s+\\w+", "-R", "-e", "ts", "--preview"], testDir);
      expect(code).toBe(0);
      expect(stdout).toContain("main.ts");
      expect(stdout).toContain("helper.ts");
    });
  });

  describe("Token counting", () => {
    test("shows accurate token counts", async () => {
      const { stdout, code } = await runCLI(["-s", "TODO", "-e", "ts"], testDir);
      expect(code).toBe(0);
      expect(stdout).toMatch(/Total Tokens:.*\d+/);
    });
  });

  describe("Related files", () => {
    test("finds related files with -r", async () => {
      const { stdout, code } = await runCLI(["main.ts", "-r", "--preview"], testDir);
      expect(code).toBe(0);
      expect(stdout).toContain("main.ts");
      expect(stdout).toContain("main.test.ts");
    });
  });

  describe("Error handling", () => {
    test("exits with error for non-existent directory", async () => {
      const { code } = await runCLI(["-s", "test", "/nonexistent/path/12345"]);
      expect(code).not.toBe(0);
    });

    test("shows warning when no files match", async () => {
      const { stdout, stderr, code } = await runCLI(["-s", "XYZZY_NONEXISTENT_STRING_12345", "-e", "ts"], testDir);
      expect(code).toBe(3);
      // Warning could be in stdout or stderr depending on output mode
      const output = stdout + stderr;
      expect(output).toContain("No files matched");
    });
  });
});

// Config file tests removed - INI config support has been replaced with .packignore
