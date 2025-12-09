/**
 * Interactive file selection UI for packx
 * Tree-based checkbox with folder/extension toggling
 * Enhanced with file content preview pane
 */

import { createPrompt, useState, useKeypress, useRef, isEnterKey, isSpaceKey, isUpKey, isDownKey } from "@inquirer/core";
import { readFileSync, existsSync } from "node:fs";
import { Minimatch } from "minimatch";
import { formatTokenCount } from "../analysis.js";
import { extractContextWindows, formatContextWindows } from "../context.js";
import type { FileChoice, TreeNode, TreeCheckboxConfig, ContextWindow } from "../types.js";

// Result type that includes selection and optional glob pattern
export type InteractiveResult = {
  selectedPaths: string[];
  globPattern?: string;  // The glob pattern used to filter (if any)
};

// Re-export types for convenience
export type { FileChoice, TreeNode, TreeCheckboxConfig } from "../types.js";

// Cache for file contents to avoid repeated reads
const fileContentCache = new Map<string, string>();

/**
 * Read file content with caching (synchronous for use in render loop)
 */
function readFileContentSync(filePath: string): string {
  if (fileContentCache.has(filePath)) {
    return fileContentCache.get(filePath)!;
  }
  try {
    if (!existsSync(filePath)) {
      return `[File not found: ${filePath}]`;
    }
    const content = readFileSync(filePath, 'utf8');
    // Limit cache size to prevent memory issues
    if (fileContentCache.size > 100) {
      const firstKey = fileContentCache.keys().next().value;
      if (firstKey) fileContentCache.delete(firstKey);
    }
    fileContentCache.set(filePath, content);
    return content;
  } catch (error) {
    return `[Error reading file: ${error}]`;
  }
}

/**
 * Get terminal width, defaulting to 80 if unavailable
 */
function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/**
 * Truncate or pad a string to a specific width
 */
function fitToWidth(str: string, width: number): string {
  // Remove ANSI codes for length calculation
  const plainStr = str.replace(/\x1b\[[0-9;]*m/g, '');
  if (plainStr.length > width) {
    return str.slice(0, width - 3) + '...';
  }
  return str + ' '.repeat(Math.max(0, width - plainStr.length));
}

/**
 * Format preview content with line numbers and optional match highlighting
 */
function formatPreviewContent(
  content: string,
  previewHeight: number,
  scrollOffset: number,
  pattern: RegExp | null,
  contextLines?: number
): { lines: string[]; totalLines: number; hasMatches: boolean } {
  const allLines = content.split('\n');

  // If we have a pattern and context lines, show context windows instead
  if (pattern && contextLines) {
    const windows = extractContextWindows(content, pattern, contextLines, false);
    if (windows.length > 0) {
      const formatted = formatContextWindows(windows, '');
      const contextLinesArr = formatted.split('\n');
      const visibleLines = contextLinesArr.slice(scrollOffset, scrollOffset + previewHeight);
      return { lines: visibleLines, totalLines: contextLinesArr.length, hasMatches: true };
    }
  }

  // Regular file preview with optional pattern highlighting
  const startLine = Math.min(scrollOffset, Math.max(0, allLines.length - previewHeight));
  const visibleLines = allLines.slice(startLine, startLine + previewHeight);

  const formattedLines = visibleLines.map((line, idx) => {
    const lineNum = startLine + idx + 1;
    const lineNumStr = String(lineNum).padStart(4, ' ');
    let displayLine = line;

    // Highlight matches if pattern provided
    if (pattern) {
      const regex = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g');
      displayLine = displayLine.replace(regex, (match) => `\x1b[43m\x1b[30m${match}\x1b[0m`);
    }

    return `\x1b[90m${lineNumStr}|\x1b[0m ${displayLine}`;
  });

  return { lines: formattedLines, totalLines: allLines.length, hasMatches: false };
}

/**
 * Build tree structure from flat file list
 */
export function buildFileTree(files: FileChoice[]): { tree: TreeNode[], flatNodes: TreeNode[] } {
  const root: Map<string, TreeNode> = new Map();

  // Create folder nodes and file nodes
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const parts = file.relPath.split('/');
    let currentPath = '';

    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      const isFile = j === parts.length - 1;
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!root.has(currentPath)) {
        const node: TreeNode = {
          name: part,
          path: currentPath,
          isFolder: !isFile,
          depth: j,
          tokens: isFile ? file.tokens : 0,
          ext: isFile ? file.ext : '',
          children: [],
          fileIndices: isFile ? [i] : [],
        };
        root.set(currentPath, node);

        // Add to parent's children
        if (parentPath && root.has(parentPath)) {
          root.get(parentPath)!.children.push(node);
        }
      } else if (isFile) {
        // File already exists (shouldn't happen, but handle it)
        root.get(currentPath)!.fileIndices.push(i);
      }
    }
  }

  // Calculate folder tokens and collect file indices
  function calcFolderTokens(node: TreeNode): { tokens: number; indices: number[] } {
    if (!node.isFolder) {
      return { tokens: node.tokens, indices: node.fileIndices };
    }
    let totalTokens = 0;
    const allIndices: number[] = [];
    for (const child of node.children) {
      const result = calcFolderTokens(child);
      totalTokens += result.tokens;
      allIndices.push(...result.indices);
    }
    node.tokens = totalTokens;
    node.fileIndices = allIndices;
    return { tokens: totalTokens, indices: allIndices };
  }

  // Get top-level nodes and calculate tokens
  const topLevel: TreeNode[] = [];
  for (const [nodePath, node] of root) {
    if (!nodePath.includes('/')) {
      topLevel.push(node);
      calcFolderTokens(node);
    }
  }

  // Flatten tree for display (respecting collapsed state)
  function flattenTree(nodes: TreeNode[], collapsed: Set<string>): TreeNode[] {
    const result: TreeNode[] = [];
    // Sort: folders first, then by token count (largest first)
    const sorted = [...nodes].sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return b.tokens - a.tokens; // Sort by tokens descending
    });
    for (const node of sorted) {
      result.push(node);
      if (node.isFolder && !collapsed.has(node.path)) {
        result.push(...flattenTree(node.children, collapsed));
      }
    }
    return result;
  }

  return { tree: topLevel, flatNodes: flattenTree(topLevel, new Set()) };
}

/**
 * Tree checkbox prompt for file selection with optional preview pane
 * Returns InteractiveResult with selected paths and optional glob pattern
 */
export const treeCheckbox = createPrompt<InteractiveResult, TreeCheckboxConfig>((config, done) => {
  const {
    files,
    pageSize = 20,
    showPreview = false,
    previewWidth: configPreviewWidth,
    searchPattern = null,
    contextLines,
    packignoreIndices = new Set<number>()
  } = config;

  // Build initial tree
  const { tree } = buildFileTree(files);

  // State
  const [cursor, setCursor] = useState<number>(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Files matching packignore patterns start unselected; all others start selected
  const initialSelected = new Set<number>(
    files.map((_, i) => i).filter(i => !packignoreIndices.has(i))
  );
  const [selected, setSelected] = useState<Set<number>>(initialSelected);
  const [showExtensions, setShowExtensions] = useState<boolean>(false);
  const [filterText, setFilterText] = useState<string>('');
  const [filterCursor, setFilterCursor] = useState<number>(0);
  const [isFiltering, setIsFiltering] = useState<boolean>(false);
  const [isGlobMode, setIsGlobMode] = useState<boolean>(false);  // Track if filter contains glob chars

  // Preview state
  const [previewScroll, setPreviewScroll] = useState<number>(0);
  const [previewFocused, setPreviewFocused] = useState<boolean>(false);
  const lastPreviewPath = useRef<string>('');

  // Flatten tree with current collapsed state
  function getFlatNodes(): TreeNode[] {
    function flatten(nodes: TreeNode[]): TreeNode[] {
      const result: TreeNode[] = [];
      // Sort: folders first, then by token count (largest first)
      const sorted = [...nodes].sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return b.tokens - a.tokens;
      });
      for (const node of sorted) {
        result.push(node);
        if (node.isFolder && !collapsed.has(node.path)) {
          result.push(...flatten(node.children));
        }
      }
      return result;
    }
    let nodes = flatten(tree);

    // Apply filter if active
    if (filterText) {
      // Check if it's a glob pattern
      const hasGlobChars = /[\*\?\[\]\{\}!]/.test(filterText);
      if (hasGlobChars) {
        // Use minimatch for glob matching
        try {
          const mm = new Minimatch(filterText, { nocase: true, matchBase: true });
          nodes = nodes.filter(node => mm.match(node.path) || mm.match(node.name));
        } catch {
          // Invalid glob, fall back to substring match
          const lowerFilter = filterText.toLowerCase();
          nodes = nodes.filter(node => node.path.toLowerCase().includes(lowerFilter));
        }
      } else {
        // Simple substring match
        const lowerFilter = filterText.toLowerCase();
        nodes = nodes.filter(node => node.path.toLowerCase().includes(lowerFilter));
      }
    }
    return nodes;
  }

  // Get extension summary
  function getExtensionSummary(): { ext: string; count: number; tokens: number; allSelected: boolean; indices: number[] }[] {
    const extMap = new Map<string, { count: number; tokens: number; indices: number[] }>();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.ext || '(no ext)';
      if (!extMap.has(ext)) {
        extMap.set(ext, { count: 0, tokens: 0, indices: [] });
      }
      const entry = extMap.get(ext)!;
      entry.count++;
      entry.tokens += file.tokens;
      entry.indices.push(i);
    }
    return Array.from(extMap.entries())
      .map(([ext, data]) => ({
        ext,
        ...data,
        allSelected: data.indices.every(i => selected.has(i)),
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }

  const flatNodes = getFlatNodes();
  const extSummary = getExtensionSummary();

  // Get current preview content based on cursor position
  let previewContent = '';
  if (showPreview) {
    const node = flatNodes[cursor];
    if (node && !node.isFolder) {
      const fileIdx = node.fileIndices[0];
      if (fileIdx !== undefined) {
        const file = files[fileIdx];
        if (file) {
          // Reset scroll when file changes
          if (file.path !== lastPreviewPath.current) {
            lastPreviewPath.current = file.path;
            // Note: We can't reset scroll here since we're in render, but the scroll
            // will reset on next navigation keystroke
          }
          previewContent = readFileContentSync(file.path);
        }
      }
    }
  }

  useKeypress((key: any) => {
    if (isEnterKey(key)) {
      if (isFiltering) {
        setIsFiltering(false);
        setCursor(0);
        return;
      }
      const selectedPaths = files.filter((_, i) => selected.has(i)).map(f => f.path);
      // Include glob pattern if one was used and has glob characters
      const hasGlobChars = /[\*\?\[\]\{\}!]/.test(filterText);
      const result: InteractiveResult = {
        selectedPaths,
        globPattern: hasGlobChars && filterText ? filterText : undefined,
      };
      done(result);
      return;
    }

    // Filter input mode
    if (isFiltering) {
      if (key.name === 'escape') {
        setIsFiltering(false);
        setFilterText('');
        setFilterCursor(0);
        setCursor(0);
      } else if (key.name === 'left') {
        // Move cursor left in filter text
        setFilterCursor(Math.max(0, filterCursor - 1));
      } else if (key.name === 'right') {
        // Move cursor right in filter text
        setFilterCursor(Math.min(filterText.length, filterCursor + 1));
      } else if (key.name === 'home' || (key.ctrl && key.name === 'a')) {
        // Move cursor to start
        setFilterCursor(0);
      } else if (key.name === 'end' || (key.ctrl && key.name === 'e')) {
        // Move cursor to end
        setFilterCursor(filterText.length);
      } else if (key.name === 'backspace') {
        // Delete character before cursor
        if (filterCursor > 0) {
          const newText = filterText.slice(0, filterCursor - 1) + filterText.slice(filterCursor);
          setFilterText(newText);
          setFilterCursor(filterCursor - 1);
          setCursor(0);
        }
      } else if (key.name === 'delete') {
        // Delete character at cursor
        if (filterCursor < filterText.length) {
          const newText = filterText.slice(0, filterCursor) + filterText.slice(filterCursor + 1);
          setFilterText(newText);
          setCursor(0);
        }
      } else if (key.ctrl && key.name === 'u') {
        // Clear entire filter
        setFilterText('');
        setFilterCursor(0);
        setCursor(0);
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        // Insert character at cursor position
        const newText = filterText.slice(0, filterCursor) + key.sequence + filterText.slice(filterCursor);
        setFilterText(newText);
        setFilterCursor(filterCursor + 1);
        setCursor(0);
      }
      return;
    }

    if (showExtensions) {
      // Extension mode navigation
      if (isUpKey(key)) {
        setCursor(cursor > 0 ? cursor - 1 : extSummary.length - 1);
      } else if (isDownKey(key)) {
        setCursor(cursor < extSummary.length - 1 ? cursor + 1 : 0);
      } else if (isSpaceKey(key)) {
        // Toggle all files of this extension
        const ext = extSummary[cursor];
        if (ext) {
          const next = new Set(selected);
          if (ext.allSelected) {
            ext.indices.forEach(i => next.delete(i));
          } else {
            ext.indices.forEach(i => next.add(i));
          }
          setSelected(next);
        }
      } else if (key.name === 'e' || key.name === 'escape') {
        setShowExtensions(false);
        setCursor(0);
      }
      return;
    }

    // Tree mode navigation
    if (isUpKey(key)) {
      const newCursor = cursor > 0 ? cursor - 1 : flatNodes.length - 1;
      setCursor(newCursor);
      // Reset preview scroll when changing files
      if (showPreview && !previewFocused) {
        setPreviewScroll(0);
      }
    } else if (isDownKey(key)) {
      const newCursor = cursor < flatNodes.length - 1 ? cursor + 1 : 0;
      setCursor(newCursor);
      // Reset preview scroll when changing files
      if (showPreview && !previewFocused) {
        setPreviewScroll(0);
      }
    } else if (isSpaceKey(key)) {
      // Toggle current item (file or folder)
      const node = flatNodes[cursor];
      if (node) {
        const next = new Set(selected);
        const allSelected = node.fileIndices.every(i => selected.has(i));
        if (allSelected) {
          node.fileIndices.forEach(i => next.delete(i));
        } else {
          node.fileIndices.forEach(i => next.add(i));
        }
        setSelected(next);
      }
    } else if (key.name === 'left') {
      // Collapse folder or go to parent
      const node = flatNodes[cursor];
      if (node?.isFolder && !collapsed.has(node.path)) {
        const next = new Set(collapsed);
        next.add(node.path);
        setCollapsed(next);
      }
    } else if (key.name === 'right') {
      // Expand folder
      const node = flatNodes[cursor];
      if (node?.isFolder && collapsed.has(node.path)) {
        const next = new Set(collapsed);
        next.delete(node.path);
        setCollapsed(next);
      }
    } else if (key.name === 'a') {
      // Toggle all (visible if filtered)
      const visibleIndices = flatNodes.flatMap(n => n.fileIndices);
      const allVisibleSelected = visibleIndices.every(i => selected.has(i));
      const next = new Set(selected);
      if (allVisibleSelected) {
        visibleIndices.forEach(i => next.delete(i));
      } else {
        visibleIndices.forEach(i => next.add(i));
      }
      setSelected(next);
    } else if (key.name === 'e') {
      // Switch to extension mode
      setShowExtensions(true);
      setCursor(0);
    } else if (key.sequence === '/') {
      // Enter filter mode
      setIsFiltering(true);
    } else if (key.name === 'escape' && filterText) {
      // Clear filter
      setFilterText('');
      setCursor(0);
    } else if (showPreview && key.name === 'tab') {
      // Toggle focus between tree and preview
      setPreviewFocused(!previewFocused);
    } else if (showPreview && previewFocused) {
      // Preview scrolling when focused
      const previewHeight = Math.min(pageSize, 15);
      const totalLines = previewContent.split('\n').length;

      if (key.name === 'pageup' || (key.ctrl && key.name === 'u')) {
        setPreviewScroll(Math.max(0, previewScroll - previewHeight));
      } else if (key.name === 'pagedown' || (key.ctrl && key.name === 'd')) {
        setPreviewScroll(Math.min(totalLines - previewHeight, previewScroll + previewHeight));
      } else if (key.name === 'home' || key.name === 'g') {
        setPreviewScroll(0);
      } else if (key.name === 'end' || key.name === 'G') {
        setPreviewScroll(Math.max(0, totalLines - previewHeight));
      }
    }
  });

  // Calculate totals
  const selectedTokens = files
    .filter((_, i) => selected.has(i))
    .reduce((sum, f) => sum + f.tokens, 0);
  const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);

  if (showExtensions) {
    // Render extension list
    const lines = extSummary.map((ext, i) => {
      const isCursor = i === cursor;
      const checkbox = ext.allSelected ? '◉' : (ext.indices.some(idx => selected.has(idx)) ? '◐' : '○');
      const pointer = isCursor ? '❯' : ' ';
      const style = isCursor ? '\x1b[36m' : (ext.allSelected ? '\x1b[32m' : '\x1b[90m');
      const reset = '\x1b[0m';
      return `${style}${pointer} ${checkbox} ${ext.ext} (${ext.count} files, ${formatTokenCount(ext.tokens)} tokens)${reset}`;
    });

    const totalLine = `\n\x1b[1m📊 Selected: ${formatTokenCount(selectedTokens)} / ${formatTokenCount(totalTokens)} tokens (${selected.size}/${files.length} files)\x1b[0m`;
    const helpLine = '\x1b[90m(↑↓ navigate, space toggle ext, e/esc back to tree, enter confirm)\x1b[0m';

    return `📁 Filter by Extension:\n${lines.join('\n')}${totalLine}\n${helpLine}`;
  }

  // Render tree view with pagination
  const startIdx = Math.max(0, Math.min(cursor - Math.floor(pageSize / 2), flatNodes.length - pageSize));
  const endIdx = Math.min(startIdx + pageSize, flatNodes.length);
  const visibleNodes = flatNodes.slice(startIdx, endIdx);

  const treeLines = visibleNodes.map((node, i) => {
    const actualIdx = startIdx + i;
    const isCursor = actualIdx === cursor;
    const allSelected = node.fileIndices.every(idx => selected.has(idx));
    const someSelected = node.fileIndices.some(idx => selected.has(idx));
    const checkbox = allSelected ? '◉' : (someSelected ? '◐' : '○');
    const pointer = isCursor ? '❯' : ' ';
    const indent = '  '.repeat(node.depth);

    let icon = '';
    if (node.isFolder) {
      icon = collapsed.has(node.path) ? '▸ ' : '▾ ';
    } else {
      icon = '  ';
    }

    const tokenStr = ` (${formatTokenCount(node.tokens)})`;
    const style = isCursor ? '\x1b[36m' : (allSelected ? '\x1b[32m' : (someSelected ? '\x1b[33m' : '\x1b[90m'));
    const reset = '\x1b[0m';
    const folderStyle = node.isFolder ? '\x1b[1m' : '';

    return `${style}${pointer} ${checkbox} ${indent}${icon}${folderStyle}${node.name}${reset}${style}${tokenStr}${reset}`;
  });

  // Add scroll indicators
  if (startIdx > 0) {
    treeLines.unshift('\x1b[90m  ↑ more above\x1b[0m');
  }
  if (endIdx < flatNodes.length) {
    treeLines.push('\x1b[90m  ↓ more below\x1b[0m');
  }

  const totalLine = `\n\x1b[1m📊 Selected: ${formatTokenCount(selectedTokens)} / ${formatTokenCount(totalTokens)} tokens (${selected.size}/${files.length} files)\x1b[0m`;

  // Show filter input or help line
  let filterLine = '';
  const hasGlobChars = /[\*\?\[\]\{\}!]/.test(filterText);
  if (isFiltering) {
    // Show cursor in filter text
    const beforeCursor = filterText.slice(0, filterCursor);
    const afterCursor = filterText.slice(filterCursor);
    const cursorChar = afterCursor.length > 0 ? afterCursor[0] : ' ';
    const restAfterCursor = afterCursor.slice(1);
    const filterDisplay = `${beforeCursor}\x1b[7m${cursorChar}\x1b[0m\x1b[33m${restAfterCursor}`;
    const modeHint = hasGlobChars ? ' (glob)' : '';
    filterLine = `\x1b[33m🔍 Filter${modeHint}: ${filterDisplay}\x1b[0m  \x1b[90m(←→ move, enter apply, esc cancel, supports *.ts globs)\x1b[0m`;
  } else if (filterText) {
    const modeHint = hasGlobChars ? ' (glob)' : '';
    filterLine = `\x1b[33m🔍 Filter${modeHint}: "${filterText}"\x1b[0m  \x1b[90m(showing ${flatNodes.length} matches, esc clear)\x1b[0m`;
  }

  // Determine if we should show preview
  if (showPreview) {
    // Calculate layout dimensions
    const termWidth = getTerminalWidth();
    const previewWidth = configPreviewWidth || Math.floor(termWidth * 0.5);
    const treeWidth = Math.floor(termWidth * 0.45);
    const previewHeight = Math.min(pageSize, 15);

    // Get current node info for preview header
    const currentNode = flatNodes[cursor];
    const isFile = currentNode && !currentNode.isFolder;

    // Format preview content
    let previewLines: string[] = [];
    let previewHeader = '';
    let previewFooter = '';

    if (isFile && previewContent) {
      const { lines: formattedPreview, totalLines, hasMatches } = formatPreviewContent(
        previewContent,
        previewHeight,
        previewScroll,
        searchPattern,
        contextLines
      );
      previewLines = formattedPreview;

      // Preview header with file info
      const displayPath = currentNode.path.length > previewWidth - 10
        ? '...' + currentNode.path.slice(-(previewWidth - 13))
        : currentNode.path;

      const focusIndicator = previewFocused ? '\x1b[36m[FOCUSED]\x1b[0m ' : '';
      previewHeader = `${focusIndicator}\x1b[1m📄 ${displayPath}\x1b[0m`;

      if (hasMatches && contextLines) {
        previewHeader += ` \x1b[33m(${contextLines} lines context)\x1b[0m`;
      }

      // Scroll indicator
      const scrollPercent = totalLines > previewHeight
        ? Math.round((previewScroll / (totalLines - previewHeight)) * 100)
        : 100;
      previewFooter = `\x1b[90m─── ${scrollPercent}% (${totalLines} lines) ───\x1b[0m`;
    } else if (currentNode?.isFolder) {
      previewHeader = '\x1b[1m📁 Folder\x1b[0m';
      previewLines = [
        '',
        `  \x1b[90mFolder: ${currentNode.name}\x1b[0m`,
        `  \x1b[90mFiles: ${currentNode.fileIndices.length}\x1b[0m`,
        `  \x1b[90mTokens: ${formatTokenCount(currentNode.tokens)}\x1b[0m`,
        '',
        '  \x1b[90mSelect folder to toggle all files\x1b[0m'
      ];
      previewFooter = '\x1b[90m─────────────────\x1b[0m';
    } else {
      previewHeader = '\x1b[90m📄 Preview\x1b[0m';
      previewLines = ['', '  \x1b[90mLoading...\x1b[0m'];
      previewFooter = '\x1b[90m─────────────────\x1b[0m';
    }

    // Pad preview lines to match tree height
    while (previewLines.length < previewHeight) {
      previewLines.push('');
    }

    // Build split-pane layout
    const separator = ' │ ';
    const separatorWidth = 3;

    // Combine tree and preview lines side by side
    const combinedLines: string[] = [];
    const maxLines = Math.max(treeLines.length, previewLines.length + 2); // +2 for header and footer

    for (let i = 0; i < maxLines; i++) {
      const treeLine = treeLines[i] || '';
      let previewLine = '';

      if (i === 0) {
        previewLine = previewHeader;
      } else if (i === maxLines - 1) {
        previewLine = previewFooter;
      } else {
        previewLine = previewLines[i - 1] || '';
      }

      // Truncate lines to fit width
      const treeLineFit = fitToWidth(treeLine, treeWidth);
      const previewLineFit = fitToWidth(previewLine, previewWidth);

      combinedLines.push(`${treeLineFit}${separator}${previewLineFit}`);
    }

    const helpLine = previewFocused
      ? '\x1b[90m(tab: back to tree, PgUp/PgDn: scroll, g/G: top/bottom)\x1b[0m'
      : '\x1b[90m(↑↓ navigate, space toggle, tab: preview, a all, e extensions, / filter, enter confirm)\x1b[0m';

    return `${config.message}\n${filterLine ? filterLine + '\n' : ''}${combinedLines.join('\n')}${totalLine}\n${helpLine}`;
  }

  // Standard view without preview
  const helpLine = '\x1b[90m(↑↓ navigate, ←→ collapse/expand, space toggle, a all, e extensions, / filter, enter confirm)\x1b[0m';

  return `${config.message}\n${filterLine ? filterLine + '\n' : ''}${treeLines.join('\n')}${totalLine}\n${helpLine}`;
});

/**
 * Run interactive file selection and return selected file paths with optional glob pattern
 */
export async function runInteractiveSelection(
  files: { path: string; relPath: string; tokens: number; ext: string }[],
  options: { message?: string; pageSize?: number } = {}
): Promise<InteractiveResult> {
  const { message = "Select files to bundle:", pageSize = 20 } = options;

  const fileChoices: FileChoice[] = files.map(f => ({
    path: f.path,
    relPath: f.relPath,
    tokens: f.tokens,
    ext: f.ext,
  }));

  return treeCheckbox({
    message,
    files: fileChoices,
    pageSize,
  });
}
