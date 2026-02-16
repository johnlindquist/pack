/**
 * E2E tests for -i (include) glob with external directories
 *
 * Validates that include patterns work correctly when the target
 * directory is outside the current working directory.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runCLI } from "./helpers";

describe("include patterns with external directories", () => {
  let extDir: string;

  beforeAll(async () => {
    extDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-ext-dir-test-"));

    // Create a realistic file structure
    await fs.mkdir(path.join(extDir, "src"), { recursive: true });
    await fs.mkdir(path.join(extDir, "src", "utils"), { recursive: true });

    await fs.writeFile(path.join(extDir, "index.ts"), 'import { greet } from "./src/greet";\nconsole.log(greet("world"));\n');
    await fs.writeFile(path.join(extDir, "src", "greet.ts"), 'export function greet(name: string) { return `Hello ${name}`; }\n');
    await fs.writeFile(path.join(extDir, "src", "utils", "format.ts"), 'export function format(s: string) { return s.trim(); }\n');
    await fs.writeFile(path.join(extDir, "config.json"), '{ "name": "test" }\n');
    await fs.writeFile(path.join(extDir, "README.md"), "# Test Project\n");
  });

  afterAll(async () => {
    await fs.rm(extDir, { recursive: true, force: true });
  });

  test("-i '**/*.ts' finds .ts files in external directory", async () => {
    const { stdout, code } = await runCLI(
      ["--preview", "-i", "**/*.ts", "--no-interactive", extDir]
    );

    expect(code).toBe(0);
    expect(stdout).toContain("index.ts");
    expect(stdout).toContain("greet.ts");
    expect(stdout).toContain("format.ts");
    expect(stdout).not.toContain("config.json");
    expect(stdout).not.toContain("README.md");
  });

  test("no -i flag finds all default file types in external directory", async () => {
    const { stdout, code } = await runCLI(
      ["--preview", "--no-interactive", extDir]
    );

    expect(code).toBe(0);
    expect(stdout).toContain("index.ts");
    expect(stdout).toContain("config.json");
    expect(stdout).toContain("README.md");
  });

  test("-i '**/*.ts' combined with -s finds matching .ts files", async () => {
    const { stdout, code } = await runCLI(
      ["--preview", "-i", "**/*.ts", "-s", "greet", "--no-interactive", extDir]
    );

    expect(code).toBe(0);
    expect(stdout).toContain("index.ts");
    expect(stdout).toContain("greet.ts");
    expect(stdout).not.toContain("format.ts");
    expect(stdout).not.toContain("config.json");
  });

  test("-i with subdirectory glob works on external directory", async () => {
    const { stdout, code } = await runCLI(
      ["--preview", "-i", "src/**/*.ts", "--no-interactive", extDir]
    );

    expect(code).toBe(0);
    expect(stdout).toContain("greet.ts");
    expect(stdout).toContain("format.ts");
    expect(stdout).not.toContain("index.ts");
    expect(stdout).not.toContain("config.json");
  });
});
