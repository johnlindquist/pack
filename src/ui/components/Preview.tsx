/**
 * Preview component - File content preview panel with syntax highlighting
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { highlight, supportsLanguage } from 'cli-highlight';
import type { TreeNode, ContextWindow, MatchPosition } from '../../types.js';
import { formatTokenCount } from '../../analysis.js';
import { formatContextWindows } from '../../context.js';

export type PreviewProps = {
  node: TreeNode | null;
  content: string;
  isLoading: boolean;
  scroll: number;
  focused: boolean;
  height: number;
  width: number;
  searchPattern?: RegExp | null;
  contextLines?: number;
};

/**
 * Get language identifier from file extension for syntax highlighting
 */
function getLanguageFromExt(ext: string): string | undefined {
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.json': 'json',
    '.md': 'markdown',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.css': 'css',
    '.scss': 'scss',
    '.html': 'html',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'bash',
    '.sql': 'sql',
    '.rb': 'ruby',
    '.php': 'php',
  };
  return langMap[ext.toLowerCase()];
}

/**
 * Find all matches of a pattern in content (sync version for preview)
 */
function findAllMatches(content: string, pattern: RegExp): MatchPosition[] {
  const lines = content.split('\n');
  const matches: MatchPosition[] = [];
  lines.forEach((line, lineIndex) => {
    let match;
    const linePattern = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g');
    while ((match = linePattern.exec(line)) !== null) {
      matches.push({ line: lineIndex + 1, column: match.index, match: match[0] });
    }
  });
  return matches;
}

/**
 * Extract context windows synchronously (simple version without AST)
 */
function extractContextWindowsSync(
  content: string,
  pattern: RegExp,
  contextLines: number
): ContextWindow[] {
  const lines = content.split('\n');
  const matches = findAllMatches(content, pattern);
  if (matches.length === 0) return [];

  const windows: ContextWindow[] = [];
  for (const match of matches) {
    const startLine = Math.max(0, match.line - 1 - contextLines);
    const endLine = Math.min(lines.length - 1, match.line - 1 + contextLines);
    windows.push({
      startLine: startLine + 1,
      endLine: endLine + 1,
      lines: lines.slice(startLine, endLine + 1),
      matches: [match],
    });
  }

  // Merge overlapping windows
  if (windows.length <= 1) return windows;
  windows.sort((a, b) => a.startLine - b.startLine);
  const merged: ContextWindow[] = [];
  let current: ContextWindow | null = null;
  for (const window of windows) {
    if (!current) {
      current = { ...window, matches: [...window.matches] };
    } else if (window.startLine <= current.endLine + 1) {
      current.endLine = Math.max(current.endLine, window.endLine);
      current.lines = lines.slice(current.startLine - 1, current.endLine);
      current.matches.push(...window.matches);
    } else {
      merged.push(current);
      current = { ...window, matches: [...window.matches] };
    }
  }
  if (current) merged.push(current);
  return merged;
}

/**
 * Process content for preview with optional syntax highlighting
 */
function processContent(
  content: string,
  searchPattern: RegExp | null,
  contextLines: number | undefined,
  fileExt: string | undefined
): { lines: string[]; totalLines: number; hasMatches: boolean } {
  // If we have a pattern and context lines, show context windows
  if (searchPattern && contextLines) {
    const windows = extractContextWindowsSync(content, searchPattern, contextLines);
    if (windows.length > 0) {
      const formatted = formatContextWindows(windows, '');
      const contextLinesArr = formatted.split('\n');
      return { lines: contextLinesArr, totalLines: contextLinesArr.length, hasMatches: true };
    }
  }

  // Apply syntax highlighting if we have a file extension
  let processedContent = content;
  if (fileExt) {
    const lang = getLanguageFromExt(fileExt);
    if (lang && supportsLanguage(lang)) {
      try {
        processedContent = highlight(content, { language: lang, ignoreIllegals: true });
      } catch {
        // Highlighting failed, use original content
      }
    }
  }

  const allLines = processedContent.split('\n');
  return { lines: allLines, totalLines: allLines.length, hasMatches: false };
}

export function Preview({
  node,
  content,
  isLoading,
  scroll,
  focused,
  height,
  width,
  searchPattern,
  contextLines,
}: PreviewProps) {
  // Process content for display
  const { lines: rawLines, totalLines } = useMemo(() => {
    if (!content || !node || node.isFolder) {
      return { lines: [], totalLines: 0, hasMatches: false };
    }
    return processContent(
      content,
      searchPattern || null,
      contextLines,
      node.ext
    );
  }, [content, node, searchPattern, contextLines]);

  // Calculate visible lines
  const startLine = Math.min(scroll, Math.max(0, totalLines - height));
  const visibleLines = rawLines.slice(startLine, startLine + height);

  // Format lines with line numbers and optional match highlighting
  const formattedLines = visibleLines.map((line, idx) => {
    const lineNum = startLine + idx + 1;
    const lineNumStr = String(lineNum).padStart(4, ' ');

    // Apply regex highlight if pattern exists
    let displayLine = line;
    if (searchPattern) {
      const regex = new RegExp(searchPattern.source, searchPattern.flags.replace('g', '') + 'g');
      // Note: This creates ANSI escape codes that Ink's Text will render
      displayLine = displayLine.replace(regex, (match) => `\x1b[43m\x1b[30m${match}\x1b[0m`);
    }

    return { lineNum: lineNumStr, content: displayLine };
  });

  // Calculate scroll percentage
  const scrollPercent = totalLines > height
    ? Math.round((scroll / (totalLines - height)) * 100)
    : 100;

  // Render folder info
  if (node?.isFolder) {
    return (
      <Box flexDirection="column" width={width} borderStyle="single" borderColor={focused ? 'cyan' : 'gray'}>
        <Box paddingX={1}>
          <Text bold>Folder</Text>
        </Box>
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text dimColor>Folder: {node.name}</Text>
          <Text dimColor>Files: {node.fileIndices.length}</Text>
          <Text dimColor>Tokens: {formatTokenCount(node.tokens)}</Text>
          <Box marginTop={1}><Text dimColor>Select folder to toggle all files</Text></Box>
        </Box>
      </Box>
    );
  }

  // Render file preview
  if (!node) {
    return (
      <Box flexDirection="column" width={width} borderStyle="single" borderColor="gray">
        <Box paddingX={1}>
          <Text dimColor>Preview</Text>
        </Box>
        <Box paddingX={2} paddingY={1}>
          <Text dimColor>No file selected</Text>
        </Box>
      </Box>
    );
  }

  // Truncate path if too long
  const displayPath = node.path.length > width - 10
    ? '...' + node.path.slice(-(width - 13))
    : node.path;

  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderColor={focused ? 'cyan' : 'gray'}>
      {/* Header */}
      <Box paddingX={1}>
        {focused && <Text color="cyan">[FOCUSED] </Text>}
        <Text bold>{displayPath}</Text>
        {contextLines && contextLines > 0 && (
          <Text color="yellow"> ({contextLines} lines context)</Text>
        )}
      </Box>

      {/* Content */}
      <Box flexDirection="column" paddingX={1} height={height}>
        {isLoading ? (
          <Text color="yellow">Loading...</Text>
        ) : (
          formattedLines.map((line, idx) => (
            <Text key={idx}>
              <Text dimColor>{line.lineNum}|</Text> {line.content}
            </Text>
          ))
        )}
      </Box>

      {/* Footer */}
      <Box paddingX={1}>
        <Text dimColor>--- {scrollPercent}% ({totalLines} lines) ---</Text>
      </Box>
    </Box>
  );
}
