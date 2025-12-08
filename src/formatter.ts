/**
 * Stream-based output formatting for XML and Markdown
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Writable } from "node:stream";
import { extractContextWindows, formatContextWindows } from "./context.js";
import { countTokens } from "./analysis.js";
import { stripComments, minify } from "./processing.js";
import type { OutputStyle, FormatOptions, FileStats } from "./types.js";

// Re-export types for convenience
export type { OutputStyle, FormatOptions, FileStats } from "./types.js";

/**
 * Create output header
 */
export function createHeader(
  style: OutputStyle,
  fileCount: number,
  relativePaths: string[],
  contextLines?: number
): string {
  if (style === "xml") {
    return `This file is a merged representation of the filtered codebase, combined into a single document by packx.

<file_summary>
This section contains a summary of this file.

<purpose>
This file contains a packed representation of filtered repository contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.
</purpose>

<usage_guidelines>
- Treat this file as a snapshot of the repository's state
- Be aware that this file may contain sensitive information
</usage_guidelines>

<notes>
- Files were filtered by packx based on content and extension matching
- Total files included: ${fileCount}${contextLines ? `\n- Context lines: ${contextLines} lines around each match` : ''}
</notes>
</file_summary>

<directory_structure>
${relativePaths.join('\n')}
</directory_structure>

<files>
This section contains the contents of the repository's files.

`;
  } else {
    return `# Packx Output

This file contains ${fileCount} filtered files from the repository.${contextLines ? `\n\n**Context:** ${contextLines} lines around each match` : ''}

## Files

`;
  }
}

/**
 * Create output footer
 */
export function createFooter(style: OutputStyle): string {
  if (style === "xml") {
    return `</files>`;
  }
  return '';
}

/**
 * Format a single file for output
 */
export async function formatFile(
  filePath: string,
  relPath: string,
  options: FormatOptions
): Promise<{ output: string; stats: FileStats }> {
  let content = await fs.readFile(filePath, 'utf8');
  const ext = path.extname(relPath);
  const extLabel = ext.slice(1) || 'txt';

  // Apply processing
  if (options.stripComments) {
    content = stripComments(content, ext);
  }
  if (options.minify) {
    content = minify(content);
  }

  let fileOutput = '';
  let matchCount = 0;
  let windowCount = 0;

  if (options.contextLines && options.pattern) {
    // Extract context windows
    const windows = extractContextWindows(
      content,
      options.pattern,
      options.contextLines,
      options.smartContext
    );

    if (windows.length > 0) {
      windowCount = windows.length;
      matchCount = windows.reduce((sum, w) => sum + w.matches.length, 0);
      const formatted = formatContextWindows(windows, relPath);

      if (options.style === "xml") {
        fileOutput = `<file path="${relPath}" matches="${matchCount}" windows="${windowCount}">
${formatted}</file>

`;
      } else {
        fileOutput = `### ${relPath}

**Matches:** ${matchCount} | **Context windows:** ${windowCount}

\`\`\`${extLabel}
${formatted}\`\`\`

`;
      }
    }
  } else {
    // Include entire file
    if (options.style === "xml") {
      fileOutput = `<file path="${relPath}">
${content}
</file>

`;
    } else {
      fileOutput = `### ${relPath}

\`\`\`${extLabel}
${content}
\`\`\`

`;
    }
  }

  const stats: FileStats = {
    path: relPath,
    size: fileOutput.length,
    tokens: countTokens(fileOutput),
    matchCount,
    windowCount
  };

  return { output: fileOutput, stats };
}

/**
 * Stream-based formatter that writes directly to output
 */
export class StreamFormatter {
  private output: Writable;
  private style: OutputStyle;
  private stats: FileStats[] = [];
  private totalTokens = 0;
  private totalChars = 0;
  private headerWritten = false;

  constructor(output: Writable, style: OutputStyle) {
    this.output = output;
    this.style = style;
  }

  /**
   * Write header
   */
  async writeHeader(fileCount: number, relativePaths: string[], contextLines?: number): Promise<void> {
    if (this.headerWritten) return;
    const header = createHeader(this.style, fileCount, relativePaths, contextLines);
    await this.write(header);
    this.headerWritten = true;
  }

  /**
   * Write a single file
   */
  async writeFile(
    filePath: string,
    relPath: string,
    options: FormatOptions
  ): Promise<FileStats> {
    const { output, stats } = await formatFile(filePath, relPath, options);
    if (output) {
      await this.write(output);
      this.stats.push(stats);
      this.totalTokens += stats.tokens;
      this.totalChars += stats.size;
    }
    return stats;
  }

  /**
   * Write footer
   */
  async writeFooter(): Promise<void> {
    const footer = createFooter(this.style);
    if (footer) {
      await this.write(footer);
    }
  }

  /**
   * Write prompt section
   */
  async writePrompt(promptText: string): Promise<void> {
    if (promptText) {
      const formatted = this.style === "xml"
        ? `\n\n<instructions>\n${promptText}\n</instructions>\n`
        : `\n\n---\n\n${promptText}\n`;
      await this.write(formatted);
    }
  }

  /**
   * Get collected stats
   */
  getStats(): { files: FileStats[]; totalTokens: number; totalChars: number } {
    return {
      files: this.stats,
      totalTokens: this.totalTokens,
      totalChars: this.totalChars
    };
  }

  private write(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const canContinue = this.output.write(data);
      if (canContinue) {
        resolve();
      } else {
        this.output.once('drain', resolve);
        this.output.once('error', reject);
      }
    });
  }
}

/**
 * Create a memory buffer stream for string output
 */
export class StringBufferStream extends Writable {
  private chunks: string[] = [];

  _write(chunk: Buffer | string, _encoding: string, callback: (error?: Error | null) => void): void {
    this.chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    callback();
  }

  toString(): string {
    return this.chunks.join('');
  }
}

/**
 * Format all files to a string (for backward compatibility)
 */
export async function formatToString(
  files: string[],
  cwd: string,
  options: FormatOptions & { promptText?: string }
): Promise<{ output: string; stats: FileStats[]; totalTokens: number; totalChars: number }> {
  const buffer = new StringBufferStream();
  const formatter = new StreamFormatter(buffer, options.style);
  const relativePaths = files.map(f => path.relative(cwd, f));

  if (!options.summaryOnly) {
    await formatter.writeHeader(files.length, relativePaths, options.contextLines);

    for (let i = 0; i < files.length; i++) {
      await formatter.writeFile(files[i], relativePaths[i], options);
    }

    await formatter.writeFooter();

    if (options.promptText) {
      await formatter.writePrompt(options.promptText);
    }
  } else {
    // Just collect stats without writing content
    for (let i = 0; i < files.length; i++) {
      const { stats } = await formatFile(files[i], relativePaths[i], options);
      // Stats are collected but output is not written
    }
  }

  const { files: fileStats, totalTokens, totalChars } = formatter.getStats();

  return {
    output: buffer.toString(),
    stats: fileStats,
    totalTokens,
    totalChars
  };
}
