import { promises as fs } from "node:fs";

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
