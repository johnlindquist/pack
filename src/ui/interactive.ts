/**
 * Interactive file selection UI for packx
 * Tree-based checkbox with folder/extension toggling
 * Enhanced with file content preview pane
 */

import { createPrompt, useState, useKeypress, isEnterKey, isSpaceKey, isUpKey, isDownKey, useEffect, useMemo } from "@inquirer/core";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { Minimatch } from "minimatch";
import { Fzf } from "fzf";
import { highlight, supportsLanguage } from 'cli-highlight';
import { formatTokenCount } from "../analysis.js";
import { extractContextWindows, formatContextWindows } from "../context.js";
import { extractDependencies } from "../dependencies.js";
import type { FileChoice, TreeNode, TreeCheckboxConfig } from "../types.js";

// Result type that includes selection and optional glob pattern
export type InteractiveResult = {
  selectedPaths: string[];
  globPattern?: string;  // The glob pattern used to filter (if any)
  stripComments?: boolean;  // Whether to strip comments from output
  contextLines?: number;    // Number of context lines around matches
};

// Re-export types for convenience
export type { FileChoice, TreeNode, TreeCheckboxConfig } from "../types.js";

// Cache for file contents to avoid repeated reads
const fileContentCache = new Map<string, string>();
const MAX_PREVIEW_BYTES = 20 * 1024; // OPTIMIZATION #4: Limit preview read to 20KB

/**
 * Render a visual token budget progress bar
 * Shows selected tokens vs limit with color coding:
 * - Green (0-60%): Safe zone
 * - Yellow (60-85%): Caution zone
 * - Red (85%+): Danger zone
 */
function renderTokenBudgetBar(
  selectedTokens: number,
  totalTokens: number,
  limit: number,
  terminalWidth: number
): string {
  const percentage = Math.min(100, (selectedTokens / limit) * 100);

  // Calculate bar width (reserve space for labels and brackets)
  // Format: [████████........] 15.4k / 32k (48%)
  const labelWidth = 30; // Space for " 15.4k / 32k (48%)" etc
  const barWidth = Math.max(10, Math.min(40, terminalWidth - labelWidth - 4));

  const filledCount = Math.round((percentage / 100) * barWidth);
  const emptyCount = barWidth - filledCount;

  // Color based on percentage
  let color: string;
  if (percentage < 60) {
    color = '\x1b[32m'; // Green
  } else if (percentage < 85) {
    color = '\x1b[33m'; // Yellow
  } else {
    color = '\x1b[31m'; // Red
  }
  const reset = '\x1b[0m';

  // Format token counts with k suffix
  const formatK = (n: number): string => {
    if (n >= 1000) {
      return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return n.toString();
  };

  const filled = '\u2588'.repeat(filledCount);  // Full block
  const empty = '\u2591'.repeat(emptyCount);     // Light shade
  const percentStr = percentage.toFixed(0) + '%';

  return `${color}[${filled}${empty}]${reset} ${formatK(selectedTokens)} / ${formatK(limit)} (${percentStr})`;
}

/**
 * Get terminal dimensions, defaulting to 80x24 if unavailable
 */
function getTerminalDimensions(): { width: number; height: number } {
  return {
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24
  };
}

/**
 * Truncate or pad a string to a specific width
 * OPTIMIZATION #9: Avoid Regex creation for simple strings
 */
function fitToWidth(str: string, width: number): string {
  // Fast path: if no ANSI codes, simple length check
  if (!str.includes('\x1b')) {
    if (str.length <= width) return str + ' '.repeat(width - str.length);
    return str.slice(0, width - 3) + '...';
  }

  // Slow path: Remove ANSI codes for length calculation
  const plainStr = str.replace(/\x1b\[[0-9;]*m/g, '');
  if (plainStr.length > width) {
    return str.slice(0, width - 3) + '...';
  }
  return str + ' '.repeat(Math.max(0, width - plainStr.length));
}

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
 * Format preview content with line numbers and optional match highlighting
 * OPTIMIZATION #5: Returns raw lines; highlighting applied only to visible lines in render
 */
function formatPreviewContent(
  content: string,
  pattern: RegExp | null,
  contextLines?: number,
  fileExt?: string
): { lines: string[]; totalLines: number; hasMatches: boolean } {
  // If we have a pattern and context lines, show context windows instead
  // Note: Context windows are NOT syntax highlighted (keep existing behavior)
  if (pattern && contextLines) {
    const windows = extractContextWindows(content, pattern, contextLines, false);
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

  // Flatten tree for display (used for initial value and testing)
  function flattenTree(nodes: TreeNode[], collapsedSet: Set<string>): TreeNode[] {
    const result: TreeNode[] = [];
    const sorted = [...nodes].sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return b.tokens - a.tokens;
    });
    for (const node of sorted) {
      result.push(node);
      if (node.isFolder && !collapsedSet.has(node.path)) {
        result.push(...flattenTree(node.children, collapsedSet));
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
    packignoreIndices = new Set<number>(),
    initialSelectedIndices,
    gitStatusMap,
    tokenLimit,
    onSemanticSearch,
  } = config;

  // OPTIMIZATION #1: Memoize tree construction (static for the prompt lifetime)
  const { tree } = useMemo(() => buildFileTree(files), [files]);

  // State
  const [cursor, setCursor] = useState<number>(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Initialize selection once
  const [selected, setSelected] = useState<Set<number>>(() => {
    // 1. If explicit initial selection provided (e.g., from a bundle), use it exactly
    if (initialSelectedIndices && initialSelectedIndices.size > 0) {
      return new Set(initialSelectedIndices);
    }
    // 2. Otherwise default to "Select All minus .packignore"
    return new Set<number>(
      files.map((_, i) => i).filter(i => !packignoreIndices.has(i))
    );
  });

  const [showExtensions, setShowExtensions] = useState<boolean>(false);
  const [filterText, setFilterText] = useState<string>('');
  const [filterCursor, setFilterCursor] = useState<number>(0);
  const [isFiltering, setIsFiltering] = useState<boolean>(false);

  // Banish state for quick ignoring files/folders
  const [banished, setBanished] = useState<Set<string>>(new Set());
  const [banishMessage, setBanishMessage] = useState<string>('');

  // Preview state
  const [previewScroll, setPreviewScroll] = useState<number>(0);
  const [previewFocused, setPreviewFocused] = useState<boolean>(false);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewFilePath, setPreviewFilePath] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);

  // Selection anchor for range selection (Shift+Space)
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);

  // Scroll throttling to prevent continued scrolling after key release
  const [lastScrollTime, setLastScrollTime] = useState<number>(0);
  const SCROLL_THROTTLE_MS = 25; // Minimum ms between scroll events

  // Dependency resolution feedback message
  const [depMessage, setDepMessage] = useState<string>('');

  // Live toggle state for context and comment stripping
  const [stripCommentsEnabled, setStripCommentsEnabled] = useState<boolean>(false);
  const [liveContextLines, setLiveContextLines] = useState<number>(contextLines || 0);

  // Help overlay state
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Semantic search state
  const [semanticResults, setSemanticResults] = useState<Map<string, number>>(new Map());
  const [isSemanticSearching, setIsSemanticSearching] = useState<boolean>(false);
  const [semanticMessage, setSemanticMessage] = useState<string>('');

  // Terminal dimensions (reactive to resize)
  const [terminalSize, setTerminalSize] = useState(getTerminalDimensions);

  // Listen for terminal resize events
  useEffect(() => {
    const handleResize = () => {
      setTerminalSize(getTerminalDimensions());
    };
    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  // Clear dependency message after 2 seconds
  useEffect(() => {
    if (depMessage) {
      const timer = setTimeout(() => setDepMessage(''), 2000);
      return () => clearTimeout(timer);
    }
  }, [depMessage]);

  // Auto-dismiss banish message after 2 seconds
  useEffect(() => {
    if (banishMessage) {
      const timer = setTimeout(() => setBanishMessage(''), 2000);
      return () => clearTimeout(timer);
    }
  }, [banishMessage]);

  // Clear semantic message after 3 seconds
  useEffect(() => {
    if (semanticMessage) {
      const timer = setTimeout(() => setSemanticMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [semanticMessage]);

  // OPTIMIZATION #6: Memoize flattened nodes
  // Recalculates ONLY when collapse state or filter changes
  const flatNodes = useMemo(() => {
    function flatten(nodes: TreeNode[]): TreeNode[] {
      const result: TreeNode[] = [];
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

    // Filter out banished paths
    if (banished.size > 0) {
      nodes = nodes.filter(node => {
        // Check if this node or any parent is banished
        for (const bannedPath of banished) {
          if (node.path === bannedPath || node.path.startsWith(bannedPath + '/')) {
            return false;
          }
        }
        return true;
      });
    }

    // Apply filter if active
    if (filterText) {
      // Check for semantic search prefix (@)
      if (filterText.startsWith('@') && semanticResults.size > 0) {
        // Filter and sort by semantic search results
        const matchedPaths = new Set(semanticResults.keys());
        nodes = nodes.filter(node => {
          if (node.isFolder) return false;
          const filePath = files[node.fileIndices[0]]?.path;
          return filePath && matchedPaths.has(filePath);
        });
        // Sort by score
        nodes.sort((a, b) => {
          const pathA = files[a.fileIndices[0]]?.path || '';
          const pathB = files[b.fileIndices[0]]?.path || '';
          return (semanticResults.get(pathB) || 0) - (semanticResults.get(pathA) || 0);
        });
      } else {
        const hasGlobChars = /[\*\?\[\]\{\}!]/.test(filterText);
        // OPTIMIZATION #8: Create matcher once outside loop
        if (hasGlobChars) {
          // Use glob matching for patterns like *.ts
          try {
            const mm = new Minimatch(filterText, { nocase: true, matchBase: true });
            nodes = nodes.filter(node => mm.match(node.path) || mm.match(node.name));
          } catch {
            const lowerFilter = filterText.toLowerCase();
            nodes = nodes.filter(node => node.path.toLowerCase().includes(lowerFilter));
          }
        } else {
          // Use fuzzy matching for plain text (e.g., "srcint" matches "src/ui/interactive.ts")
          const fzf = new Fzf(nodes, {
            selector: (node: TreeNode) => node.path,
          });
          const results = fzf.find(filterText);
          nodes = results.map(r => r.item);
        }
      }
    }
    return nodes;
  }, [tree, collapsed, filterText, banished, semanticResults, files]);

  // Clamp cursor when filtered results change (prevent out-of-bounds)
  useEffect(() => {
    if (cursor >= flatNodes.length && flatNodes.length > 0) {
      setCursor(flatNodes.length - 1);
    }
  }, [flatNodes.length]);

  // Clamp selection anchor when flatNodes changes (prevent out-of-bounds)
  useEffect(() => {
    if (selectionAnchor !== null && selectionAnchor >= flatNodes.length) {
      setSelectionAnchor(flatNodes.length > 0 ? flatNodes.length - 1 : null);
    }
  }, [flatNodes.length, selectionAnchor]);

  // OPTIMIZATION #7: Memoize extension summary
  const extSummary = useMemo(() => {
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
  }, [files, selected]);

  // OPTIMIZATION #2, #3, #4: Async, Debounced, Partial File Reading
  // Compute target file path without triggering state updates
  const targetFilePath = useMemo(() => {
    if (!showPreview) return '';
    const node = flatNodes[cursor];
    if (!node || node.isFolder) return '';
    const fileIdx = node.fileIndices[0];
    return files[fileIdx]?.path || '';
  }, [showPreview, flatNodes, cursor, files]);

  useEffect(() => {
    if (!targetFilePath) {
      // Only update if we were showing something before
      if (previewFilePath) {
        setPreviewContent('');
        setPreviewFilePath('');
      }
      return;
    }

    // Skip if we're already showing this file
    if (targetFilePath === previewFilePath) {
      return;
    }

    // Check cache first - update immediately without debounce
    if (fileContentCache.has(targetFilePath)) {
      setPreviewContent(fileContentCache.get(targetFilePath)!);
      setPreviewFilePath(targetFilePath);
      return;
    }

    // Show loading state immediately for uncached files
    setIsLoadingPreview(true);

    // Debounce the actual file read
    const timer = setTimeout(async () => {
      try {
        const handle = await fs.open(targetFilePath, 'r');
        try {
          const buffer = Buffer.alloc(MAX_PREVIEW_BYTES);
          const { bytesRead } = await handle.read(buffer, 0, MAX_PREVIEW_BYTES, 0);
          let content = buffer.toString('utf8', 0, bytesRead);
          if (bytesRead === MAX_PREVIEW_BYTES) {
            content += '\n... (preview truncated) ...';
          }
          fileContentCache.set(targetFilePath, content);
          setPreviewContent(content);
          setPreviewFilePath(targetFilePath);
        } finally {
          await handle.close();
        }
      } catch (err) {
        setPreviewContent(`[Error reading file: ${err}]`);
        setPreviewFilePath(targetFilePath);
      } finally {
        setIsLoadingPreview(false);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      // Reset loading state when timer is cancelled (fast scrolling)
      setIsLoadingPreview(false);
    };
  }, [targetFilePath, previewFilePath]);

  // OPTIMIZATION #10: Memoize layout calculations (line splitting)
  const { rawPreviewLines, previewTotalLines } = useMemo(() => {
    if (!previewContent) return { rawPreviewLines: [] as string[], previewTotalLines: 0 };

    // Get file extension from the current node for syntax highlighting
    const node = flatNodes[cursor];
    const fileExt = node && !node.isFolder ? node.ext : undefined;

    const { lines, totalLines } = formatPreviewContent(
      previewContent,
      searchPattern,
      liveContextLines || undefined,  // Use live value instead of prop
      fileExt
    );
    return { rawPreviewLines: lines, previewTotalLines: totalLines };
  }, [previewContent, searchPattern, liveContextLines, flatNodes, cursor]);

  useKeypress((key: any) => {
    // Toggle help overlay with '?' key (but not while filtering)
    if (key.sequence === '?' && !isFiltering) {
      setShowHelp(!showHelp);
      return;
    }

    // When help is shown, any key dismisses it
    if (showHelp) {
      setShowHelp(false);
      return;
    }

    if (isEnterKey(key)) {
      if (isFiltering) {
        // Check if this is a semantic search query (@query)
        if (filterText.startsWith('@') && onSemanticSearch && filterText.length > 1) {
          const query = filterText.slice(1).trim();
          if (query) {
            setIsSemanticSearching(true);
            setSemanticMessage('Searching...');
            (async () => {
              try {
                const results = await onSemanticSearch(query);
                const resultMap = new Map<string, number>();
                for (const r of results) {
                  resultMap.set(r.path, r.score);
                }
                setSemanticResults(resultMap);
                setSemanticMessage(`Found ${results.length} relevant files`);
              } catch (err) {
                setSemanticMessage('Semantic search failed');
                setSemanticResults(new Map());
              } finally {
                setIsSemanticSearching(false);
              }
            })();
          }
        }
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
        stripComments: stripCommentsEnabled || undefined,
        contextLines: liveContextLines > 0 ? liveContextLines : undefined,
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
          // Keep cursor position stable - only clamp if out of bounds after filter changes
        }
      } else if (key.name === 'delete') {
        // Delete character at cursor
        if (filterCursor < filterText.length) {
          const newText = filterText.slice(0, filterCursor) + filterText.slice(filterCursor + 1);
          setFilterText(newText);
          // Keep cursor position stable
        }
      } else if (key.ctrl && key.name === 'u') {
        // Clear entire filter
        setFilterText('');
        setFilterCursor(0);
        setCursor(0);
      } else if (isUpKey(key)) {
        // Allow up navigation while filtering (with throttling)
        const now = Date.now();
        if (now - lastScrollTime < SCROLL_THROTTLE_MS) return;
        setLastScrollTime(now);
        const newCursor = cursor > 0 ? cursor - 1 : flatNodes.length - 1;
        setCursor(newCursor);
        if (showPreview && !previewFocused) {
          setPreviewScroll(0);
        }
      } else if (isDownKey(key)) {
        // Allow down navigation while filtering (with throttling)
        const now = Date.now();
        if (now - lastScrollTime < SCROLL_THROTTLE_MS) return;
        setLastScrollTime(now);
        const newCursor = cursor < flatNodes.length - 1 ? cursor + 1 : 0;
        setCursor(newCursor);
        if (showPreview && !previewFocused) {
          setPreviewScroll(0);
        }
      } else if (isSpaceKey(key) || key.sequence === ' ') {
        // Toggle current item selection (don't add space to filter)
        // Note: Check both isSpaceKey and key.sequence because terminals report space differently
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
      } else if (key.sequence && key.sequence.length === 1 && key.sequence !== ' ' && !key.ctrl && !key.meta) {
        // Insert character at cursor position (space is handled above for toggle)
        const newText = filterText.slice(0, filterCursor) + key.sequence + filterText.slice(filterCursor);
        setFilterText(newText);
        setFilterCursor(filterCursor + 1);
        // Note: Don't reset cursor - keep selection stable while typing
      }
      return;
    }

    if (showExtensions) {
      // Extension mode navigation (with throttling)
      const now = Date.now();
      const shouldThrottleExt = now - lastScrollTime < SCROLL_THROTTLE_MS;

      if (isUpKey(key)) {
        if (shouldThrottleExt) return;
        setLastScrollTime(now);
        setCursor(cursor > 0 ? cursor - 1 : extSummary.length - 1);
      } else if (isDownKey(key)) {
        if (shouldThrottleExt) return;
        setLastScrollTime(now);
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

    // Tree mode navigation (supports vim-style j/k/g/G/h/l keys)
    // Throttle scroll events to prevent continued scrolling after key release
    const now = Date.now();
    const shouldThrottle = now - lastScrollTime < SCROLL_THROTTLE_MS;

    if (isUpKey(key) || key.name === 'k') {
      if (shouldThrottle) return; // Skip this scroll event
      setLastScrollTime(now);
      const newCursor = cursor > 0 ? cursor - 1 : flatNodes.length - 1;
      setCursor(newCursor);
      // Reset preview scroll when changing files
      if (showPreview && !previewFocused) {
        setPreviewScroll(0);
      }
    } else if (isDownKey(key) || key.name === 'j') {
      if (shouldThrottle) return; // Skip this scroll event
      setLastScrollTime(now);
      const newCursor = cursor < flatNodes.length - 1 ? cursor + 1 : 0;
      setCursor(newCursor);
      // Reset preview scroll when changing files
      if (showPreview && !previewFocused) {
        setPreviewScroll(0);
      }
    } else if (key.name === 'g' && !key.shift) {
      // Jump to top (first item) - vim style
      setCursor(0);
      if (showPreview && !previewFocused) {
        setPreviewScroll(0);
      }
    } else if (key.sequence === 'G') {
      // Jump to bottom (last item) - vim style (shift+g)
      setCursor(flatNodes.length - 1);
      if (showPreview && !previewFocused) {
        setPreviewScroll(0);
      }
    } else if (isSpaceKey(key)) {
      // Toggle current item (file or folder)
      const node = flatNodes[cursor];
      if (node) {
        const next = new Set(selected);

        // Check for shift modifier for range selection
        if (key.shift && selectionAnchor !== null) {
          // Range selection from anchor to cursor
          const start = Math.min(selectionAnchor, cursor);
          const end = Math.max(selectionAnchor, cursor);

          // Determine action based on anchor's current state
          const anchorNode = flatNodes[selectionAnchor];
          const shouldSelect = anchorNode && !anchorNode.fileIndices.every(i => selected.has(i));

          for (let i = start; i <= end; i++) {
            const rangeNode = flatNodes[i];
            if (rangeNode) {
              if (shouldSelect) {
                rangeNode.fileIndices.forEach(idx => next.add(idx));
              } else {
                rangeNode.fileIndices.forEach(idx => next.delete(idx));
              }
            }
          }
        } else {
          // Normal toggle (existing logic)
          const allSelected = node.fileIndices.every(i => selected.has(i));
          if (allSelected) {
            node.fileIndices.forEach(i => next.delete(i));
          } else {
            node.fileIndices.forEach(i => next.add(i));
          }
        }

        setSelected(next);
        // Update anchor to current position after any selection
        setSelectionAnchor(cursor);
      }
    } else if (key.name === 'v' && !previewFocused) {
      // Set/clear selection anchor for visual mode
      if (selectionAnchor === cursor) {
        // Clear anchor if pressing v on same position
        setSelectionAnchor(null);
      } else {
        setSelectionAnchor(cursor);
      }
    } else if (key.name === 'left' || key.name === 'h') {
      // Collapse folder or go to parent (h = vim style)
      const node = flatNodes[cursor];
      if (node?.isFolder && !collapsed.has(node.path)) {
        // Collapse expanded folder
        const next = new Set(collapsed);
        next.add(node.path);
        setCollapsed(next);
      } else if (node) {
        // On a file or already-collapsed folder: find and collapse parent
        const pathParts = node.path.split('/');
        if (pathParts.length > 1) {
          const parentPath = pathParts.slice(0, -1).join('/');
          const parentIndex = flatNodes.findIndex(n => n.path === parentPath && n.isFolder);
          if (parentIndex !== -1) {
            const next = new Set(collapsed);
            next.add(parentPath);
            setCollapsed(next);
            setCursor(parentIndex);
          }
        }
      }
    } else if (key.name === 'right' || key.name === 'l') {
      // Expand folder (l = vim style)
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
    } else if (key.name === 'x' && !previewFocused) {
      // Banish current item to .packignore
      const node = flatNodes[cursor];
      if (node) {
        // Get the relative path to banish
        const banishPath = node.path;

        // Deselect the node
        const next = new Set(selected);
        node.fileIndices.forEach(i => next.delete(i));
        setSelected(next);

        // Add to banished set (hides from UI)
        const nextBanished = new Set(banished);
        nextBanished.add(banishPath);
        setBanished(nextBanished);

        // Append to .packignore file
        (async () => {
          try {
            const packignorePath = path.join(process.cwd(), '.packignore');
            const entry = node.isFolder ? `${banishPath}/` : banishPath;
            await fs.appendFile(packignorePath, `\n${entry}`);
            setBanishMessage(`Banished: ${node.name} → .packignore`);
          } catch (err) {
            setBanishMessage(`Failed to update .packignore`);
          }
        })();

        // Move cursor if at end
        if (cursor >= flatNodes.length - 1 && cursor > 0) {
          setCursor(cursor - 1);
        }
      }
    } else if (key.name === 'o' && !previewFocused) {
      // Open current file in editor
      const node = flatNodes[cursor];
      if (node && !node.isFolder && node.fileIndices.length > 0) {
        const fileIdx = node.fileIndices[0];
        const filePath = files[fileIdx].path;

        // Detect editor from environment or use defaults
        const editor = process.env.VISUAL || process.env.EDITOR || 'code';

        // Spawn editor detached so it doesn't block
        try {
          const child = spawn(editor, [filePath], {
            detached: true,
            stdio: 'ignore'
          });
          child.unref();
        } catch {
          // Silently fail if editor can't be opened
        }
      }
    } else if (key.sequence === '/') {
      // Enter filter mode and scroll to top so filter line is visible
      setIsFiltering(true);
      setCursor(0);
    } else if (key.name === 'escape' && filterText) {
      // Clear filter
      setFilterText('');
      setCursor(0);
    } else if (key.name === 'd' && !previewFocused) {
      // Resolve dependencies for current file
      const node = flatNodes[cursor];
      if (node && !node.isFolder && node.fileIndices.length > 0) {
        const fileIdx = node.fileIndices[0];
        const filePath = files[fileIdx].path;

        // Use async IIFE since useKeypress callback is sync
        (async () => {
          const deps = await extractDependencies(filePath);
          if (deps.length === 0) {
            setDepMessage('No local dependencies found');
            return;
          }

          // Find indices of dependencies in our file list
          const depPaths = new Set(deps.map(d => d.resolvedPath));
          const matchedIndices: number[] = [];

          for (let i = 0; i < files.length; i++) {
            if (depPaths.has(files[i].path)) {
              matchedIndices.push(i);
            }
          }

          if (matchedIndices.length > 0) {
            const next = new Set(selected);
            matchedIndices.forEach(i => next.add(i));
            setSelected(next);
            setDepMessage(`Selected ${matchedIndices.length} dependencies`);
          } else {
            setDepMessage('Dependencies not in file list');
          }
        })();
      }
    } else if (key.name === 'c' && !previewFocused) {
      // Toggle strip comments
      setStripCommentsEnabled(!stripCommentsEnabled);
    } else if ((key.sequence === '+' || key.sequence === '=') && !previewFocused) {
      // Increase context lines
      setLiveContextLines(Math.min(liveContextLines + 1, 50));
    } else if ((key.sequence === '-' || key.sequence === '_') && !previewFocused) {
      // Decrease context lines
      setLiveContextLines(Math.max(liveContextLines - 1, 0));
    } else if (showPreview && key.name === 'tab') {
      // Toggle focus between tree and preview
      setPreviewFocused(!previewFocused);
    } else if (showPreview && previewFocused) {
      // Use terminal-aware height for scroll calculations
      const reservedForScroll = (isFiltering || filterText) ? 9 : 7;
      const maxLines = Math.max(5, terminalSize.height - reservedForScroll);
      const previewHeight = Math.min(Math.min(pageSize, maxLines), 15);
      const totalLines = previewTotalLines;

      // Throttle preview scroll events
      const nowPreview = Date.now();
      const shouldThrottlePreview = nowPreview - lastScrollTime < SCROLL_THROTTLE_MS;

      if (key.name === 'pageup' || key.name === 'u' || (key.ctrl && key.name === 'u')) {
        if (shouldThrottlePreview) return;
        setLastScrollTime(nowPreview);
        // Scroll up half page (u or ctrl+u = vim style)
        setPreviewScroll(Math.max(0, previewScroll - previewHeight));
      } else if (key.name === 'pagedown' || key.name === 'd' || (key.ctrl && key.name === 'd')) {
        if (shouldThrottlePreview) return;
        setLastScrollTime(nowPreview);
        // Scroll down half page (d or ctrl+d = vim style)
        setPreviewScroll(Math.min(totalLines - previewHeight, previewScroll + previewHeight));
      } else if (key.name === 'home' || key.name === 'g') {
        setPreviewScroll(0);
      } else if (key.name === 'end' || key.sequence === 'G') {
        setPreviewScroll(Math.max(0, totalLines - previewHeight));
      }
    }
  });

  // Calculate totals - Memoized to avoid frequent recalculation
  const selectedTokens = useMemo(() => files
    .filter((_, i) => selected.has(i))
    .reduce((sum, f) => sum + f.tokens, 0), [files, selected]);

  const totalTokens = useMemo(() => files.reduce((sum, f) => sum + f.tokens, 0), [files]);

  // Render help overlay when showHelp is true
  if (showHelp) {
    const hideCursor = '\x1b[?25l';
    const helpContent = `${hideCursor}
\x1b[1m╭──────────────────────────────────────────────────────────────╮
│                     KEYBOARD SHORTCUTS                       │
├──────────────────────────────────────────────────────────────┤
│  Navigation                                                  │
│    ↑/k, ↓/j     Move cursor up/down                         │
│    g            Jump to top                                  │
│    G            Jump to bottom                               │
│    ←/h          Collapse folder / go to parent              │
│    →/l          Expand folder                                │
├──────────────────────────────────────────────────────────────┤
│  Selection                                                   │
│    Space        Toggle selection                             │
│    Shift+Space  Range select (from anchor)                   │
│    v            Set/clear selection anchor                   │
│    a            Toggle all visible                           │
├──────────────────────────────────────────────────────────────┤
│  Features                                                    │
│    /            Search/filter files (fuzzy or glob)          │
│    /@query      Semantic search (natural language)           │
│    d            Select dependencies of current file          │
│    x            Banish to .packignore                        │
│    o            Open file in editor                          │
│    e            Extension filter mode                        │
│    c            Toggle comment stripping                     │
│    +/-          Adjust context lines                         │
├──────────────────────────────────────────────────────────────┤
│  Preview (when enabled)                                      │
│    Tab          Focus preview pane                           │
│    PgUp/PgDn    Scroll preview                               │
├──────────────────────────────────────────────────────────────┤
│    Enter        Confirm selection                            │
│    ?            Toggle this help                             │
╰──────────────────────────────────────────────────────────────╯\x1b[0m

\x1b[90mPress any key to close\x1b[0m`;
    return helpContent;
  }

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

    // Token summary line - use progress bar if limit is set
    let totalLine: string;
    if (tokenLimit) {
      const budgetBar = renderTokenBudgetBar(selectedTokens, totalTokens, tokenLimit, terminalSize.width);
      totalLine = `\n\x1b[1m📊 Token Budget: ${budgetBar} (${selected.size}/${files.length} files)\x1b[0m`;
    } else {
      totalLine = `\n\x1b[1m📊 Selected: ${formatTokenCount(selectedTokens)} / ${formatTokenCount(totalTokens)} tokens (${selected.size}/${files.length} files)\x1b[0m`;
    }
    const helpLine = '\x1b[90m(↑↓ navigate, space toggle ext, e/esc back to tree, enter confirm)\x1b[0m';

    // Hide cursor to prevent jiggle in footer area
    const hideCursor = '\x1b[?25l';
    return `${hideCursor}📁 Filter by Extension:\n${lines.join('\n')}${totalLine}\n${helpLine}`;
  }

  // Render tree view with pagination
  // Calculate available lines based on terminal height to prevent filter from scrolling off
  // Reserve space for: message(1) + filter(2 when active) + totalLine(2) + helpLine(1) + scroll indicators(2) + buffer(2)
  const reservedLines = (isFiltering || filterText) ? 9 : 7;
  const maxTreeLines = Math.max(5, terminalSize.height - reservedLines);
  const effectivePageSize = Math.min(pageSize, maxTreeLines);
  const startIdx = Math.max(0, Math.min(cursor - Math.floor(effectivePageSize / 2), flatNodes.length - effectivePageSize));
  const endIdx = Math.min(startIdx + effectivePageSize, flatNodes.length);
  const visibleNodes = flatNodes.slice(startIdx, endIdx);

  const treeLines = visibleNodes.map((node, i) => {
    const actualIdx = startIdx + i;
    const isCursor = actualIdx === cursor;
    const isAnchor = actualIdx === selectionAnchor;
    const allSelected = node.fileIndices.every(idx => selected.has(idx));
    const someSelected = node.fileIndices.some(idx => selected.has(idx));
    const checkbox = allSelected ? '◉' : (someSelected ? '◐' : '○');

    // Modify pointer to show anchor
    let pointer = isCursor ? '❯' : ' ';
    if (isAnchor && !isCursor) {
      pointer = '┃';  // Show anchor marker
    } else if (isAnchor && isCursor) {
      pointer = '▶';  // Cursor + anchor combined
    }

    const indent = '  '.repeat(node.depth);

    let icon = '';
    if (node.isFolder) {
      icon = collapsed.has(node.path) ? '▸ ' : '▾ ';
    } else {
      icon = '  ';
    }

    // Get git status for this node
    let gitStatus = '';
    if (gitStatusMap && !node.isFolder) {
      const fileIdx = node.fileIndices[0];
      const filePath = files[fileIdx]?.path;
      if (filePath && gitStatusMap.has(filePath)) {
        const status = gitStatusMap.get(filePath);
        if (status === 'M') gitStatus = '\x1b[33m[M]\x1b[0m '; // Yellow
        else if (status === 'A') gitStatus = '\x1b[32m[A]\x1b[0m '; // Green
        else if (status === '?') gitStatus = '\x1b[31m[?]\x1b[0m '; // Red (untracked)
      }
    }

    const tokenStr = ` (${formatTokenCount(node.tokens)})`;
    const style = isCursor ? '\x1b[36m' : (allSelected ? '\x1b[32m' : (someSelected ? '\x1b[33m' : '\x1b[90m'));
    const reset = '\x1b[0m';
    const folderStyle = node.isFolder ? '\x1b[1m' : '';

    return `${style}${pointer} ${checkbox} ${indent}${icon}${gitStatus}${folderStyle}${node.name}${reset}${style}${tokenStr}${reset}`;
  });

  // Add scroll indicators
  if (startIdx > 0) {
    treeLines.unshift('\x1b[90m  ↑ more above\x1b[0m');
  }
  if (endIdx < flatNodes.length) {
    treeLines.push('\x1b[90m  ↓ more below\x1b[0m');
  }

  // Build toggles status string
  const togglesInfo: string[] = [];
  if (stripCommentsEnabled) togglesInfo.push('comments:off');
  if (liveContextLines > 0) togglesInfo.push(`ctx:${liveContextLines}`);
  const togglesStr = togglesInfo.length > 0 ? ` | ${togglesInfo.join(' ')}` : '';

  // Token summary line - use progress bar if limit is set
  let totalLine: string;
  if (tokenLimit) {
    const budgetBar = renderTokenBudgetBar(selectedTokens, totalTokens, tokenLimit, terminalSize.width);
    totalLine = `\n\x1b[1m📊 Token Budget: ${budgetBar} (${selected.size}/${files.length} files)${togglesStr}\x1b[0m`;
  } else {
    totalLine = `\n\x1b[1m📊 Selected: ${formatTokenCount(selectedTokens)} / ${formatTokenCount(totalTokens)} tokens (${selected.size}/${files.length} files)${togglesStr}\x1b[0m`;
  }

  // Show filter input or help line
  let filterLine = '';
  const hasGlobChars = /[\*\?\[\]\{\}!]/.test(filterText);
  const isSemanticQuery = filterText.startsWith('@');
  if (isFiltering) {
    // Show cursor in filter text
    const beforeCursor = filterText.slice(0, filterCursor);
    const afterCursor = filterText.slice(filterCursor);
    const cursorChar = afterCursor.length > 0 ? afterCursor[0] : ' ';
    const restAfterCursor = afterCursor.slice(1);
    const filterDisplay = `${beforeCursor}\x1b[7m${cursorChar}\x1b[0m\x1b[33m${restAfterCursor}`;
    const modeHint = isSemanticQuery ? ' (semantic)' : (hasGlobChars ? ' (glob)' : ' (fuzzy)');
    const hint = isSemanticQuery
      ? '(enter to search, @query for semantic search)'
      : '(←→ move, enter apply, esc cancel, @query for semantic)';
    filterLine = `\x1b[33m🔍 Filter${modeHint}: ${filterDisplay}\x1b[0m  \x1b[90m${hint}\x1b[0m`;
  } else if (filterText) {
    const modeHint = isSemanticQuery ? ' (semantic)' : (hasGlobChars ? ' (glob)' : ' (fuzzy)');
    filterLine = `\x1b[33m🔍 Filter${modeHint}: "${filterText}"\x1b[0m  \x1b[90m(showing ${flatNodes.length} matches, esc clear)\x1b[0m`;
  }
  // Add semantic search status
  if (semanticMessage) {
    filterLine += `\n\x1b[36m   ${semanticMessage}\x1b[0m`;
  }

  if (showPreview) {
    const termWidth = terminalSize.width;
    const previewWidth = configPreviewWidth || Math.floor(termWidth * 0.5);
    const treeWidth = Math.floor(termWidth * 0.45);
    // Use same height calculation as tree to keep filter visible
    const previewHeight = Math.min(effectivePageSize, 15);

    const currentNode = flatNodes[cursor];
    const isFile = currentNode && !currentNode.isFolder;

    let finalPreviewLines: string[] = [];
    let previewHeader = '';
    let previewFooter = '';

    if (isFile) {
      // OPTIMIZATION #5: Only format visible lines + scroll
      const startLine = Math.min(previewScroll, Math.max(0, previewTotalLines - previewHeight));

      // We map over ONLY the visible lines to apply highlighting
      finalPreviewLines = rawPreviewLines.slice(startLine, startLine + previewHeight).map((line, idx) => {
        const lineNum = startLine + idx + 1;
        const lineNumStr = String(lineNum).padStart(4, ' ');
        let displayLine = line;

        // Apply regex highlight only if pattern exists
        if (searchPattern) {
          const regex = new RegExp(searchPattern.source, searchPattern.flags.replace('g', '') + 'g');
          displayLine = displayLine.replace(regex, (match) => `\x1b[43m\x1b[30m${match}\x1b[0m`);
        }
        return `\x1b[90m${lineNumStr}|\x1b[0m ${displayLine}`;
      });

      const displayPath = currentNode.path.length > previewWidth - 10
        ? '...' + currentNode.path.slice(-(previewWidth - 13))
        : currentNode.path;

      const focusIndicator = previewFocused ? '\x1b[36m[FOCUSED]\x1b[0m ' : '';
      previewHeader = `${focusIndicator}\x1b[1m📄 ${displayPath}\x1b[0m`;

      if (contextLines) {
        previewHeader += ` \x1b[33m(${contextLines} lines context)\x1b[0m`;
      }

      const scrollPercent = previewTotalLines > previewHeight
        ? Math.round((previewScroll / (previewTotalLines - previewHeight)) * 100)
        : 100;
      previewFooter = `\x1b[90m─── ${scrollPercent}% (${previewTotalLines} lines) ───\x1b[0m`;
    } else if (currentNode?.isFolder) {
      previewHeader = '\x1b[1m📁 Folder\x1b[0m';
      finalPreviewLines = [
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
      finalPreviewLines = ['', '  \x1b[90mNo file selected\x1b[0m'];
      previewFooter = '\x1b[90m─────────────────\x1b[0m';
    }

    if (isLoadingPreview && isFile) {
      finalPreviewLines = ['', '  \x1b[33mLoading...\x1b[0m'];
    }

    while (finalPreviewLines.length < previewHeight) {
      finalPreviewLines.push('');
    }

    const separator = ' │ ';
    const combinedLines: string[] = [];
    const maxLines = Math.max(treeLines.length, finalPreviewLines.length + 2);

    for (let i = 0; i < maxLines; i++) {
      const treeLine = treeLines[i] || '';
      let previewLine = '';

      if (i === 0) {
        previewLine = previewHeader;
      } else if (i === maxLines - 1) {
        previewLine = previewFooter;
      } else {
        previewLine = finalPreviewLines[i - 1] || '';
      }

      const treeLineFit = fitToWidth(treeLine, treeWidth);
      const previewLineFit = fitToWidth(previewLine, previewWidth);

      combinedLines.push(`${treeLineFit}${separator}${previewLineFit}`);
    }

    const helpLine = previewFocused
      ? '\x1b[90m(tab: back to tree, PgUp/PgDn: scroll, ? help)\x1b[0m'
      : '\x1b[90m(? help, enter confirm)\x1b[0m';

    // Show dependency resolution feedback message
    const depMessageLine = depMessage ? `\x1b[33m${depMessage}\x1b[0m\n` : '';

    // Banish feedback message
    const banishLine = banishMessage ? `\x1b[33m${banishMessage}\x1b[0m\n` : '';

    // Hide cursor to prevent jiggle in footer area (cursor only needed when typing in filter)
    const hideCursor = '\x1b[?25l';
    return `${hideCursor}${config.message}\n${filterLine ? filterLine + '\n' : ''}${combinedLines.join('\n')}${totalLine}\n${depMessageLine}${banishLine}${helpLine}`;
  }

  // Standard view without preview
  const helpLine = '\x1b[90m(? help, enter confirm)\x1b[0m';

  // Show dependency resolution feedback message
  const depMessageLine = depMessage ? `\x1b[33m${depMessage}\x1b[0m\n` : '';

  // Banish feedback message
  const banishLine = banishMessage ? `\x1b[33m${banishMessage}\x1b[0m\n` : '';

  // Hide cursor to prevent jiggle in footer area
  const hideCursor = '\x1b[?25l';
  return `${hideCursor}${config.message}\n${filterLine ? filterLine + '\n' : ''}${treeLines.join('\n')}${totalLine}\n${depMessageLine}${banishLine}${helpLine}`;
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
