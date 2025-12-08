/**
 * Configuration parsing and resolution for packx
 * Handles config files and merging with CLI arguments
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { ParsedConfig } from "./types.js";

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
`;
}
