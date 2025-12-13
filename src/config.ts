/**
 * Configuration resolution for packx
 * Handles CLI arguments and option merging
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { PackerOptions, Argv, OutputStyle, TransformRule } from "./types.js";
import { parseArgs } from "./cli.js";
import { parseCSV, normalizeStrings, toExtSet, getDefaultExtensions } from "./utils.js";
import { hasGlobChars, expandPattern } from "./scanner.js";

/**
 * Parse a transform rule line in format: pattern = replacement
 * Pattern is treated as regex, replacement is literal string
 * Supports /regex/flags = replacement format for explicit regex with flags
 */
export function parseTransformRule(line: string): TransformRule | null {
  const eqIndex = line.indexOf('=');
  if (eqIndex === -1) return null;

  const patternPart = line.slice(0, eqIndex).trim();
  const replacement = line.slice(eqIndex + 1).trim();

  if (!patternPart) return null;

  try {
    let pattern: RegExp;

    // Check for explicit regex format: /pattern/flags
    const regexMatch = patternPart.match(/^\/(.+)\/([gimsuy]*)$/);
    if (regexMatch) {
      pattern = new RegExp(regexMatch[1], regexMatch[2] || 'g');
    } else {
      // Treat as literal pattern with global flag
      pattern = new RegExp(patternPart, 'g');
    }

    return { pattern, replacement };
  } catch {
    // Invalid regex pattern
    return null;
  }
}

/**
 * Parse a token limit string (e.g., "32k", "128K") into a number
 * - k (lowercase) = multiply by 1000
 * - K (uppercase) = multiply by 1024
 * Returns undefined if parsing fails
 */
export function parseTokenLimit(limitStr: string | undefined): number | undefined {
  if (!limitStr) return undefined;

  const trimmed = limitStr.trim();
  if (!trimmed) return undefined;

  // Check for k/K suffix
  const match = trimmed.match(/^(\d+(?:\.\d+)?)(k|K)?$/);
  if (!match) return undefined;

  const value = parseFloat(match[1]);
  if (isNaN(value)) return undefined;

  const suffix = match[2];
  if (suffix === 'k') {
    return Math.round(value * 1000);
  } else if (suffix === 'K') {
    return Math.round(value * 1024);
  }

  return Math.round(value);
}

/**
 * Generate .packignore content from excluded file patterns
 */
export function generatePackignore(
  excludedFiles: string[],
  cwd: string
): string {
  const relativePaths = excludedFiles.map(f => path.relative(cwd, f));

  const header = `# Pack exclusions - generated from interactive selection
# ${new Date().toISOString()}
# Uses gitignore syntax

`;

  return header + relativePaths.join('\n') + '\n';
}

// ============================================================================
// Configuration Resolution
// ============================================================================

/**
 * Helper to convert any value to string array
 */
function toArray(val: any): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val.map(String) : [String(val)];
}

/**
 * Classify positional arguments into roots, files, and glob patterns
 */
export async function classifyPositionalArgs(
  args: string[]
): Promise<{ roots: string[]; files: string[]; globs: string[] }> {
  const roots: string[] = [];
  const files: string[] = [];
  const globs: string[] = [];

  for (const arg of args) {
    if (!arg) continue;
    if (hasGlobChars(arg)) {
      globs.push(arg);
      continue;
    }
    try {
      const st = await fs.stat(arg);
      if (st.isDirectory()) roots.push(arg);
      else if (st.isFile()) files.push(path.resolve(arg));
      else globs.push(arg);
    } catch (err) {
      // If it's an absolute path that doesn't exist, that's an error
      if (path.isAbsolute(arg)) {
        throw new Error(`Path does not exist: ${arg}`);
      }
      // Otherwise treat as glob pattern
      globs.push(arg);
    }
  }

  return { roots, files, globs };
}

/**
 * Resolve full configuration from CLI arguments
 * Parses CLI args and defaults into PackerOptions
 */
export async function resolveConfig(argv: string[]): Promise<{
  options: PackerOptions;
  parsed: Argv;
  shouldExit: 'help' | 'version' | null;
}> {
  const parsed = parseArgs(argv);

  // Check for early exit conditions
  if (parsed.help || parsed.h) {
    return { options: createDefaultOptions(), parsed, shouldExit: 'help' };
  }
  if (parsed.version || parsed.v) {
    return { options: createDefaultOptions(), parsed, shouldExit: 'version' };
  }

  const caseSensitive = Boolean(parsed["case-sensitive"] || parsed.C);
  const useRegex = Boolean(parsed.regex || parsed.R);
  const smartContext = Boolean((parsed as any)["smart-context"]);

  // Parse include/ignore patterns from CLI
  const includeRaw = toArray((parsed as any).include);
  const includeList = includeRaw.flatMap(v => parseCSV(v));
  const ignoreRaw = toArray((parsed as any).ignore || (parsed as any).i);
  const ignoreList = ignoreRaw.flatMap(v => parseCSV(v));

  // Classify positional arguments
  const positionalArgs = (parsed._ as any[] || []).map(String);
  const { roots: positionalRoots, files: positionalFiles, globs: positionalGlobs } =
    await classifyPositionalArgs(positionalArgs);

  // Combine include patterns
  const positionalFilePatterns = positionalFiles
    .map(abs => path.relative(process.cwd(), abs).replace(/\\/g, '/'));
  const combinedIncludeList = [...includeList, ...positionalGlobs, ...positionalFilePatterns];
  const includePatterns = combinedIncludeList.flatMap(p => expandPattern(p));

  // Parse CLI args
  const searchStrings = [
    ...normalizeStrings(parsed.strings),
    ...normalizeStrings(parsed.s)
  ].filter(Boolean);

  const excludeStrings = [
    ...normalizeStrings(parsed["exclude-strings"]),
    ...normalizeStrings(parsed.S)
  ].filter(Boolean);

  const extensionValues = parsed.extensions || parsed.e;
  const extensionsList = Array.isArray(extensionValues)
    ? extensionValues.flatMap(v => parseCSV(String(v)))
    : parseCSV(extensionValues);
  let extensions = toExtSet(extensionsList);

  const excludeValues = parsed["exclude-extensions"] || parsed.x;
  const excludeList = Array.isArray(excludeValues)
    ? excludeValues.flatMap(v => parseCSV(String(v)))
    : parseCSV(excludeValues);

  const excludePatterns: string[] = [];
  for (const excl of excludeList) {
    if (excl) {
      if (!excl.includes('/') && !excl.includes('*')) {
        excludePatterns.push(`**/*.${excl.replace(/^\./, '')}`);
      } else {
        excludePatterns.push(excl);
      }
    }
  }

  // Apply defaults
  if (!extensions.size) {
    extensions = getDefaultExtensions();
  }

  // Determine git mode
  let gitMode: PackerOptions['gitMode'] = null;
  if (parsed.staged) gitMode = 'staged';
  else if (parsed.diff) gitMode = 'diff';
  else if (parsed.dirty) gitMode = 'dirty';

  // Determine output settings
  const rawOutputArg = (parsed.output ?? parsed.o) as any;
  let toStdout = Boolean((parsed as any).stdout);
  if (rawOutputArg === '-' || (parsed._ || []).includes('-')) {
    toStdout = true;
  }
  const outputFile = typeof rawOutputArg === 'string' ? rawOutputArg : undefined;
  const copyToClipboard = Boolean((parsed as any).copy || (parsed as any).c);

  // Parse prompt text
  const promptParts = normalizeStrings((parsed as any).prompt ?? (parsed as any).p).filter(Boolean);

  // Determine ripgrep mode
  let useRipgrep: PackerOptions['useRipgrep'] = 'auto';
  if (parsed.rg === true) {
    useRipgrep = 'force';
  } else if (parsed["no-rg"] === true) {
    useRipgrep = 'disabled';
  }

  // Parse max-tokens (yargs returns as number)
  const maxTokens = parsed["max-tokens"] || (parsed as any).M;

  // Determine packignore mode
  const usePackignore = !Boolean(parsed["no-packignore"]);

  const options: PackerOptions = {
    roots: positionalRoots.length ? positionalRoots : ['.'],
    searchStrings,
    excludeStrings,
    caseSensitive,
    useRegex,
    extensions,
    excludePatterns,
    includePatterns,
    explicitFiles: positionalFiles,
    gitMode,
    stripComments: Boolean(parsed["strip-comments"] || parsed["no-comments"]),
    minify: Boolean(parsed.minify),
    contextLines: parsed.lines || parsed.l,
    smartContext,
    includeRelated: Boolean(parsed.related || parsed.r),
    followImports: Boolean(parsed["follow-imports"]),
    transforms: [],
    outputStyle: ((parsed as any).format || (parsed as any).style || 'xml') as OutputStyle,
    outputFile,
    copyToClipboard,
    toStdout,
    previewOnly: Boolean(parsed.preview),
    interactive: Boolean(parsed.interactive || parsed.I),
    watch: Boolean(parsed.watch || parsed.w),
    promptText: promptParts.length > 0 ? promptParts.join('\n\n') : undefined,
    useRipgrep,
    maxTokens: maxTokens && typeof maxTokens === 'number' && !isNaN(maxTokens) ? maxTokens : undefined,
    noCache: Boolean(parsed["no-cache"]),
    usePackignore,
    explainMode: Boolean(parsed.explain),
    verbose: Boolean(parsed.verbose),
    workspace: (parsed.workspace ?? parsed.W) as string | undefined,
    allWorkspaces: Boolean(parsed["all-workspaces"]),
    followWorkspaceDeps: Boolean(parsed["follow-workspace-deps"]),
  };

  return { options, parsed, shouldExit: null };
}

/**
 * Create default PackerOptions
 */
function createDefaultOptions(): PackerOptions {
  return {
    roots: ['.'],
    searchStrings: [],
    excludeStrings: [],
    caseSensitive: false,
    useRegex: false,
    extensions: getDefaultExtensions(),
    excludePatterns: [],
    includePatterns: [],
    explicitFiles: [],
    gitMode: null,
    stripComments: false,
    minify: false,
    contextLines: undefined,
    smartContext: false,
    includeRelated: false,
    followImports: false,
    transforms: [],
    outputStyle: 'xml',
    outputFile: undefined,
    copyToClipboard: false,
    toStdout: false,
    previewOnly: false,
    interactive: true,
    watch: false,
    promptText: undefined,
    useRipgrep: 'auto',
    noCache: false,
    usePackignore: true,
    explainMode: false,
    verbose: false,
    workspace: undefined,
    allWorkspaces: false,
    followWorkspaceDeps: false,
  };
}
