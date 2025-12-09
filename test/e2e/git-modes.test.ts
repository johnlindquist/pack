/**
 * E2E tests for git mode functionality (--staged, --diff, --dirty)
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { runCLI, getFixturePath } from "./helpers";

describe("E2E: Git modes", () => {
  const gitPath = getFixturePath("git-project");

  // Helper to run git commands in the fixture
  function git(command: string) {
    execSync(`git ${command}`, { cwd: gitPath, encoding: "utf8" });
  }

  // Helper to get git output
  function gitOutput(command: string): string {
    return execSync(`git ${command}`, { cwd: gitPath, encoding: "utf8" });
  }

  beforeEach(() => {
    // Ensure we're on main branch and clean
    try {
      // Delete any feature branches
      const branches = gitOutput("branch").split("\n").map(b => b.trim().replace(/^\*\s*/, ""));
      for (const branch of branches) {
        if (branch && branch !== "main" && branch !== "master") {
          try {
            git(`branch -D ${branch}`);
          } catch {
            // Ignore if can't delete
          }
        }
      }

      // Switch to main and clean
      git("checkout main 2>/dev/null || git checkout -b main");
      git("reset --hard HEAD");
      git("clean -fd");
    } catch {
      // Ignore errors if branch doesn't exist yet
    }
  });

  afterEach(() => {
    // Clean up any changes and branches
    try {
      git("checkout main 2>/dev/null || true");
      git("reset --hard HEAD");
      git("clean -fd");

      // Delete test branches
      const branches = gitOutput("branch").split("\n").map(b => b.trim().replace(/^\*\s*/, ""));
      for (const branch of branches) {
        if (branch && branch !== "main" && branch !== "master") {
          try {
            git(`branch -D ${branch}`);
          } catch {
            // Ignore if can't delete
          }
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("--staged mode", () => {
    test("finds only staged files", async () => {
      // Modify a file and stage it
      const mainPath = path.join(gitPath, "main.ts");
      const content = await fs.readFile(mainPath, "utf8");
      await fs.writeFile(mainPath, content + "\n// Staged change\n");
      git("add main.ts");

      // Modify another file but don't stage it
      const processorPath = path.join(gitPath, "src/processor.ts");
      const procContent = await fs.readFile(processorPath, "utf8");
      await fs.writeFile(processorPath, procContent + "\n// Unstaged change\n");

      const { stdout, code } = await runCLI(["--staged", "--preview"], { cwd: gitPath });
      expect(code).toBe(0);
      expect(stdout).toContain("main.ts");
      expect(stdout).not.toContain("processor.ts");
    });

    test("exits with 2 when no files staged", async () => {
      const { code } = await runCLI(["--staged", "--preview"], { cwd: gitPath });
      expect(code).toBe(2);
    });

    test("combines --staged with -s search", async () => {
      // Create and stage a file with TODO
      const newFile = path.join(gitPath, "new.ts");
      await fs.writeFile(newFile, "// TODO: implement\nexport function test() {}");
      git("add new.ts");

      const { stdout, code } = await runCLI(["--staged", "-s", "TODO", "--preview"], { cwd: gitPath });
      expect(code).toBe(0);
      expect(stdout).toContain("new.ts");
    });

    test("combines --staged with -e extension filter", async () => {
      // Stage a .ts file
      const mainPath = path.join(gitPath, "main.ts");
      const content = await fs.readFile(mainPath, "utf8");
      await fs.writeFile(mainPath, content + "\n// Change\n");
      git("add main.ts");

      // Stage a .md file
      const readmePath = path.join(gitPath, "README.md");
      const readmeContent = await fs.readFile(readmePath, "utf8");
      await fs.writeFile(readmePath, readmeContent + "\nChange\n");
      git("add README.md");

      const { stdout, code } = await runCLI(["--staged", "-e", "ts", "--preview"], { cwd: gitPath });
      expect(code).toBe(0);
      expect(stdout).toContain("main.ts");
      expect(stdout).not.toContain("README.md");
    });
  });

  describe("--dirty mode", () => {
    test("finds modified and untracked files", async () => {
      // Modify an existing file
      const mainPath = path.join(gitPath, "main.ts");
      const content = await fs.readFile(mainPath, "utf8");
      await fs.writeFile(mainPath, content + "\n// Modified\n");

      // Create an untracked file
      const newFile = path.join(gitPath, "untracked.ts");
      await fs.writeFile(newFile, "// New file\nexport const x = 1;");

      const { stdout, code } = await runCLI(["--dirty", "--preview"], { cwd: gitPath });
      expect(code).toBe(0);
      expect(stdout).toContain("main.ts");
      expect(stdout).toContain("untracked.ts");
    });

    test("does not include only-staged files (must have unstaged changes)", async () => {
      // Modify and stage a file completely
      const mainPath = path.join(gitPath, "main.ts");
      const content = await fs.readFile(mainPath, "utf8");
      await fs.writeFile(mainPath, content + "\n// Staged change\n");
      git("add main.ts");

      // dirty mode should not show files with only staged changes
      const { code } = await runCLI(["--dirty", "--preview"], { cwd: gitPath });
      expect(code).toBe(2); // No dirty files
    });

    test("exits with 2 when no dirty files", async () => {
      const { code } = await runCLI(["--dirty", "--preview"], { cwd: gitPath });
      expect(code).toBe(2);
    });

    test("combines --dirty with search filters", async () => {
      // Create untracked file with TODO
      const todoFile = path.join(gitPath, "todo.ts");
      await fs.writeFile(todoFile, "// TODO: implement\nexport const todo = true;");

      // Create untracked file without TODO
      const otherFile = path.join(gitPath, "other.ts");
      await fs.writeFile(otherFile, "export const other = false;");

      const { stdout, code } = await runCLI(["--dirty", "-s", "TODO", "--preview"], { cwd: gitPath });
      expect(code).toBe(0);
      expect(stdout).toContain("todo.ts");
      expect(stdout).not.toContain("other.ts");
    });
  });

  describe("--diff mode", () => {
    test("finds files changed vs main branch", async () => {
      // Create a feature branch
      git("checkout -b feature-branch");

      // Modify a file
      const mainPath = path.join(gitPath, "main.ts");
      const content = await fs.readFile(mainPath, "utf8");
      await fs.writeFile(mainPath, content + "\n// Feature change\n");
      git("add .");
      git("commit -m 'Feature commit'");

      const { stdout, code } = await runCLI(["--diff", "--preview"], { cwd: gitPath });
      expect(code).toBe(0);
      expect(stdout).toContain("main.ts");
    });

    test("exits with 2 when no diff vs main", async () => {
      // On main branch with no changes
      const { code } = await runCLI(["--diff", "--preview"], { cwd: gitPath });
      expect(code).toBe(2);
    });

    test("combines --diff with filters", async () => {
      // Create feature branch
      git("checkout -b test-branch");

      // Add file with TODO
      const todoFile = path.join(gitPath, "feature.ts");
      await fs.writeFile(todoFile, "// TODO: test\nexport const feature = 1;");
      git("add .");
      git("commit -m 'Add feature'");

      const { stdout, code } = await runCLI(["--diff", "-s", "TODO", "--preview"], { cwd: gitPath });
      expect(code).toBe(0);
      expect(stdout).toContain("feature.ts");
    });
  });

  describe("Git mode edge cases", () => {
    test("handles deleted files gracefully in --staged", async () => {
      // Delete a file and stage the deletion
      git("rm src/helpers.ts");

      // Modify another file and stage it
      const mainPath = path.join(gitPath, "main.ts");
      const content = await fs.readFile(mainPath, "utf8");
      await fs.writeFile(mainPath, content + "\n// Change\n");
      git("add main.ts");

      const { stdout, code } = await runCLI(["--staged", "--preview"], { cwd: gitPath });
      expect(code).toBe(0);
      expect(stdout).toContain("main.ts");
      expect(stdout).not.toContain("helpers.ts");
    });

    test("respects .gitignore in git modes", async () => {
      // Create a file in node_modules (should be ignored)
      const nodeModulesPath = path.join(gitPath, "node_modules");
      await fs.mkdir(nodeModulesPath, { recursive: true });
      const ignoredFile = path.join(nodeModulesPath, "test.ts");
      await fs.writeFile(ignoredFile, "// Should be ignored");

      const { stdout } = await runCLI(["--dirty", "--preview"], { cwd: gitPath });
      expect(stdout).not.toContain("node_modules");
    });
  });
});
