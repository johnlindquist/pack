/**
 * Packer - The core orchestrator for packx
 * Encapsulates the Scan -> Filter -> Process -> Format pipeline
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { glob } from "glob";
import { Minimatch } from "minimatch";
import pLimit from "p-limit";

import type { PackerOptions, FileStats, OutputChunk } from "./types.js";
import { buildPattern } from "./utils.js";
import { isGitRepository, getGitStagedFiles, getGitDirtyFiles, getGitDiffFiles } from "./git.js";
import { loadGitignore, DEFAULT_IGNORE_PATTERNS, expandWithRelatedFiles } from "./scanner.js";
import { isBinaryFile, countTokens, analyzeFile } from "./analysis.js";
import { extractContextWindows, formatContextWindows } from "./context.js";
import { stripComments, minify } from "./processing.js";
import { createHeader, createFooter, type OutputStyle } from "./formatter.js";
import { isRipgrepAvailable, discoverFilesWithRipgrep, ripgrepExcludeContent } from "./ripgrep.js";

const CONCURRENCY_LIMIT = 50;

export type PackResult = {
  output: string;
  files: FileStats[];
  totalTokens: number;
  totalChars: number;
  totalMatchCount: number;
  totalWindowCount: number;
  matchedFiles: string[];
  candidatesFound: number; // Number of files found before content filtering
  usedRipgrep?: boolean; // Whether ripgrep was used for discovery
  chunks?: OutputChunk[];  // Populated when maxTokens is set
};

/**
 * Packer class - orchestrates the file packing pipeline
 */
export class Packer {
  private options: PackerOptions;
  private pattern: RegExp | null;
  private excludePattern: RegExp | null;
  private usedRipgrep: boolean = false;
  private ripgrepDidContentFilter: boolean = false;

  constructor(options: PackerOptions) {
    this.options = options;
    this.pattern = buildPattern(options.searchStrings, options.caseSensitive, options.useRegex);
    this.excludePattern = buildPattern(options.excludeStrings, options.caseSensitive, options.useRegex);
  }

  /**
   * Execute the full packing pipeline
   */
  async pack(): Promise<PackResult> {
    // Reset ripgrep flags
    this.usedRipgrep = false;
    this.ripgrepDidContentFilter = false;

    // 1. Discover files
    const candidates = await this.discoverFiles();

    if (candidates.length === 0) {
      // If ripgrep was used with a content filter, we should report as "no matches"
      // (exit code 3) rather than "no files" (exit code 2) since files may exist
      // but none contained the search string.
      const candidatesFoundIndicator = this.ripgrepDidContentFilter ? 1 : 0;
      return this.emptyResult(candidatesFoundIndicator);
    }

    // 2. Filter by content (skip if ripgrep already did content filtering)
    let matched: string[];
    if (this.usedRipgrep && this.options.searchStrings.length > 0) {
      // Ripgrep already filtered by content, just verify files exist
      matched = await this.verifyFilesExist(candidates);
    } else {
      matched = await this.filterByContent(candidates);
    }

    if (matched.length === 0) {
      return this.emptyResult(candidates.length);
    }

    // 3. Expand with related files if requested
    if (this.options.includeRelated) {
      matched = await expandWithRelatedFiles(matched);
    }

    // 4. Process and format
    const result = await this.processFiles(matched, candidates.length);
    result.usedRipgrep = this.usedRipgrep;
    return result;
  }

  /**
   * Verify that files exist and are readable (used when ripgrep already filtered)
   */
  private async verifyFilesExist(files: string[]): Promise<string[]> {
    const limit = pLimit(CONCURRENCY_LIMIT);
    const results = await Promise.all(
      files.map(file =>
        limit(async () => {
          try {
            await fs.access(file);
            // Also check if it's a binary file
            if (await isBinaryFile(file)) {
              return null;
            }
            return file;
          } catch {
            return null;
          }
        })
      )
    );
    return results.filter((f): f is string => f !== null);
  }

  /**
   * Discover candidate files based on options
   */
  private async discoverFiles(): Promise<string[]> {
    const { options } = this;

    // Determine if we should try ripgrep
    const shouldTryRipgrep = options.useRipgrep !== 'disabled' && !options.gitMode;

    if (shouldTryRipgrep) {
      const rgResult = await this.discoverWithRipgrep();
      if (rgResult !== null) {
        return rgResult;
      }
      // Fall through to glob-based discovery if ripgrep failed
    }

    return this.discoverWithGlob();
  }

  /**
   * Discover files using ripgrep (fast path)
   * Returns null if ripgrep is not available or fails
   */
  private async discoverWithRipgrep(): Promise<string[] | null> {
    const { options } = this;

    // Check if ripgrep is available
    const rgAvailable = await isRipgrepAvailable();
    if (!rgAvailable) {
      if (options.useRipgrep === 'force') {
        throw new Error("ripgrep (rg) is required but not available. Install it or remove --rg flag.");
      }
      return null;
    }

    // Track whether ripgrep will filter by content
    const willFilterByContent = options.searchStrings.length > 0;

    // Ripgrep works best when we can combine file discovery and content search
    // For each root directory, run ripgrep
    const candidates = new Set<string>();

    for (const root of options.roots) {
      const absRoot = path.resolve(root);

      const result = await discoverFilesWithRipgrep(
        absRoot,
        options.extensions,
        options.excludePatterns,
        options.searchStrings,
        options.excludeStrings,
        options.caseSensitive,
        options.useRegex,
        true // useGitignore
      );

      if (!result.usedRipgrep) {
        // Ripgrep failed for some reason
        if (options.useRipgrep === 'force') {
          throw new Error(`ripgrep failed: ${result.error}`);
        }
        return null;
      }

      if (result.error) {
        // Non-fatal error (e.g., no matches found)
        // Continue with empty results from this root
      }

      for (const file of result.files) {
        candidates.add(file);
      }
    }

    // Add explicit files
    for (const f of options.explicitFiles) {
      candidates.add(f);
    }

    // Apply include matchers (ripgrep already handled extensions)
    const filtered = this.applyMatchers([...candidates]);

    this.usedRipgrep = true;
    this.ripgrepDidContentFilter = willFilterByContent;
    return filtered;
  }

  /**
   * Discover files using glob (fallback path)
   */
  private async discoverWithGlob(): Promise<string[]> {
    const candidates = new Set<string>();
    const { options } = this;

    if (options.gitMode) {
      // Git-aware file discovery
      const isGitRepo = await isGitRepository();
      if (!isGitRepo) {
        throw new Error("Git-aware options require a git repository");
      }

      let gitFiles: string[] = [];
      if (options.gitMode === 'staged') {
        gitFiles = await getGitStagedFiles();
      } else if (options.gitMode === 'dirty') {
        gitFiles = await getGitDirtyFiles();
      } else if (options.gitMode === 'diff') {
        gitFiles = await getGitDiffFiles();
      }

      // Filter by extension
      for (const file of gitFiles) {
        const ext = path.extname(file).toLowerCase();
        if (options.extensions.size === 0 || options.extensions.has(ext)) {
          const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
          let excluded = false;
          for (const ep of options.excludePatterns) {
            if (rel.endsWith(ep) || file.endsWith(ep)) {
              excluded = true;
              break;
            }
          }
          if (!excluded) {
            candidates.add(file);
          }
        }
      }
    } else {
      // Standard file discovery
      for (const root of options.roots) {
        const absRoot = path.resolve(root);
        const gitignore = await loadGitignore(absRoot);

        // Build glob patterns
        const patterns: string[] = [];
        for (const ext of options.extensions) {
          const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
          patterns.push(`**/*.${cleanExt}`);
        }

        const allIgnores = [...DEFAULT_IGNORE_PATTERNS, ...options.excludePatterns];

        for (const pat of patterns) {
          const files = await glob(pat, {
            cwd: absRoot,
            ignore: allIgnores,
            absolute: true,
            dot: false,
            nodir: true
          });

          for (const file of files) {
            const relPath = path.relative(absRoot, file);
            if (!gitignore.ignores(relPath)) {
              candidates.add(file);
            }
          }
        }

        // Include pattern discovery
        if (options.includePatterns.length > 0) {
          for (const inc of options.includePatterns) {
            try {
              const isAbs = path.isAbsolute(inc);
              const files = await glob(inc, {
                cwd: isAbs ? undefined : absRoot,
                ignore: allIgnores,
                absolute: true,
                dot: false,
                nodir: true,
              });
              for (const f of files) candidates.add(f);
            } catch {
              // ignore invalid patterns
            }
          }
        }
      }
    }

    // Add explicit files
    for (const f of options.explicitFiles) {
      candidates.add(f);
    }

    // Apply include/ignore matchers
    return this.applyMatchers([...candidates]);
  }

  /**
   * Apply include/ignore matchers to filter candidates
   */
  private applyMatchers(candidates: string[]): string[] {
    const { options } = this;
    const cwd = process.cwd();

    const includeExpandedAbs = options.includePatterns.filter(p => path.isAbsolute(p));
    const includeExpandedRel = options.includePatterns.filter(p => !path.isAbsolute(p));

    const includeMatchersAbs = includeExpandedAbs.map(p =>
      new Minimatch(p, { dot: true, nocase: !options.caseSensitive, noglobstar: false })
    );
    const includeMatchersRel = includeExpandedRel.map(p =>
      new Minimatch(p, { dot: true, nocase: !options.caseSensitive, noglobstar: false })
    );

    const explicitSet = new Set(options.explicitFiles);
    const explicitOnly = options.explicitFiles.length > 0 && options.includePatterns.length === 0;

    const filtered: string[] = [];

    for (const p of candidates) {
      const rel = path.relative(cwd, p).replace(/\\/g, '/');
      const absPosix = p.replace(/\\/g, '/');

      if (explicitOnly && !explicitSet.has(p)) continue;

      if (!explicitOnly) {
        const hasIncludeFilters = (includeMatchersAbs.length + includeMatchersRel.length) > 0;
        if (hasIncludeFilters) {
          const matchRel = includeMatchersRel.length ? includeMatchersRel.some(mm => mm.match(rel)) : false;
          const matchAbs = includeMatchersAbs.length ? includeMatchersAbs.some(mm => mm.match(absPosix)) : false;
          if (!(matchRel || matchAbs)) continue;
        }
      }

      filtered.push(p);
    }

    return filtered;
  }

  /**
   * Filter files by content pattern
   */
  private async filterByContent(files: string[]): Promise<string[]> {
    const { options, pattern, excludePattern } = this;

    // If explicit files from config, just verify they exist
    if (options.explicitFiles.length > 0 && options.includePatterns.length === 0) {
      const existing: string[] = [];
      for (const f of options.explicitFiles) {
        try {
          await fs.access(f);
          existing.push(f);
        } catch {
          // File not found
        }
      }
      return existing;
    }

    const limit = pLimit(CONCURRENCY_LIMIT);

    const results = await Promise.all(
      files.map(p =>
        limit(async () => {
          try {
            const stat = await fs.stat(p);
            if (stat.size > 10 * 1024 * 1024) return null;
            if (await isBinaryFile(p)) return null;

            const content = await fs.readFile(p, 'utf8');

            if (excludePattern && excludePattern.test(content)) {
              return null;
            }

            if (!pattern || pattern.test(content)) {
              return p;
            }

            return null;
          } catch {
            return null;
          }
        })
      )
    );

    return results.filter((f): f is string => f !== null);
  }

  /**
   * Process matched files and generate output
   */
  private async processFiles(files: string[], candidatesFound: number): Promise<PackResult> {
    const { options, pattern } = this;
    const cwd = process.cwd();
    const relativePaths = files.map(p => path.relative(cwd, p));
    const limit = pLimit(CONCURRENCY_LIMIT);

    let totalMatchCount = 0;
    let totalWindowCount = 0;

    // Process files in parallel
    const fileResults = await Promise.all(
      files.map((filePath, index) =>
        limit(async () => {
          const relPath = relativePaths[index];
          try {
            let content = await fs.readFile(filePath, 'utf8');
            const ext = path.extname(relPath);
            const extLabel = ext.slice(1) || 'txt';

            // Apply processing
            if (options.stripComments) {
              content = await stripComments(content, ext);
            }
            if (options.minify) {
              content = minify(content);
            }

            let fileOutput = '';
            let matchCount = 0;
            let windowCount = 0;

            if (options.contextLines && pattern) {
              const windows = await extractContextWindows(content, pattern, options.contextLines, options.smartContext, ext);
              if (windows.length > 0) {
                windowCount = windows.length;
                matchCount = windows.reduce((sum, w) => sum + w.matches.length, 0);
                const formatted = formatContextWindows(windows, relPath);

                if (options.outputStyle === "xml") {
                  fileOutput = `<file path="${relPath}" matches="${matchCount}" windows="${windowCount}">\n${formatted}</file>\n\n`;
                } else {
                  fileOutput = `### ${relPath}\n\n**Matches:** ${matchCount} | **Context windows:** ${windowCount}\n\n\`\`\`${extLabel}\n${formatted}\`\`\`\n\n`;
                }
              }
            } else {
              if (options.outputStyle === "xml") {
                fileOutput = `<file path="${relPath}">\n${content}\n</file>\n\n`;
              } else {
                fileOutput = `### ${relPath}\n\n\`\`\`${extLabel}\n${content}\n\`\`\`\n\n`;
              }
            }

            const tokens = countTokens(fileOutput);
            return { relPath, fileOutput, tokens, size: fileOutput.length, matchCount, windowCount };
          } catch (err) {
            return { relPath, fileOutput: '', tokens: 0, size: 0, matchCount: 0, windowCount: 0, error: err };
          }
        })
      )
    );

    // Collect stats for all files
    const fileSizes: FileStats[] = [];
    for (const result of fileResults) {
      if (result.fileOutput) {
        fileSizes.push({
          path: result.relPath,
          size: result.size,
          tokens: result.tokens,
          matchCount: result.matchCount,
          windowCount: result.windowCount
        });
        totalMatchCount += result.matchCount;
        totalWindowCount += result.windowCount;
      }
    }

    const totalTokens = fileSizes.reduce((sum, f) => sum + f.tokens, 0);
    const totalChars = fileSizes.reduce((sum, f) => sum + f.size, 0);

    // Check if we need to split into chunks
    if (options.maxTokens && totalTokens > options.maxTokens) {
      const chunks = this.splitIntoChunks(fileResults, relativePaths, options.maxTokens);

      // Return combined result with chunks
      return {
        output: chunks[0]?.output || '', // First chunk as default output
        files: fileSizes,
        totalTokens,
        totalChars,
        totalMatchCount,
        totalWindowCount,
        matchedFiles: files,
        candidatesFound,
        chunks,
      };
    }

    // Standard single output
    const header = createHeader(options.outputStyle, files.length, relativePaths, options.contextLines);
    const footer = createFooter(options.outputStyle);

    let output = header;
    for (const result of fileResults) {
      if (result.fileOutput) {
        output += result.fileOutput;
      }
    }
    output += footer;

    // Add prompt if provided
    if (options.promptText) {
      const promptFormatted = options.outputStyle === "xml"
        ? `\n\n<instructions>\n${options.promptText}\n</instructions>\n`
        : `\n\n---\n\n${options.promptText}\n`;
      output += promptFormatted;
    }

    return {
      output,
      files: fileSizes,
      totalTokens,
      totalChars,
      totalMatchCount,
      totalWindowCount,
      matchedFiles: files,
      candidatesFound,
    };
  }

  /**
   * Create empty result
   */
  private emptyResult(candidatesFound: number): PackResult {
    return {
      output: '',
      files: [],
      totalTokens: 0,
      totalChars: 0,
      totalMatchCount: 0,
      totalWindowCount: 0,
      matchedFiles: [],
      candidatesFound,
      usedRipgrep: this.usedRipgrep,
    };
  }

  /**
   * Analyze files for interactive selection (returns token counts)
   */
  async analyzeForInteractive(files: string[]): Promise<Array<{ path: string; relPath: string; tokens: number; ext: string }>> {
    const cwd = process.cwd();
    const limit = pLimit(CONCURRENCY_LIMIT);

    const results = await Promise.all(
      files.map(file =>
        limit(async () => {
          const analysis = await analyzeFile(file);
          const relPath = path.relative(cwd, file);
          const ext = path.extname(file).toLowerCase().replace('.', '');
          return { path: file, relPath, tokens: analysis.tokens, ext };
        })
      )
    );

    return results;
  }

  /**
   * Get the pattern regex (for external use)
   */
  getPattern(): RegExp | null {
    return this.pattern;
  }

  /**
   * Get the exclude pattern regex (for external use)
   */
  getExcludePattern(): RegExp | null {
    return this.excludePattern;
  }

  /**
   * Split output into chunks based on token limit
   */
  splitIntoChunks(
    fileResults: Array<{ relPath: string; fileOutput: string; tokens: number; size: number; matchCount: number; windowCount: number }>,
    relativePaths: string[],
    maxTokens: number
  ): OutputChunk[] {
    const { options } = this;
    const chunks: OutputChunk[] = [];

    // Estimate header/footer token overhead per chunk
    const sampleHeader = createHeader(options.outputStyle, 1, ['sample.ts'], options.contextLines);
    const sampleFooter = createFooter(options.outputStyle);
    const headerFooterTokens = countTokens(sampleHeader) + countTokens(sampleFooter);

    // Reserve tokens for header/footer and chunk info
    const chunkInfoOverhead = 50; // ~50 tokens for chunk info header
    const availableTokens = maxTokens - headerFooterTokens - chunkInfoOverhead;

    if (availableTokens <= 0) {
      throw new Error(`max-tokens (${maxTokens}) is too small. Need at least ${headerFooterTokens + chunkInfoOverhead + 100} tokens for headers.`);
    }

    let currentChunkFiles: typeof fileResults = [];
    let currentChunkTokens = 0;

    const flushChunk = () => {
      if (currentChunkFiles.length === 0) return;

      const chunkNumber = chunks.length + 1;
      const chunkRelPaths = currentChunkFiles.map(f => f.relPath);

      // Build chunk output
      let chunkOutput = createHeader(options.outputStyle, currentChunkFiles.length, chunkRelPaths, options.contextLines);

      // Add chunk info at the start
      const chunkInfo = options.outputStyle === 'xml'
        ? `<chunk_info part="${chunkNumber}" />\n\n`
        : `**Part ${chunkNumber}**\n\n`;
      chunkOutput = chunkInfo + chunkOutput;

      for (const result of currentChunkFiles) {
        chunkOutput += result.fileOutput;
      }

      chunkOutput += createFooter(options.outputStyle);

      const chunkStats: FileStats[] = currentChunkFiles.map(f => ({
        path: f.relPath,
        size: f.size,
        tokens: f.tokens,
        matchCount: f.matchCount,
        windowCount: f.windowCount
      }));

      chunks.push({
        chunkNumber,
        totalChunks: 0, // Will be updated after all chunks are created
        output: chunkOutput,
        files: chunkStats,
        tokens: countTokens(chunkOutput),
        chars: chunkOutput.length
      });

      currentChunkFiles = [];
      currentChunkTokens = 0;
    };

    for (const result of fileResults) {
      if (!result.fileOutput) continue;

      // If single file exceeds available tokens, it gets its own chunk
      if (result.tokens > availableTokens) {
        // Flush current chunk first
        flushChunk();
        // Add oversized file as its own chunk
        currentChunkFiles = [result];
        currentChunkTokens = result.tokens;
        flushChunk();
        continue;
      }

      // Check if adding this file would exceed the limit
      if (currentChunkTokens + result.tokens > availableTokens) {
        flushChunk();
      }

      currentChunkFiles.push(result);
      currentChunkTokens += result.tokens;
    }

    // Flush remaining files
    flushChunk();

    // Update totalChunks in all chunks
    const totalChunks = chunks.length;
    for (const chunk of chunks) {
      chunk.totalChunks = totalChunks;
      // Update chunk info with total
      if (options.outputStyle === 'xml') {
        chunk.output = chunk.output.replace(
          `<chunk_info part="${chunk.chunkNumber}" />`,
          `<chunk_info part="${chunk.chunkNumber}" total="${totalChunks}" />`
        );
      } else {
        chunk.output = chunk.output.replace(
          `**Part ${chunk.chunkNumber}**`,
          `**Part ${chunk.chunkNumber} of ${totalChunks}**`
        );
      }
    }

    return chunks;
  }
}
