/**
 * Core logic functions for packx - extracted for testability
 * This module re-exports from specialized modules for backward compatibility
 */

import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import * as path from "node:path";

// Re-export from new modules
export {
  findAllMatches,
  extractContextWindows,
  formatContextWindows,
  escRegex,
  buildPattern,
  type MatchPosition,
  type ContextWindow
} from "./context.js";

export {
  countTokens,
  countTokensHeuristic,
  isBinaryFile,
  isBinaryContent,
  analyzeFile,
  formatTokenCount,
  getTokenWarning,
  type FileAnalysis
} from "./analysis.js";

export {
  scanDirectory,
  filterByContent,
  applyMatchers,
  hasGlobChars,
  expandPattern,
  loadGitignore,
  DEFAULT_IGNORE_PATTERNS
} from "./scanner.js";

export {
  StreamFormatter,
  StringBufferStream,
  formatToString,
  formatFile,
  createHeader,
  createFooter,
  type OutputStyle,
  type FormatOptions,
  type FileStats
} from "./formatter.js";

export {
  parseArgs,
  printHelp,
  type Argv
} from "./cli.js";

// Type definitions for backward compatibility
export type ParsedConfig = {
  search: string[];
  extensions: string[];
  exclude: string[];
  files: string[];  // Explicit file paths from [files] section
};

/**
 * Parse comma-separated values into an array
 */
export function parseCSV(input?: string): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Convert extension array to a Set with leading dots
 */
export function toExtSet(exts: string[]): Set<string> {
  const s = new Set<string>();
  for (const e of exts) {
    const dot = e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`;
    s.add(dot);
  }
  return s;
}

/**
 * Check if file contains any of the search strings (and none of the exclude strings)
 */
export async function fileContainsAnyStrings(
  absPath: string,
  pattern?: RegExp | null,
  excludePattern?: RegExp | null
): Promise<boolean> {
  const { isBinaryFile } = await import("./analysis.js");

  try {
    const stat = await fs.stat(absPath);
    // Skip extremely large files (> 10MB)
    if (stat.size > 10 * 1024 * 1024) return false;

    // Skip binary files
    if (await isBinaryFile(absPath)) return false;

    const buf = await fs.readFile(absPath, "utf8");

    // First check if file contains excluded strings
    if (excludePattern && excludePattern.test(buf)) {
      return false;
    }

    // Then check if file contains required strings (if provided)
    return pattern ? pattern.test(buf) : true;
  } catch {
    return false;
  }
}

/**
 * Check if content matches pattern (sync version for testing)
 */
export function contentContainsStrings(
  content: string,
  pattern?: RegExp | null,
  excludePattern?: RegExp | null
): boolean {
  // First check if content contains excluded strings
  if (excludePattern && excludePattern.test(content)) {
    return false;
  }

  // Then check if content contains required strings (if provided)
  return pattern ? pattern.test(content) : true;
}

/**
 * Build passthrough arguments for repomix from parsed CLI args
 */
export function buildRepomixPassthroughArgs(parsed: Record<string, any>): string[] {
  const passthrough: string[] = [];
  const reserved = new Set([
    "_",
    "strings",
    "exclude-strings",
    "extensions",
    "exclude-extensions",
    "file",
    "lines",
    "prompt",
    "prompt-path",
    "include",
    "ignore",
    "i",
    "case-sensitive",
    "copy",
    "c",
    "s",
    "S",
    "e",
    "x",
    "f",
    "l",
    "p",
    "P",
    "C",
    "stdout",
    "preview",
    "help",
    "h",
    "version",
    "v",
    "regex",
    "R",
    "smart-context"
  ]);

  for (const [key, val] of Object.entries(parsed)) {
    if (reserved.has(key)) continue;
    if (val === undefined) continue;

    const flag = key.length === 1 ? `-${key}` : `--${key}`;

    if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === "boolean") {
          if (v) passthrough.push(flag);
        } else {
          passthrough.push(flag, String(v));
        }
      }
    } else if (typeof val === "boolean") {
      if (val) passthrough.push(flag);
    } else {
      passthrough.push(flag, String(val));
    }
  }

  return passthrough;
}

/**
 * Normalize strings to array
 */
export function normalizeStrings(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

/**
 * Parse config file in INI-like format
 */
export async function parseConfigFile(filePath: string): Promise<ParsedConfig> {
  const content = await fs.readFile(filePath, 'utf8');
  return parseConfigContent(content);
}

/**
 * Parse config content (sync version for testing)
 */
export function parseConfigContent(content: string): ParsedConfig {
  const config: ParsedConfig = {
    search: [],
    extensions: [],
    exclude: [],
    files: []
  };

  const lines = content.split('\n');
  let currentSection: 'search' | 'extensions' | 'exclude' | 'files' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check for section headers
    if (trimmed === '[search]' || trimmed === '[strings]') {
      currentSection = 'search';
      continue;
    }
    if (trimmed === '[extensions]' || trimmed === '[include]') {
      currentSection = 'extensions';
      continue;
    }
    if (trimmed === '[exclude]' || trimmed === '[exclude-extensions]' || trimmed === '[ignore]') {
      currentSection = 'exclude';
      continue;
    }
    if (trimmed === '[files]') {
      currentSection = 'files';
      continue;
    }

    // Add line to current section
    if (currentSection) {
      config[currentSection].push(trimmed);
    }
  }

  return config;
}

/**
 * Get default extensions when none specified
 */
export function getDefaultExtensions(): Set<string> {
  return toExtSet([
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
    'py', 'rb', 'go', 'java', 'cpp', 'c', 'h',
    'rs', 'swift', 'kt', 'scala', 'php',
    'vue', 'svelte', 'astro',
    'css', 'scss', 'less',
    'json', 'yaml', 'yml', 'toml', 'xml',
    'md', 'mdx', 'txt',
    'sh', 'bash', 'zsh', 'fish',
    'sql', 'graphql', 'gql'
  ]);
}

/**
 * Convert extension patterns to gitignore-style patterns
 */
export function extensionToGlobPattern(ext: string): string {
  // If it looks like an extension, convert to gitignore pattern
  if (!ext.includes('/') && !ext.includes('*')) {
    return `**/*.${ext.replace(/^\./, '')}`;
  }
  return ext;
}

// ============================================================================
// Git-Aware Context Functions
// ============================================================================

/**
 * Execute a git command and return stdout as array of lines
 */
async function execGit(args: string[], cwd?: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, {
      cwd: cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => (stdout += data.toString()));
    proc.stderr.on("data", (data) => (stderr += data.toString()));

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr}`));
      } else {
        resolve(
          stdout
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
        );
      }
    });

    proc.on("error", reject);
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

// ============================================================================
// Related Files Discovery
// ============================================================================

/**
 * Find related files for a given file path
 */
export async function findRelatedFiles(
  filePath: string,
  existingFiles?: Set<string>
): Promise<string[]> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const basename = path.basename(filePath, ext);
  const baseParts = basename.split(".");
  const coreName = baseParts[0];

  const related: string[] = [];

  try {
    const entries = await fs.readdir(dir);

    for (const entry of entries) {
      const entryPath = path.join(dir, entry);

      if (entryPath === filePath) continue;
      if (existingFiles?.has(entryPath)) continue;

      const entryExt = path.extname(entry);
      const entryBasename = path.basename(entry, entryExt);
      const entryCoreName = entryBasename.split(".")[0];

      if (entryCoreName === coreName) {
        try {
          const stat = await fs.stat(entryPath);
          if (stat.isFile()) {
            related.push(entryPath);
          }
        } catch {
          // Skip if can't stat
        }
      }
    }
  } catch {
    // Directory read failed
  }

  return related;
}

/**
 * Expand a list of files to include their related files
 */
export async function expandWithRelatedFiles(
  files: string[]
): Promise<string[]> {
  const existing = new Set(files);
  const expanded = [...files];

  for (const file of files) {
    const related = await findRelatedFiles(file, existing);
    for (const r of related) {
      if (!existing.has(r)) {
        existing.add(r);
        expanded.push(r);
      }
    }
  }

  return expanded;
}
