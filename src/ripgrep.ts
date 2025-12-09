/**
 * High-performance file search using ripgrep (rg)
 * Provides a wrapper around ripgrep for faster file discovery and content search
 */

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as readline from "node:readline";
import * as path from "node:path";
import { DEFAULT_IGNORE_PATTERNS } from "./scanner.js";

export type RipgrepSearchOptions = {
  /** Root directory to search in */
  root: string;
  /** File extensions to include (e.g., ['.ts', '.tsx']) */
  extensions: Set<string>;
  /** Patterns to exclude (gitignore-style) */
  excludePatterns: string[];
  /** Search pattern to find in file content (null = list all files) */
  contentPattern: string | null;
  /** Pattern to exclude files containing this content */
  excludeContentPattern: string | null;
  /** Case-sensitive search */
  caseSensitive: boolean;
  /** Treat patterns as regex */
  useRegex: boolean;
  /** Respect .gitignore files (default: true) */
  useGitignore?: boolean;
};

export type RipgrepResult = {
  /** List of matching file paths (absolute) */
  files: string[];
  /** Whether ripgrep was available and used */
  usedRipgrep: boolean;
  /** Error message if ripgrep failed */
  error?: string;
};

/**
 * Check if ripgrep is available on the system
 */
export async function isRipgrepAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("rg", ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Get the ripgrep version string
 */
export async function getRipgrepVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn("rg", ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    proc.stdout?.on("data", (data) => {
      output += data.toString();
    });

    proc.on("error", () => resolve(null));
    proc.on("close", (code) => {
      if (code === 0) {
        // Extract version from "ripgrep X.Y.Z" line
        const match = output.match(/ripgrep\s+([\d.]+)/);
        resolve(match ? match[1] : output.trim().split("\n")[0]);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Build ripgrep command arguments for file discovery
 */
async function buildRipgrepArgs(options: RipgrepSearchOptions): Promise<string[]> {
  const args: string[] = [];

  // Gitignore handling (must come early)
  if (options.useGitignore !== false) {
    // ripgrep respects .gitignore by default
  } else {
    args.push("--no-ignore");
  }

  // Check for .packignore file and add it if it exists (early in args list)
  const packignorePath = path.join(path.resolve(options.root), '.packignore');
  try {
    await fs.access(packignorePath);
    args.push("--ignore-file", packignorePath);
  } catch {
    // No .packignore file - continue without it
  }

  // Output mode: files only (no line content)
  args.push("--files-with-matches");

  // No line numbers (just file paths)
  args.push("--no-line-number");

  // Follow symlinks
  args.push("--follow");

  // Case sensitivity
  if (!options.caseSensitive) {
    args.push("--ignore-case");
  } else {
    args.push("--case-sensitive");
  }

  // Skip binary files
  args.push("--binary");

  // Note: We don't use --glob for extensions because it overrides --ignore-file
  // Instead, we filter by extension after ripgrep returns results
  // Only add default and user exclude patterns as negative globs

  // Add default exclude patterns
  for (const pattern of DEFAULT_IGNORE_PATTERNS) {
    // Convert glob patterns to ripgrep glob format
    args.push("--glob", `!${pattern}`);
  }

  // Add user exclude patterns
  for (const pattern of options.excludePatterns) {
    // Ensure pattern is negated for exclusion
    const negatedPattern = pattern.startsWith("!") ? pattern : `!${pattern}`;
    args.push("--glob", negatedPattern);
  }

  // Search pattern
  if (options.contentPattern) {
    if (options.useRegex) {
      args.push(options.contentPattern);
    } else {
      // Use fixed-strings mode for literal search
      args.push("--fixed-strings");
      args.push(options.contentPattern);
    }
  } else {
    // No content pattern: use empty pattern to list all files
    // Use --files to just list files when no content search needed
    // Remove --files-with-matches and use --files instead
    const fwmIndex = args.indexOf("--files-with-matches");
    if (fwmIndex !== -1) {
      args.splice(fwmIndex, 1);
    }
    args.push("--files");
  }

  // Add search path
  args.push(options.root);

  return args;
}

/**
 * Search for files using ripgrep
 * This combines file discovery (by extension/glob) and content search into a single rg call
 */
export async function ripgrepSearch(
  options: RipgrepSearchOptions
): Promise<RipgrepResult> {
  // Check if ripgrep is available
  const available = await isRipgrepAvailable();
  if (!available) {
    return {
      files: [],
      usedRipgrep: false,
      error: "ripgrep (rg) is not available on this system",
    };
  }

  const args = await buildRipgrepArgs(options);

  // Debug: log the command being run (commented out for production)
  // console.error("DEBUG ripgrep command:", "rg", args.join(" "));

  return new Promise((resolve) => {
    const proc = spawn("rg", args, {
      cwd: options.root,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const files: string[] = [];
    let stderr = "";

    // Stream stdout line-by-line to prevent memory exhaustion
    const rl = readline.createInterface({
      input: proc.stdout,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (trimmed) {
        // Ensure absolute paths
        const file = path.isAbsolute(trimmed)
          ? trimmed
          : path.resolve(options.root, trimmed);
        files.push(file);
      }
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      rl.close();
      resolve({
        files: [],
        usedRipgrep: false,
        error: `Failed to spawn ripgrep: ${err.message}`,
      });
    });

    proc.on("close", (code) => {
      rl.close();
      // ripgrep returns 0 for matches, 1 for no matches, 2 for errors
      if (code === 2) {
        resolve({
          files: [],
          usedRipgrep: true,
          error: stderr.trim() || "ripgrep returned an error",
        });
        return;
      }

      // Filter by extensions (since we don't use --glob for extensions)
      let filteredFiles = files;
      if (options.extensions.size > 0) {
        filteredFiles = files.filter((file) => {
          const ext = path.extname(file).toLowerCase();
          return options.extensions.has(ext) || options.extensions.has(ext.slice(1));
        });
      }

      resolve({
        files: filteredFiles,
        usedRipgrep: true,
      });
    });
  });
}

/**
 * Search for files matching multiple content patterns using ripgrep
 * This is useful when you need to find files containing ANY of multiple patterns
 */
export async function ripgrepSearchMultiple(
  options: Omit<RipgrepSearchOptions, "contentPattern"> & {
    contentPatterns: string[];
  }
): Promise<RipgrepResult> {
  if (options.contentPatterns.length === 0) {
    // No patterns: just list files by extension
    return ripgrepSearch({
      ...options,
      contentPattern: null,
      excludeContentPattern: null,
    });
  }

  // Build a combined regex pattern using alternation
  const combinedPattern = options.useRegex
    ? options.contentPatterns.join("|")
    : options.contentPatterns.map(escapeRegex).join("|");

  return ripgrepSearch({
    ...options,
    contentPattern: combinedPattern,
    useRegex: true, // Force regex mode for combined pattern
  });
}

/**
 * Filter files by content patterns that should NOT be present
 * Used for --exclude-strings functionality
 */
export async function ripgrepExcludeContent(
  files: string[],
  excludePattern: string,
  caseSensitive: boolean,
  useRegex: boolean
): Promise<string[]> {
  if (files.length === 0) {
    return [];
  }

  const available = await isRipgrepAvailable();
  if (!available) {
    return files; // Can't filter, return all files
  }

  // Use ripgrep to find files that match the exclude pattern
  const args: string[] = [
    "--files-with-matches",
    "--no-line-number",
  ];

  if (!caseSensitive) {
    args.push("--ignore-case");
  }

  if (!useRegex) {
    args.push("--fixed-strings");
  }

  args.push(excludePattern);
  args.push(...files);

  return new Promise((resolve) => {
    const proc = spawn("rg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const matchedFiles = new Set<string>();

    // Stream stdout line-by-line to prevent memory exhaustion
    const rl = readline.createInterface({
      input: proc.stdout,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (trimmed) {
        matchedFiles.add(trimmed);
      }
    });

    proc.on("error", () => {
      rl.close();
      // On error, return all files (can't filter)
      resolve(files);
    });

    proc.on("close", () => {
      rl.close();
      // Return files that did NOT match the exclude pattern
      const filtered = files.filter((f) => !matchedFiles.has(f));
      resolve(filtered);
    });
  });
}

/**
 * Escape special regex characters for literal string matching
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * High-level function to discover files using ripgrep
 * Combines extension filtering, gitignore handling, and content search
 */
export async function discoverFilesWithRipgrep(
  root: string,
  extensions: Set<string>,
  excludePatterns: string[],
  searchStrings: string[],
  excludeStrings: string[],
  caseSensitive: boolean,
  useRegex: boolean,
  useGitignore: boolean = true
): Promise<RipgrepResult> {
  // First pass: find files matching extensions and content pattern
  const result = await ripgrepSearchMultiple({
    root,
    extensions,
    excludePatterns,
    contentPatterns: searchStrings,
    excludeContentPattern: null,
    caseSensitive,
    useRegex,
    useGitignore,
  });

  if (!result.usedRipgrep || result.error || result.files.length === 0) {
    return result;
  }

  // Second pass: exclude files containing exclude strings
  if (excludeStrings.length > 0) {
    const excludePattern = useRegex
      ? excludeStrings.join("|")
      : excludeStrings.map(escapeRegex).join("|");

    const filteredFiles = await ripgrepExcludeContent(
      result.files,
      excludePattern,
      caseSensitive,
      true // Use regex for combined exclude pattern
    );

    return {
      files: filteredFiles,
      usedRipgrep: true,
    };
  }

  return result;
}
