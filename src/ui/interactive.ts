/**
 * Interactive file selection UI for packx
 * Tree-based checkbox with folder/extension toggling
 */

import { createPrompt, useState, useKeypress, isEnterKey, isSpaceKey, isUpKey, isDownKey } from "@inquirer/core";
import { formatTokenCount } from "../analysis.js";
import type { FileChoice, TreeNode, TreeCheckboxConfig } from "../types.js";

// Re-export types for convenience
export type { FileChoice, TreeNode, TreeCheckboxConfig } from "../types.js";

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
 * Tree checkbox prompt for file selection
 */
export const treeCheckbox = createPrompt<string[], TreeCheckboxConfig>((config, done) => {
  const { files, pageSize = 20 } = config;

  // Build initial tree
  const { tree } = buildFileTree(files);

  // State
  const [cursor, setCursor] = useState<number>(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const initialSelected = new Set<number>(files.map((_, i) => i));
  const [selected, setSelected] = useState<Set<number>>(initialSelected);
  const [showExtensions, setShowExtensions] = useState<boolean>(false);
  const [filterText, setFilterText] = useState<string>('');
  const [isFiltering, setIsFiltering] = useState<boolean>(false);

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
      const lowerFilter = filterText.toLowerCase();
      nodes = nodes.filter(node => node.path.toLowerCase().includes(lowerFilter));
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

  useKeypress((key: any) => {
    if (isEnterKey(key)) {
      if (isFiltering) {
        setIsFiltering(false);
        setCursor(0);
        return;
      }
      const result = files.filter((_, i) => selected.has(i)).map(f => f.path);
      done(result);
      return;
    }

    // Filter input mode
    if (isFiltering) {
      if (key.name === 'escape') {
        setIsFiltering(false);
        setFilterText('');
        setCursor(0);
      } else if (key.name === 'backspace') {
        setFilterText(filterText.slice(0, -1));
        setCursor(0);
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setFilterText(filterText + key.sequence);
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
      setCursor(cursor > 0 ? cursor - 1 : flatNodes.length - 1);
    } else if (isDownKey(key)) {
      setCursor(cursor < flatNodes.length - 1 ? cursor + 1 : 0);
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

  const lines = visibleNodes.map((node, i) => {
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
    lines.unshift('\x1b[90m  ↑ more above\x1b[0m');
  }
  if (endIdx < flatNodes.length) {
    lines.push('\x1b[90m  ↓ more below\x1b[0m');
  }

  const totalLine = `\n\x1b[1m📊 Selected: ${formatTokenCount(selectedTokens)} / ${formatTokenCount(totalTokens)} tokens (${selected.size}/${files.length} files)\x1b[0m`;

  // Show filter input or help line
  let filterLine = '';
  if (isFiltering) {
    filterLine = `\x1b[33m🔍 Filter: ${filterText}█\x1b[0m  \x1b[90m(enter to apply, esc to cancel)\x1b[0m`;
  } else if (filterText) {
    filterLine = `\x1b[33m🔍 Filter: "${filterText}"\x1b[0m  \x1b[90m(showing ${flatNodes.length} matches, esc to clear)\x1b[0m`;
  }

  const helpLine = '\x1b[90m(↑↓ navigate, ←→ collapse/expand, space toggle, a all, e extensions, / filter, enter confirm)\x1b[0m';

  return `${config.message}\n${filterLine ? filterLine + '\n' : ''}${lines.join('\n')}${totalLine}\n${helpLine}`;
});

/**
 * Run interactive file selection and return selected file paths
 */
export async function runInteractiveSelection(
  files: { path: string; relPath: string; tokens: number; ext: string }[],
  options: { message?: string; pageSize?: number } = {}
): Promise<string[]> {
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
