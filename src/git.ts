/**
 * Git operations for packx
 * Handles git-aware file discovery (staged, diff, dirty)
 */

import { spawn } from "node:child_process";
import * as readline from "node:readline";
import * as path from "node:path";

/**
 * Execute a git command and return stdout as array of lines
 */
async function execGit(args: string[], cwd?: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, {
      cwd: cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const lines: string[] = [];
    let stderr = "";

    // Stream stdout line-by-line to prevent memory exhaustion
    const rl = readline.createInterface({
      input: proc.stdout,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (trimmed) {
        lines.push(trimmed);
      }
    });

    proc.stderr.on("data", (data) => (stderr += data.toString()));

    proc.on("close", (code) => {
      rl.close();
      if (code !== 0) {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr}`));
      } else {
        resolve(lines);
      }
    });

    proc.on("error", (err) => {
      rl.close();
      reject(err);
    });
  });
}

/**
 * Check if the current directory is a git repository
 */
export async function isGitRepository(cwd?: string): Promise<boolean> {
  try {
    await execGit(["rev-parse", "--is-inside-work-tree"], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the main/master branch name
 */
export async function getMainBranch(cwd?: string): Promise<string> {
  try {
    const lines = await execGit(
      ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
      cwd
    );
    if (lines.length > 0) {
      return lines[0].replace(/^origin\//, "");
    }
  } catch {
    try {
      await execGit(["rev-parse", "--verify", "main"], cwd);
      return "main";
    } catch {
      try {
        await execGit(["rev-parse", "--verify", "master"], cwd);
        return "master";
      } catch {
        return "main";
      }
    }
  }
  return "main";
}

/**
 * Get files that are staged for commit
 */
export async function getGitStagedFiles(cwd?: string): Promise<string[]> {
  const lines = await execGit(
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    cwd
  );
  const root = cwd || process.cwd();
  return lines.map((f) => path.resolve(root, f));
}

/**
 * Get files that have been modified in the working tree (unstaged changes)
 */
export async function getGitDirtyFiles(cwd?: string): Promise<string[]> {
  const modified = await execGit(
    ["diff", "--name-only", "--diff-filter=ACMR"],
    cwd
  );
  const untracked = await execGit(
    ["ls-files", "--others", "--exclude-standard"],
    cwd
  );
  const root = cwd || process.cwd();
  const all = [...new Set([...modified, ...untracked])];
  return all.map((f) => path.resolve(root, f));
}

/**
 * Get files that differ from a base branch (typically main/master)
 */
export async function getGitDiffFiles(
  baseBranch?: string,
  cwd?: string
): Promise<string[]> {
  const branch = baseBranch || (await getMainBranch(cwd));

  let mergeBase: string;
  try {
    const lines = await execGit(["merge-base", branch, "HEAD"], cwd);
    mergeBase = lines[0];
  } catch {
    mergeBase = branch;
  }

  const lines = await execGit(
    ["diff", "--name-only", "--diff-filter=ACMR", mergeBase],
    cwd
  );
  const root = cwd || process.cwd();
  return lines.map((f) => path.resolve(root, f));
}
