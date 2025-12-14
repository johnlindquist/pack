/**
 * Generic utility functions for packx
 * Low-level helpers with no domain-specific dependencies
 */

import { promises as fs } from "node:fs";

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
 * Normalize strings to array
 */
export function normalizeStrings(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
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
 * Check if file contains any of the search strings (and none of the exclude strings)
 */
export async function fileContainsAnyStrings(
  absPath: string,
  pattern?: RegExp | null,
  excludePattern?: RegExp | null,
  isBinaryFile?: (path: string) => Promise<boolean>
): Promise<boolean> {
  try {
    const stat = await fs.stat(absPath);
    // Skip extremely large files (> 10MB)
    if (stat.size > 10 * 1024 * 1024) return false;

    // Skip binary files if checker provided
    if (isBinaryFile && await isBinaryFile(absPath)) return false;

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
 * Escape regex special characters for safe substring search
 */
export function escRegex(lit: string): string {
  return lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Result from buildPattern including validation errors
 */
export type PatternResult = {
  pattern: RegExp | null;
  error?: string;
};

/**
 * Build regex pattern from search strings with validation
 * Returns both the pattern and any validation error
 */
export function buildPatternSafe(
  strings: string[],
  caseSensitive: boolean,
  useRawRegex: boolean
): PatternResult {
  if (strings.length === 0) return { pattern: null };

  const flags = caseSensitive ? "" : "i";

  try {
    if (useRawRegex) {
      // Use strings as-is (raw regex) - validate each pattern first
      for (const s of strings) {
        new RegExp(s); // Throws if invalid
      }
      return { pattern: new RegExp(strings.join("|"), flags) };
    } else {
      // Escape for literal matching - always safe
      return { pattern: new RegExp(strings.map(escRegex).join("|"), flags) };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { pattern: null, error: `Invalid regex pattern: ${message}` };
  }
}

/**
 * Build regex pattern from search strings
 * @throws Error if regex pattern is invalid (when useRawRegex is true)
 */
export function buildPattern(
  strings: string[],
  caseSensitive: boolean,
  useRawRegex: boolean
): RegExp | null {
  const result = buildPatternSafe(strings, caseSensitive, useRawRegex);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.pattern;
}
