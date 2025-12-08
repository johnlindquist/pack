/**
 * Configuration parsing and resolution for packx
 * Handles config files and merging with CLI arguments
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { ParsedConfig, PackerOptions, Argv, OutputStyle, TransformRule } from "./types.js";
import { parseArgs } from "./cli.js";
import { parseCSV, normalizeStrings, toExtSet, getDefaultExtensions } from "./utils.js";
import { hasGlobChars, expandPattern } from "./scanner.js";

/**
 * Parse config file in INI-like format
 */
export async function parseConfigFile(filePath: string): Promise<ParsedConfig> {
  const content = await fs.readFile(filePath, 'utf8');
  return parseConfigContent(content);
}

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
 * Parse config content (sync version for testing)
 */
export function parseConfigContent(content: string): ParsedConfig {
  const config: ParsedConfig = {
    search: [],
    extensions: [],
    exclude: [],
    files: [],
    transforms: []
  };

  const lines = content.split('\n');
  let currentSection: 'search' | 'extensions' | 'exclude' | 'files' | 'transforms' | null = null;

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
    if (trimmed === '[transforms]' || trimmed === '[transform]' || trimmed === '[redact]') {
      currentSection = 'transforms';
      continue;
    }

    // Add line to current section
    if (currentSection) {
      if (currentSection === 'transforms') {
        const rule = parseTransformRule(trimmed);
        if (rule) {
          config.transforms.push(rule);
        }
      } else {
        config[currentSection].push(trimmed);
      }
    }
  }

  return config;
}

/**
 * Generate .ini config content from selected files
 */
export function generateIniConfig(
  selectedFiles: string[],
  cwd: string,
  options?: {
    searchStrings?: string[];
    excludePatterns?: string[];
  }
): string {
  const relativePaths = selectedFiles.map(f => path.relative(cwd, f));

  // Extract unique extensions from selected files
  const extensions = new Set<string>();
  for (const file of relativePaths) {
    const ext = path.extname(file).toLowerCase().replace('.', '');
    if (ext) extensions.add(ext);
  }

  let config = `# Pack configuration - generated from interactive selection
# ${new Date().toISOString()}

[files]
# Selected files (${selectedFiles.length} total)
${relativePaths.join('\n')}

[extensions]
# Extensions from selected files
${Array.from(extensions).join('\n')}
`;

  // Include search strings if any were used
  if (options?.searchStrings && options.searchStrings.length > 0) {
    config += `
[search]
# Search strings used in original query
${options.searchStrings.join('\n')}
`;
  }

  // Include exclude patterns if any were used
  if (options?.excludePatterns && options.excludePatterns.length > 0) {
    config += `
[exclude]
# Exclude patterns used in original query
${options.excludePatterns.join('\n')}
`;
  }

  return config;
}

/**
 * Create a config template file
 */
export function createConfigTemplate(): string {
  return `# Pack configuration file
# Search for specific strings in your codebase
# Lines starting with # are comments
# Empty lines are ignored

[search]
# Add search strings here, one per line
# Examples:
# console.log
# TODO
# FIXME

[extensions]
# File extensions to include (without dots)
# Leave empty to search all common code files
# Examples:
# ts
# tsx
# js
# jsx

[exclude]
# Exclude patterns using gitignore syntax
# Examples:
# *.d.ts              # All TypeScript declaration files
# *.test.ts           # All test files
# *.spec.ts           # All spec files
# *.min.js            # All minified JS files
# docs/               # Docs directory
# site/               # Site directory
# **/test/**          # Any test directories
# **/*.test.ts        # Test files anywhere
# examples/**         # Everything under examples
# !important.test.ts  # Exception: include this test file

[transforms]
# Content transformation rules for redacting sensitive information
# Format: pattern = replacement
# Patterns are treated as regex (with global flag by default)
# Use /pattern/flags format for explicit regex with custom flags
#
# Examples:
# sk-[a-zA-Z0-9]{48} = [REDACTED_API_KEY]         # OpenAI API keys
# ghp_[a-zA-Z0-9]{36} = [REDACTED_GITHUB_TOKEN]   # GitHub tokens
# password\\s*=\\s*"[^"]+" = password="[REDACTED]" # Password assignments
# /secret/i = [SECRET]                             # Case-insensitive match
`;
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
    } catch {
      globs.push(arg);
    }
  }

  return { roots, files, globs };
}

/**
 * Resolve full configuration from CLI arguments
 * Merges CLI args, config file, and defaults into PackerOptions
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

  // Initialize config values
  let searchStrings: string[] = [];
  let excludeStrings: string[] = [];
  let extensions: Set<string>;
  let excludePatterns: string[] = [];
  let explicitFiles: string[] = [];
  let transforms: TransformRule[] = [];

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
  const ignoreExpanded = ignoreList.flatMap(p => expandPattern(p));

  // Parse config file or CLI args
  // Auto-detect pack-config.ini if no explicit config specified
  let configFile = parsed.config || parsed.file || (parsed as any).f;

  if (!configFile) {
    const defaultConfig = path.join(process.cwd(), 'pack-config.ini');
    try {
      await fs.access(defaultConfig);
      configFile = defaultConfig;
    } catch {
      // No default config file found
    }
  }

  if (configFile && typeof configFile === 'string') {
    const config = await parseConfigFile(configFile);
    searchStrings = [...config.search];
    extensions = toExtSet(config.extensions);
    excludePatterns = [...config.exclude];
    transforms = [...config.transforms];

    if (config.files.length > 0) {
      explicitFiles = config.files.map(f => path.resolve(process.cwd(), f));
    }

    // Merge CLI args (CLI overrides config)
    searchStrings.push(...normalizeStrings(parsed.strings));
    searchStrings.push(...normalizeStrings(parsed.s));

    excludeStrings = [
      ...normalizeStrings(parsed["exclude-strings"]),
      ...normalizeStrings(parsed.S)
    ].filter(Boolean);

    // Add CLI extensions
    const cliExtensions = parsed.extensions || parsed.e;
    const cliExtList = Array.isArray(cliExtensions)
      ? cliExtensions.flatMap(v => parseCSV(String(v)))
      : parseCSV(cliExtensions);
    for (const ext of toExtSet(cliExtList)) {
      extensions.add(ext);
    }

    // Add CLI exclude patterns
    const cliExclude = parsed["exclude-extensions"] || parsed.x;
    const cliExcludeList = Array.isArray(cliExclude)
      ? cliExclude.flatMap(v => parseCSV(String(v)))
      : parseCSV(cliExclude);

    for (const excl of cliExcludeList) {
      if (excl) {
        if (!excl.includes('/') && !excl.includes('*')) {
          excludePatterns.push(`**/*.${excl.replace(/^\./, '')}`);
        } else {
          excludePatterns.push(excl);
        }
      }
    }
  } else {
    // No config file - use CLI args only
    searchStrings = [
      ...normalizeStrings(parsed.strings),
      ...normalizeStrings(parsed.s)
    ].filter(Boolean);

    excludeStrings = [
      ...normalizeStrings(parsed["exclude-strings"]),
      ...normalizeStrings(parsed.S)
    ].filter(Boolean);

    const extensionValues = parsed.extensions || parsed.e;
    const extensionsList = Array.isArray(extensionValues)
      ? extensionValues.flatMap(v => parseCSV(String(v)))
      : parseCSV(extensionValues);
    extensions = toExtSet(extensionsList);

    const excludeValues = parsed["exclude-extensions"] || parsed.x;
    const excludeList = Array.isArray(excludeValues)
      ? excludeValues.flatMap(v => parseCSV(String(v)))
      : parseCSV(excludeValues);

    for (const excl of excludeList) {
      if (excl) {
        if (!excl.includes('/') && !excl.includes('*')) {
          excludePatterns.push(`**/*.${excl.replace(/^\./, '')}`);
        } else {
          excludePatterns.push(excl);
        }
      }
    }
  }

  // Apply defaults
  searchStrings = searchStrings.filter(Boolean);
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
  if (rawOutputArg === '-' || (parsed.o === true && (parsed._ || []).includes('-'))) {
    toStdout = true;
  }
  const outputFile = typeof rawOutputArg === 'string' ? rawOutputArg : undefined;
  const copyToClipboard = Boolean((parsed as any).copy || (parsed as any).c);

  // Parse prompt text
  const promptParts = normalizeStrings((parsed as any).prompt ?? (parsed as any).p).filter(Boolean);

  const options: PackerOptions = {
    roots: positionalRoots.length ? positionalRoots : ['.'],
    searchStrings,
    excludeStrings,
    caseSensitive,
    useRegex,
    extensions,
    excludePatterns,
    includePatterns,
    explicitFiles: [...explicitFiles, ...positionalFiles],
    gitMode,
    stripComments: Boolean(parsed["strip-comments"] || parsed["no-comments"]),
    minify: Boolean(parsed.minify),
    contextLines: parsed.lines || parsed.l,
    smartContext,
    includeRelated: Boolean(parsed.related || parsed.r),
    transforms,
    outputStyle: ((parsed as any).format || (parsed as any).style || 'xml') as OutputStyle,
    outputFile,
    copyToClipboard,
    toStdout,
    previewOnly: Boolean(parsed.preview),
    interactive: Boolean(parsed.interactive || parsed.I),
    promptText: promptParts.length > 0 ? promptParts.join('\n\n') : undefined,
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
    transforms: [],
    outputStyle: 'xml',
    outputFile: undefined,
    copyToClipboard: false,
    toStdout: false,
    previewOnly: false,
    interactive: false,
    promptText: undefined,
  };
}
