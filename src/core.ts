/**
 * Core logic functions for packx - extracted for testability
 *
 * DEPRECATED: This module is now a re-export layer for backward compatibility.
 * Import directly from specialized modules instead:
 *
 *   - types.ts      - Shared type definitions
 *   - utils.ts      - Generic utility functions
 *   - git.ts        - Git operations
 *   - config.ts     - Configuration parsing
 *   - scanner.ts    - File discovery and filtering
 *   - context.ts    - Context window extraction
 *   - analysis.ts   - Token counting and binary detection
 *   - formatter.ts  - Output formatting
 *   - processing.ts - Code processing (comments, minification)
 */

// Re-export types
export type {
  Argv,
  MatchPosition,
  ContextWindow,
  OutputStyle,
  FormatOptions,
  FileStats,
  FileAnalysis,
  FileChoice,
  TreeNode,
  PackerOptions
} from "./types.js";

// Re-export from utils
export {
  parseCSV,
  normalizeStrings,
  toExtSet,
  getDefaultExtensions,
  extensionToGlobPattern,
  fileContainsAnyStrings,
  contentContainsStrings,
  escRegex,
  buildPattern
} from "./utils.js";

// Re-export from git
export {
  isGitRepository,
  getMainBranch,
  getGitStagedFiles,
  getGitDirtyFiles,
  getGitDiffFiles
} from "./git.js";

// Re-export from config
export {
  parseTransformRule,
  generatePackignore,
  classifyPositionalArgs,
  resolveConfig
} from "./config.js";

// Re-export from scanner
export {
  scanDirectory,
  filterByContent,
  applyMatchers,
  hasGlobChars,
  expandPattern,
  loadGitignore,
  DEFAULT_IGNORE_PATTERNS,
  findRelatedFiles,
  expandWithRelatedFiles
} from "./scanner.js";

// Re-export from context
export {
  findAllMatches,
  extractContextWindows,
  formatContextWindows
} from "./context.js";

// Re-export from analysis
export {
  countTokens,
  countTokensHeuristic,
  isBinaryFile,
  isBinaryContent,
  analyzeFile,
  formatTokenCount,
  getTokenWarning
} from "./analysis.js";

// Re-export from formatter
export {
  StreamFormatter,
  StringBufferStream,
  formatToString,
  formatFile,
  createHeader,
  createFooter
} from "./formatter.js";

// Re-export from cli
export {
  parseArgs,
  printHelp
} from "./cli.js";

// Re-export from processing
export {
  stripComments,
  minify,
  applyTransforms
} from "./processing.js";

// Re-export from packer
export {
  Packer,
  type PackResult
} from "./packer.js";
