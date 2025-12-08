/**
 * Explainer module for packx --explain mode
 * Provides detailed dry-run output explaining what would happen during a pack operation
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { glob } from "glob";

import type { PackerOptions } from "./types.js";
import { buildPattern } from "./utils.js";
import { isGitRepository, getGitStagedFiles, getGitDirtyFiles, getGitDiffFiles } from "./git.js";
import { loadGitignore, DEFAULT_IGNORE_PATTERNS } from "./scanner.js";
import { isBinaryFile } from "./analysis.js";

// ANSI color codes
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m",
  cyan: "\x1b[36m", red: "\x1b[31m", magenta: "\x1b[35m",
};

// Logger type for dependency injection
export type Logger = (msg: string) => void;

// Create logging helpers with injectable logger
function createLoggers(log: Logger) {
  return {
    log,
    section: (t: string) => log(`\n${C.bold}${C.blue}=== ${t} ===${C.reset}`),
    step: (t: string) => log(`${C.cyan}--> ${t}${C.reset}`),
    info: (t: string) => log(`  [i] ${t}`),
    inc: (t: string) => log(`  ${C.green}[+]${C.reset} ${t}`),
    exc: (t: string) => log(`  ${C.yellow}[-]${C.reset} ${t}`),
  };
}

/**
 * Run explain mode - traces through all steps without generating output
 * @param options - Packer options to explain
 * @param logger - Optional custom logger for testing (defaults to console.log)
 */
export async function runExplainMode(options: PackerOptions, logger?: Logger): Promise<void> {
  const L = createLoggers(logger || console.log);

  L.log(`\n${C.bold}${C.cyan}=== PACKX EXPLAIN MODE ===${C.reset}`);
  L.log(`${C.dim}Dry run - no output will be generated${C.reset}`);

  // Step 1: Configuration
  await explainConfiguration(options, L);

  // Step 2: File Discovery
  const candidates = await explainFileDiscovery(options, L);

  // Step 3: Content Filtering
  const matched = await explainContentFiltering(options, candidates, L);

  // Step 4: Summary
  explainSummary(options, matched, candidates.length, L);
}

type Loggers = ReturnType<typeof createLoggers>;

async function explainConfiguration(options: PackerOptions, L: Loggers): Promise<void> {
  L.section("CONFIGURATION");

  L.step("Configuration Sources:");
  const configPath = path.join(process.cwd(), 'pack-config.ini');
  try {
    await fs.access(configPath);
    L.inc(`Config file: ${C.bold}pack-config.ini${C.reset} (auto-loaded)`);
  } catch {
    L.info(`${C.dim}No pack-config.ini found (CLI args only)${C.reset}`);
  }

  L.step("Resolved Options:");
  L.info(`Scan roots: ${C.bold}${options.roots.join(", ")}${C.reset}`);
  L.info(`Extensions: ${C.bold}${Array.from(options.extensions).sort().join(", ") || "(defaults)"}${C.reset}`);

  if (options.searchStrings.length > 0) {
    L.info(`Search: ${C.bold}${options.searchStrings.join(", ")}${C.reset}${options.useRegex ? " (regex)" : ""}${options.caseSensitive ? " (case-sensitive)" : ""}`);
  } else {
    L.info(`Search: ${C.dim}(none - include all)${C.reset}`);
  }

  if (options.excludeStrings.length > 0) L.info(`Exclude strings: ${C.bold}${options.excludeStrings.join(", ")}${C.reset}`);
  if (options.excludePatterns.length > 0) L.info(`Exclude patterns: ${C.bold}${options.excludePatterns.slice(0, 5).join(", ")}${options.excludePatterns.length > 5 ? ` (+${options.excludePatterns.length - 5} more)` : ""}${C.reset}`);
  if (options.includePatterns.length > 0) L.info(`Include patterns: ${C.bold}${options.includePatterns.slice(0, 5).join(", ")}${C.reset}`);
  if (options.explicitFiles.length > 0) L.info(`Explicit files: ${C.bold}${options.explicitFiles.length} file(s)${C.reset}`);
  if (options.gitMode) L.info(`Git mode: ${C.bold}${options.gitMode}${C.reset}`);

  const proc: string[] = [];
  if (options.stripComments) proc.push("strip-comments");
  if (options.minify) proc.push("minify");
  if (options.contextLines) proc.push(`context: ${options.contextLines} lines`);
  if (options.includeRelated) proc.push("include-related");
  if (proc.length > 0) L.info(`Processing: ${C.bold}${proc.join(", ")}${C.reset}`);

  L.info(`Output format: ${C.bold}${options.outputStyle}${C.reset}`);
  if (options.outputFile) L.info(`Output file: ${C.bold}${options.outputFile}${C.reset}`);
  if (options.copyToClipboard) L.info(`Copy to clipboard: ${C.bold}yes${C.reset}`);
  if (options.toStdout) L.info(`Write to stdout: ${C.bold}yes${C.reset}`);
}

async function explainFileDiscovery(options: PackerOptions, L: Loggers): Promise<string[]> {
  L.section("FILE DISCOVERY");
  const candidates: Set<string> = new Set();

  if (options.gitMode) {
    L.step(`Git-aware Discovery (${options.gitMode} mode):`);
    if (!await isGitRepository()) {
      L.log(`  ${C.red}[!] Not a git repository${C.reset}`);
      return [];
    }

    let gitFiles: string[] = [];
    if (options.gitMode === 'staged') gitFiles = await getGitStagedFiles();
    else if (options.gitMode === 'dirty') gitFiles = await getGitDirtyFiles();
    else if (options.gitMode === 'diff') gitFiles = await getGitDiffFiles();

    L.info(`Found ${C.bold}${gitFiles.length}${C.reset} ${options.gitMode} file(s)`);

    let extFiltered = 0;
    for (const file of gitFiles) {
      const ext = path.extname(file).toLowerCase();
      if (options.extensions.size === 0 || options.extensions.has(ext)) {
        candidates.add(file);
      } else extFiltered++;
    }
    if (extFiltered > 0) L.exc(`Filtered ${extFiltered} file(s) by extension`);
  } else {
    L.step("Standard File Discovery:");
    for (const root of options.roots) {
      const absRoot = path.resolve(root);
      L.info(`Scanning: ${C.bold}${absRoot}${C.reset}`);

      const gitignore = await loadGitignore(absRoot);
      const patterns = Array.from(options.extensions).map(ext => `**/*.${ext.startsWith('.') ? ext.slice(1) : ext}`);
      const allIgnores = [...DEFAULT_IGNORE_PATTERNS, ...options.excludePatterns];

      for (const pat of patterns) {
        const files = await glob(pat, { cwd: absRoot, ignore: allIgnores, absolute: true, dot: false, nodir: true });
        for (const file of files) {
          if (!gitignore.ignores(path.relative(absRoot, file))) candidates.add(file);
        }
      }
    }
    L.inc(`Found ${C.bold}${candidates.size}${C.reset} candidate file(s)`);
  }

  if (options.explicitFiles.length > 0) {
    L.inc(`Adding ${C.bold}${options.explicitFiles.length}${C.reset} explicit file(s)`);
    for (const f of options.explicitFiles) candidates.add(f);
  }

  L.step("Default Exclusions (always applied):");
  DEFAULT_IGNORE_PATTERNS.slice(0, 6).forEach(p => L.log(`  ${C.dim}[-] ${p}${C.reset}`));
  if (DEFAULT_IGNORE_PATTERNS.length > 6) L.log(`  ${C.dim}[-] ... and ${DEFAULT_IGNORE_PATTERNS.length - 6} more${C.reset}`);

  return [...candidates];
}

async function explainContentFiltering(options: PackerOptions, files: string[], L: Loggers): Promise<string[]> {
  L.section("CONTENT FILTERING");
  const cwd = process.cwd();

  const pattern = buildPattern(options.searchStrings, options.caseSensitive, options.useRegex);
  const excludePattern = buildPattern(options.excludeStrings, options.caseSensitive, options.useRegex);

  if (pattern) {
    L.info(`Search pattern: ${C.bold}${pattern.source}${C.reset} (flags: ${pattern.flags || "none"})`);
  } else {
    L.info(`${C.dim}No search pattern - all files pass${C.reset}`);
  }
  if (excludePattern) L.info(`Exclude pattern: ${C.bold}${excludePattern.source}${C.reset}`);

  const matched: string[] = [];
  let binaryCount = 0, largeCount = 0, noMatchCount = 0, excludeMatchCount = 0;

  for (const file of files) {
    try {
      const stat = await fs.stat(file);
      if (stat.size > 10 * 1024 * 1024) { largeCount++; continue; }
      if (await isBinaryFile(file)) { binaryCount++; continue; }

      const content = await fs.readFile(file, 'utf8');
      if (excludePattern && excludePattern.test(content)) { excludeMatchCount++; continue; }
      if (!pattern || pattern.test(content)) { matched.push(file); }
      else { noMatchCount++; }
    } catch { /* skip */ }
  }

  L.step("Filter Results:");
  if (binaryCount > 0) L.exc(`${binaryCount} binary file(s) skipped`);
  if (largeCount > 0) L.exc(`${largeCount} file(s) too large (>10MB)`);
  if (noMatchCount > 0) L.exc(`${noMatchCount} file(s) did not match search`);
  if (excludeMatchCount > 0) L.exc(`${excludeMatchCount} file(s) matched exclude pattern`);
  L.inc(`${C.bold}${matched.length}${C.reset} file(s) passed filtering`);

  if (matched.length > 0) {
    L.step("Files that would be included:");
    const sample = Math.min(matched.length, 12);
    for (let i = 0; i < sample; i++) L.log(`  ${C.green}   ${C.reset} ${path.relative(cwd, matched[i])}`);
    if (matched.length > sample) L.log(`  ${C.dim}... and ${matched.length - sample} more${C.reset}`);
  }

  return matched;
}

function explainSummary(options: PackerOptions, matched: string[], candidatesFound: number, L: Loggers): void {
  L.section("SUMMARY");

  L.step("What would happen:");
  L.info(`Initial candidates: ${C.bold}${candidatesFound}${C.reset} file(s)`);
  L.info(`After filtering: ${C.bold}${matched.length}${C.reset} file(s)`);

  if (matched.length === 0) {
    L.log(`\n  ${C.yellow}[!] No files would be included${C.reset}`);
  } else {
    L.inc(`${C.bold}${matched.length}${C.reset} file(s) would be packed`);
    if (options.outputFile) L.info(`Output: ${C.bold}${options.outputFile}${C.reset}`);
    if (options.copyToClipboard) L.info(`Would copy to clipboard`);
    if (options.toStdout) L.info(`Would write to stdout`);
    if (!options.outputFile && !options.copyToClipboard && !options.toStdout) L.info(`Summary only (no output destination)`);

    if (options.stripComments || options.minify || options.contextLines) {
      L.step("Processing:");
      if (options.stripComments) L.info(`Comments would be stripped`);
      if (options.minify) L.info(`Output would be minified`);
      if (options.contextLines) L.info(`Only ${options.contextLines} lines context around matches`);
    }
  }

  L.log(`\n${C.bold}${C.magenta}To generate output, run without --explain${C.reset}\n`);
}
