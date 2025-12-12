/**
 * Shared type definitions for packx
 * Centralized types to prevent circular dependencies
 */

// ============================================================================
// CLI Types
// ============================================================================

export type Argv = {
  // Positional arguments
  _?: (string | number)[];
  $0?: string;

  // Search & Filter
  strings?: string | string[];     // -s
  s?: string | string[];           // alias
  "exclude-strings"?: string | string[]; // -S
  S?: string | string[];           // alias
  include?: string | string[];     // -i
  i?: string | string[];           // alias
  exclude?: string | string[];     // -x
  x?: string | string[];           // alias
  regex?: boolean;                 // -R
  R?: boolean;                     // alias
  "case-sensitive"?: boolean;      // -C
  C?: boolean;                     // alias

  // Git
  staged?: boolean;
  diff?: boolean;
  dirty?: boolean;

  // Output
  output?: string;                 // -o
  o?: string;                      // alias
  format?: string;                 // -f
  f?: string;                      // alias
  copy?: boolean;                  // -c
  c?: boolean;                     // alias
  lines?: number;                  // -l
  l?: number;                      // alias
  preview?: boolean;               // --preview
  stdout?: boolean;
  "max-tokens"?: number;           // --max-tokens
  M?: number;                      // alias

  // Processing
  "strip-comments"?: boolean;      // --strip-comments
  "no-comments"?: boolean;         // --no-comments (alias)
  minify?: boolean;                // --minify
  related?: boolean;               // -r
  r?: boolean;                     // alias
  "follow-imports"?: boolean;      // --follow-imports

  // Instructions
  instruction?: string;
  prompt?: string | string[];      // -p
  p?: string | string[];           // alias
  template?: string;

  // Meta
  interactive?: boolean;           // -I
  I?: boolean;                     // alias
  watch?: boolean;                 // -w (watch mode)
  w?: boolean;                     // alias
  explain?: boolean;               // --explain
  verbose?: boolean;               // --verbose
  help?: boolean;                  // -h
  h?: boolean;                     // alias
  version?: boolean;               // -v
  v?: boolean;                     // alias
  "no-cache"?: boolean;            // --no-cache
  cache?: boolean;                 // Set to false when --no-cache is used

  // Performance
  rg?: boolean;                    // --rg (use ripgrep)
  "no-rg"?: boolean;               // --no-rg (disable ripgrep)

  // Packignore
  "no-packignore"?: boolean;       // --no-packignore

  // Bundles
  bundle?: string;                 // -b, --bundle (load a saved bundle by name)

  // Legacy mappings
  extensions?: string | string[];
  e?: string | string[];           // alias
  "exclude-extensions"?: string | string[];

  // Style (alias for format)
  style?: string;
};

// ============================================================================
// Config Types
// ============================================================================

/**
 * A transform rule for content modification
 * Pattern is a regex, replacement is the replacement string
 */
export type TransformRule = {
  pattern: RegExp;
  replacement: string;
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
  transforms?: TransformRule[];
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
  packignoreIndices?: Set<number>;  // File indices that match .packignore (start unselected)
  initialSelectedIndices?: Set<number>;  // Explicit initial selection (e.g., from a bundle)
  gitStatusMap?: Map<string, 'M' | 'A' | 'D' | '?'>;  // Git status: Modified, Added, Deleted, Untracked
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
  transforms: TransformRule[];  // Content transformation rules

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

  // Packignore
  usePackignore: boolean;

  // Explain mode (dry run with detailed logging)
  explainMode: boolean;

  // Verbose mode (detailed error logging)
  verbose: boolean;
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

export type SkippedFile = {
  path: string;
  reason: 'oversized';
  tokens: number;
};
