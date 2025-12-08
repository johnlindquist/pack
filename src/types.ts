/**
 * Shared type definitions for packx
 * Centralized types to prevent circular dependencies
 */

import type mri from "mri";

// ============================================================================
// CLI Types
// ============================================================================

export type Argv = mri.Argv & {
  // Search & Filter
  strings?: string | string[];     // -s
  "exclude-strings"?: string | string[]; // -S
  include?: string | string[];     // -i
  exclude?: string | string[];     // -x
  regex?: boolean;                 // -R
  "case-sensitive"?: boolean;      // -C

  // Git
  staged?: boolean;
  diff?: boolean;
  dirty?: boolean;

  // Output
  output?: string;                 // -o
  format?: string;                 // -f
  copy?: boolean;                  // -c
  lines?: number;                  // -l
  preview?: boolean;               // --preview
  stdout?: boolean;
  "max-tokens"?: number;           // --max-tokens

  // Processing
  "strip-comments"?: boolean;      // --strip-comments
  "no-comments"?: boolean;         // --no-comments (alias)
  minify?: boolean;                // --minify
  related?: boolean;               // -r
  "follow-imports"?: boolean;      // --follow-imports

  // Instructions
  instruction?: string;
  prompt?: string | string[];      // -p

  // Meta
  config?: string;
  file?: string;                   // -f (legacy alias for config)
  interactive?: boolean;           // -I
  watch?: boolean;                 // -w (watch mode)
  explain?: boolean;               // --explain
  help?: boolean;                  // -h
  version?: boolean;               // -v
  "no-cache"?: boolean;            // --no-cache (parsed by mri as cache: false)
  cache?: boolean;                  // Set to false when --no-cache is used

  // Performance
  rg?: boolean;                    // --rg (use ripgrep)
  "no-rg"?: boolean;               // --no-rg (disable ripgrep)

  // Legacy mappings
  extensions?: string | string[];
  "exclude-extensions"?: string | string[];
};

// ============================================================================
// Config Types
// ============================================================================

export type ParsedConfig = {
  search: string[];
  extensions: string[];
  exclude: string[];
  files: string[];  // Explicit file paths from [files] section
};

// ============================================================================
// Context Window Types
// ============================================================================

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

// ============================================================================
// Output & Formatting Types
// ============================================================================

export type OutputStyle = "xml" | "markdown" | "plain" | "jsonl";

export type FormatOptions = {
  style: OutputStyle;
  contextLines?: number;
  pattern?: RegExp | null;
  smartContext?: boolean;
  summaryOnly?: boolean;
  stripComments?: boolean;
  minify?: boolean;
};

export type FileStats = {
  path: string;
  size: number;
  tokens: number;
  matchCount?: number;
  windowCount?: number;
};

/**
 * JSONL output object - one per file
 */
export type JsonlFileEntry = {
  path: string;
  content: string;
  tokens: number;
  matches: Array<{
    line: number;
    column: number;
    match: string;
  }>;
};

// ============================================================================
// Analysis Types
// ============================================================================

export type FileAnalysis = {
  path: string;
  size: number;
  tokens: number;
  isBinary: boolean;
};

// ============================================================================
// Interactive Selection Types
// ============================================================================

export type FileChoice = {
  path: string;      // Full path
  relPath: string;   // Relative path for display
  tokens: number;
  ext: string;       // File extension
};

export type TreeNode = {
  name: string;
  path: string;
  isFolder: boolean;
  depth: number;
  tokens: number;     // For folders: sum of children
  ext: string;        // For files: extension
  children: TreeNode[];
  fileIndices: number[]; // Indices into original files array
};

export type TreeCheckboxConfig = {
  message: string;
  files: FileChoice[];
  pageSize?: number;
  // Preview options
  showPreview?: boolean;
  previewWidth?: number;  // Width in characters for preview pane
  searchPattern?: RegExp | null;  // Pattern for context window highlighting
  contextLines?: number;  // Number of context lines around matches
};

// ============================================================================
// Packer Options (Runtime Configuration)
// ============================================================================

export type PackerOptions = {
  // Roots to scan
  roots: string[];

  // Search patterns
  searchStrings: string[];
  excludeStrings: string[];
  caseSensitive: boolean;
  useRegex: boolean;

  // File filtering
  extensions: Set<string>;
  excludePatterns: string[];
  includePatterns: string[];
  explicitFiles: string[];

  // Git context
  gitMode: 'staged' | 'diff' | 'dirty' | null;

  // Processing
  stripComments: boolean;
  minify: boolean;
  contextLines?: number;
  smartContext: boolean;
  includeRelated: boolean;
  followImports: boolean;

  // Output
  outputStyle: OutputStyle;
  outputFile?: string;
  copyToClipboard: boolean;
  toStdout: boolean;
  previewOnly: boolean;
  maxTokens?: number;  // Token limit for output splitting

  // Interactive
  interactive: boolean;

  // Watch mode
  watch: boolean;

  // Prompt/instructions
  promptText?: string;

  // Performance
  useRipgrep: 'auto' | 'force' | 'disabled';

  // Caching
  noCache: boolean;

  // Explain mode (dry run with detailed logging)
  explainMode: boolean;
};

// ============================================================================
// Chunked Output Types
// ============================================================================

export type OutputChunk = {
  chunkNumber: number;
  totalChunks: number;
  output: string;
  files: FileStats[];
  tokens: number;
  chars: number;
};
