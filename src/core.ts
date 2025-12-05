import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import * as path from "node:path";

/**
 * Core logic functions for packx - extracted for testability
 */

// Type definitions
export type MatchPosition = {
  line: number;
  column: number;
  match: string;
};

export type ContextWindow = {
  startLine: number;
  endLine: number;
  lines: string[];
  matches: MatchPosition[];
};

export type ParsedConfig = {
  search: string[];
  extensions: string[];
  exclude: string[];
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
 * Escape regex special characters for safe substring search
 */
export function escRegex(lit: string): string {
  return lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find all matches of a pattern in content, returning line/column positions
 */
export function findAllMatches(content: string, pattern: RegExp): MatchPosition[] {
  const lines = content.split('\n');
  const matches: MatchPosition[] = [];

  lines.forEach((line, lineIndex) => {
    let match;
    const linePattern = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g');
    while ((match = linePattern.exec(line)) !== null) {
      matches.push({
        line: lineIndex + 1, // 1-based line numbers
        column: match.index,
        match: match[0]
      });
    }
  });

  return matches;
}

/**
 * Extract context windows around pattern matches
 */
export function extractContextWindows(
  content: string,
  pattern: RegExp,
  contextLines: number
): ContextWindow[] {
  const lines = content.split('\n');
  const matches = findAllMatches(content, pattern);

  if (matches.length === 0) return [];

  // Create initial windows
  const windows: ContextWindow[] = [];

  for (const match of matches) {
    const startLine = Math.max(1, match.line - contextLines);
    const endLine = Math.min(lines.length, match.line + contextLines);

    windows.push({
      startLine,
      endLine,
      lines: lines.slice(startLine - 1, endLine),
      matches: [match]
    });
  }

  // Merge overlapping windows
  const merged: ContextWindow[] = [];
  let current: ContextWindow | null = null;

  for (const window of windows) {
    if (!current) {
      current = window;
    } else if (window.startLine <= current.endLine + 1) {
      // Merge windows
      current.endLine = Math.max(current.endLine, window.endLine);
      current.lines = lines.slice(current.startLine - 1, current.endLine);
      current.matches.push(...window.matches);
    } else {
      // Start new window
      merged.push(current);
      current = window;
    }
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}

/**
 * Format context windows for output with line numbers
 */
export function formatContextWindows(windows: ContextWindow[], filePath: string): string {
  if (windows.length === 0) return '';

  let output = '';
  for (const window of windows) {
    // Add separator between windows
    if (output) {
      output += '\n  ...\n';
    }

    // Add lines with line numbers
    window.lines.forEach((line, index) => {
      const lineNum = window.startLine + index;
      output += `${String(lineNum).padStart(6, ' ')}| ${line}\n`;
    });
  }

  return output;
}

/**
 * Check if file contains any of the search strings (and none of the exclude strings)
 */
export async function fileContainsAnyStrings(
  absPath: string,
  pattern?: RegExp | null,
  excludePattern?: RegExp | null
): Promise<boolean> {
  try {
    const stat = await fs.stat(absPath);
    // Skip extremely large files (> 10MB)
    if (stat.size > 10 * 1024 * 1024) return false;

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
  const config: ParsedConfig = {
    search: [],
    extensions: [],
    exclude: []
  };

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
    exclude: []
  };

  const lines = content.split('\n');
  let currentSection: 'search' | 'extensions' | 'exclude' | null = null;

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

/**
 * Check if a pattern has glob characters
 */
export function hasGlobChars(s: string): boolean {
  return /[\*\?\[\]\{\}!]/.test(s);
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
    // Try to get the default branch from remote origin
    const lines = await execGit(
      ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
      cwd
    );
    if (lines.length > 0) {
      // Returns something like "origin/main", extract just "main"
      return lines[0].replace(/^origin\//, "");
    }
  } catch {
    // Fallback: check if main or master exists
    try {
      await execGit(["rev-parse", "--verify", "main"], cwd);
      return "main";
    } catch {
      try {
        await execGit(["rev-parse", "--verify", "master"], cwd);
        return "master";
      } catch {
        // Last resort
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
  // Get both modified and untracked files
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

  // Get the merge base between current branch and base branch
  let mergeBase: string;
  try {
    const lines = await execGit(["merge-base", branch, "HEAD"], cwd);
    mergeBase = lines[0];
  } catch {
    // If merge-base fails, use the branch directly
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
 * Common related file extensions to look for
 */
const RELATED_PATTERNS: Record<string, string[]> = {
  // Test files
  ".ts": [".test.ts", ".spec.ts", ".test.tsx", ".spec.tsx", ".stories.tsx", ".stories.ts"],
  ".tsx": [".test.tsx", ".spec.tsx", ".test.ts", ".spec.ts", ".stories.tsx", ".stories.ts"],
  ".js": [".test.js", ".spec.js", ".test.jsx", ".spec.jsx", ".stories.jsx", ".stories.js"],
  ".jsx": [".test.jsx", ".spec.jsx", ".test.js", ".spec.js", ".stories.jsx", ".stories.js"],
  ".py": ["_test.py", ".test.py", ".spec.py"],
  ".go": ["_test.go"],
  ".rb": ["_spec.rb", ".spec.rb", "_test.rb"],
  ".rs": [".test.rs"],
  // Style files
  ".vue": [".css", ".scss", ".less", ".module.css", ".module.scss"],
  ".svelte": [".css", ".scss", ".module.css"],
  // Config/data files
  ".json": [".schema.json", ".d.ts"],
};

/**
 * Find related files for a given file path
 * Related files share the same basename but have different extensions
 * (e.g., Button.tsx → Button.test.tsx, Button.css, Button.stories.tsx)
 */
export async function findRelatedFiles(
  filePath: string,
  existingFiles?: Set<string>
): Promise<string[]> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const basename = path.basename(filePath, ext);

  // Remove common suffixes to find base name
  // e.g., "Button.test" → "Button", "Button.stories" → "Button"
  const baseParts = basename.split(".");
  const coreName = baseParts[0];

  const related: string[] = [];

  try {
    const entries = await fs.readdir(dir);

    for (const entry of entries) {
      const entryPath = path.join(dir, entry);

      // Skip the original file
      if (entryPath === filePath) continue;

      // Skip if already in the existing set
      if (existingFiles?.has(entryPath)) continue;

      // Check if entry starts with the same core name
      const entryExt = path.extname(entry);
      const entryBasename = path.basename(entry, entryExt);
      const entryCoreName = entryBasename.split(".")[0];

      if (entryCoreName === coreName) {
        // Verify it's a file
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
    // Directory read failed, return empty
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
