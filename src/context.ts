/**
 * Smart context extraction with indentation awareness
 */

import type { MatchPosition, ContextWindow } from "./types.js";

// Re-export types for convenience
export type { MatchPosition, ContextWindow } from "./types.js";

/**
 * Find all matches of a pattern in content
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
 * Get the indentation level of a line (number of leading spaces/tabs)
 */
function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  if (!match) return 0;

  let level = 0;
  for (const char of match[1]) {
    if (char === '\t') {
      level += 4; // Treat tabs as 4 spaces
    } else {
      level += 1;
    }
  }
  return level;
}

/**
 * Check if a line is a block opener (ends with { or : for Python)
 */
function isBlockOpener(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.endsWith('{')) return true;
  if (trimmed.endsWith(':')) return true; // Python
  if (trimmed.match(/^(function|class|if|else|for|while|switch|try|catch)\b/)) return true;
  return false;
}

/**
 * Find the start of the containing block for a given line
 */
function findBlockStart(lines: string[], lineIndex: number): number {
  if (lineIndex <= 0) return 0;

  const targetIndent = getIndentLevel(lines[lineIndex]);
  let blockStart = lineIndex;

  // Walk backwards to find the block opener
  for (let i = lineIndex - 1; i >= 0; i--) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
      continue;
    }

    const indent = getIndentLevel(line);

    // Found a line with less indentation - this is a potential block start
    if (indent < targetIndent) {
      blockStart = i;

      // If this looks like a block opener, we're done
      if (isBlockOpener(line)) {
        break;
      }
    }
  }

  return blockStart;
}

/**
 * Find the end of the containing block for a given line
 */
function findBlockEnd(lines: string[], lineIndex: number): number {
  if (lineIndex >= lines.length - 1) return lines.length - 1;

  const targetIndent = getIndentLevel(lines[lineIndex]);
  let blockEnd = lineIndex;

  // Walk forward to find where indentation returns to or below target
  for (let i = lineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      continue;
    }

    const indent = getIndentLevel(line);

    // If we find a line with less or equal indentation that's not empty,
    // the previous non-empty line was the end of our block
    if (indent <= targetIndent) {
      // Check for closing braces at same level
      if (trimmed === '}' || trimmed === '},' || trimmed.startsWith('}')) {
        blockEnd = i;
      }
      break;
    }

    blockEnd = i;
  }

  return blockEnd;
}

/**
 * Extract context windows around pattern matches with optional smart expansion
 */
export function extractContextWindows(
  content: string,
  pattern: RegExp,
  contextLines: number,
  smartContext: boolean = false
): ContextWindow[] {
  const lines = content.split('\n');
  const matches = findAllMatches(content, pattern);

  if (matches.length === 0) return [];

  const windows: ContextWindow[] = [];

  for (const match of matches) {
    let startLine: number;
    let endLine: number;

    if (smartContext) {
      // Smart context: expand to include containing block
      const lineIndex = match.line - 1;

      // Start with fixed context
      startLine = Math.max(0, lineIndex - contextLines);
      endLine = Math.min(lines.length - 1, lineIndex + contextLines);

      // Try to expand to include block boundaries
      const blockStart = findBlockStart(lines, lineIndex);
      const blockEnd = findBlockEnd(lines, lineIndex);

      // Only use block boundaries if they're reasonably close
      const maxExpansion = contextLines * 2;
      if (blockStart >= lineIndex - maxExpansion) {
        startLine = Math.min(startLine, blockStart);
      }
      if (blockEnd <= lineIndex + maxExpansion) {
        endLine = Math.max(endLine, blockEnd);
      }
    } else {
      // Simple fixed context
      startLine = Math.max(0, match.line - 1 - contextLines);
      endLine = Math.min(lines.length - 1, match.line - 1 + contextLines);
    }

    // Convert to 1-based
    windows.push({
      startLine: startLine + 1,
      endLine: endLine + 1,
      lines: lines.slice(startLine, endLine + 1),
      matches: [match]
    });
  }

  // Merge overlapping windows
  return mergeWindows(windows, lines);
}

/**
 * Merge overlapping context windows
 */
function mergeWindows(windows: ContextWindow[], lines: string[]): ContextWindow[] {
  if (windows.length <= 1) return windows;

  // Sort by start line
  windows.sort((a, b) => a.startLine - b.startLine);

  const merged: ContextWindow[] = [];
  let current: ContextWindow | null = null;

  for (const window of windows) {
    if (!current) {
      current = { ...window, matches: [...window.matches] };
    } else if (window.startLine <= current.endLine + 1) {
      // Windows overlap or are adjacent - merge them
      current.endLine = Math.max(current.endLine, window.endLine);
      current.lines = lines.slice(current.startLine - 1, current.endLine);
      current.matches.push(...window.matches);
    } else {
      // No overlap - push current and start new
      merged.push(current);
      current = { ...window, matches: [...window.matches] };
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
export function formatContextWindows(windows: ContextWindow[], _filePath: string): string {
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

// Re-export utility functions for backward compatibility
export { escRegex, buildPattern } from "./utils.js";
