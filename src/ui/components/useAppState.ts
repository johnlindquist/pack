/**
 * App state management hook for interactive file selection
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useStdout } from 'ink';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Minimatch } from 'minimatch';
import { Fzf } from 'fzf';

import { buildFileTree } from '../interactive.js';
import { extractDependencies } from '../../dependencies.js';
import type { FileChoice, TreeNode } from '../../types.js';

export type InteractiveResult = {
  selectedPaths: string[];
  globPattern?: string;
  stripComments?: boolean;
  contextLines?: number;
};

export type ExtensionSummary = {
  ext: string;
  count: number;
  tokens: number;
  indices: number[];
  allSelected: boolean;
};

export type AppStateProps = {
  files: FileChoice[];
  pageSize?: number;
  showPreview?: boolean;
  contextLines?: number;
  packignoreIndices?: Set<number>;
  initialSelectedIndices?: Set<number>;
};

// Cache for file contents
const fileContentCache = new Map<string, string>();
const MAX_PREVIEW_BYTES = 20 * 1024;

export function useAppState({
  files,
  pageSize = 20,
  showPreview = false,
  contextLines: initialContextLines,
  packignoreIndices = new Set<number>(),
  initialSelectedIndices,
}: AppStateProps) {
  const { stdout } = useStdout();

  // Terminal dimensions
  const [terminalSize, setTerminalSize] = useState(() => ({
    width: stdout?.columns || 80,
    height: stdout?.rows || 24,
  }));

  useEffect(() => {
    const handleResize = () => {
      setTerminalSize({
        width: stdout?.columns || 80,
        height: stdout?.rows || 24,
      });
    };
    stdout?.on('resize', handleResize);
    return () => { stdout?.off('resize', handleResize); };
  }, [stdout]);

  // Build tree structure
  const { tree } = useMemo(() => buildFileTree(files), [files]);

  // Core state
  const [cursor, setCursor] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(() => {
    if (initialSelectedIndices && initialSelectedIndices.size > 0) {
      return new Set(initialSelectedIndices);
    }
    return new Set<number>(files.map((_, i) => i).filter(i => !packignoreIndices.has(i)));
  });

  // UI mode state
  const [showExtensions, setShowExtensions] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [filterCursor, setFilterCursor] = useState(0);
  const [isFiltering, setIsFiltering] = useState(false);

  // Banish state
  const [banished, setBanished] = useState<Set<string>>(new Set());
  const [banishMessage, setBanishMessage] = useState('');

  // Preview state
  const [previewScroll, setPreviewScroll] = useState(0);
  const [previewFocused, setPreviewFocused] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewFilePath, setPreviewFilePath] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Selection anchor
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);

  // Feedback messages
  const [depMessage, setDepMessage] = useState('');

  // Live toggles
  const [stripCommentsEnabled, setStripCommentsEnabled] = useState(false);
  const [liveContextLines, setLiveContextLines] = useState(initialContextLines || 0);

  // Clear messages after timeout
  useEffect(() => {
    if (depMessage) {
      const timer = setTimeout(() => setDepMessage(''), 2000);
      return () => clearTimeout(timer);
    }
  }, [depMessage]);

  useEffect(() => {
    if (banishMessage) {
      const timer = setTimeout(() => setBanishMessage(''), 2000);
      return () => clearTimeout(timer);
    }
  }, [banishMessage]);

  // Flatten tree nodes with filter
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

    // Filter banished
    if (banished.size > 0) {
      nodes = nodes.filter(node => {
        for (const bannedPath of banished) {
          if (node.path === bannedPath || node.path.startsWith(bannedPath + '/')) {
            return false;
          }
        }
        return true;
      });
    }

    // Apply filter
    if (filterText) {
      const hasGlobChars = /[\*\?\[\]\{\}!]/.test(filterText);
      if (hasGlobChars) {
        try {
          const mm = new Minimatch(filterText, { nocase: true, matchBase: true });
          nodes = nodes.filter(node => mm.match(node.path) || mm.match(node.name));
        } catch {
          const lowerFilter = filterText.toLowerCase();
          nodes = nodes.filter(node => node.path.toLowerCase().includes(lowerFilter));
        }
      } else {
        const fzf = new Fzf(nodes, { selector: (node: TreeNode) => node.path });
        nodes = fzf.find(filterText).map(r => r.item);
      }
    }

    return nodes;
  }, [tree, collapsed, filterText, banished]);

  // Clamp cursor
  useEffect(() => {
    if (cursor >= flatNodes.length && flatNodes.length > 0) {
      setCursor(flatNodes.length - 1);
    }
  }, [flatNodes.length, cursor]);

  // Extension summary
  const extSummary = useMemo<ExtensionSummary[]>(() => {
    const extMap = new Map<string, { count: number; tokens: number; indices: number[] }>();
    for (let i = 0; i < files.length; i++) {
      const ext = files[i].ext || '(no ext)';
      if (!extMap.has(ext)) extMap.set(ext, { count: 0, tokens: 0, indices: [] });
      const entry = extMap.get(ext)!;
      entry.count++;
      entry.tokens += files[i].tokens;
      entry.indices.push(i);
    }
    return Array.from(extMap.entries())
      .map(([ext, data]) => ({ ext, ...data, allSelected: data.indices.every(i => selected.has(i)) }))
      .sort((a, b) => b.tokens - a.tokens);
  }, [files, selected]);

  // Preview file loading
  const targetFilePath = useMemo(() => {
    if (!showPreview) return '';
    const node = flatNodes[cursor];
    if (!node || node.isFolder) return '';
    return files[node.fileIndices[0]]?.path || '';
  }, [showPreview, flatNodes, cursor, files]);

  useEffect(() => {
    if (!targetFilePath) {
      if (previewFilePath) { setPreviewContent(''); setPreviewFilePath(''); }
      return;
    }
    if (targetFilePath === previewFilePath) return;
    if (fileContentCache.has(targetFilePath)) {
      setPreviewContent(fileContentCache.get(targetFilePath)!);
      setPreviewFilePath(targetFilePath);
      return;
    }
    setIsLoadingPreview(true);
    const timer = setTimeout(async () => {
      try {
        const handle = await fs.open(targetFilePath, 'r');
        try {
          const buffer = Buffer.alloc(MAX_PREVIEW_BYTES);
          const { bytesRead } = await handle.read(buffer, 0, MAX_PREVIEW_BYTES, 0);
          let content = buffer.toString('utf8', 0, bytesRead);
          if (bytesRead === MAX_PREVIEW_BYTES) content += '\n... (preview truncated) ...';
          fileContentCache.set(targetFilePath, content);
          setPreviewContent(content);
          setPreviewFilePath(targetFilePath);
        } finally { await handle.close(); }
      } catch (err) {
        setPreviewContent(`[Error reading file: ${err}]`);
        setPreviewFilePath(targetFilePath);
      } finally { setIsLoadingPreview(false); }
    }, 100);
    return () => { clearTimeout(timer); setIsLoadingPreview(false); };
  }, [targetFilePath, previewFilePath]);

  // Totals
  const selectedTokens = useMemo(() =>
    files.filter((_, i) => selected.has(i)).reduce((sum, f) => sum + f.tokens, 0), [files, selected]);
  const totalTokens = useMemo(() => files.reduce((sum, f) => sum + f.tokens, 0), [files]);

  // Actions
  const banishNode = useCallback(async (node: TreeNode) => {
    const next = new Set(selected);
    node.fileIndices.forEach(i => next.delete(i));
    setSelected(next);
    setBanished(prev => new Set([...prev, node.path]));
    try {
      const packignorePath = path.join(process.cwd(), '.packignore');
      const entry = node.isFolder ? `${node.path}/` : node.path;
      await fs.appendFile(packignorePath, `\n${entry}`);
      setBanishMessage(`Banished: ${node.name} -> .packignore`);
    } catch { setBanishMessage(`Failed to update .packignore`); }
  }, [selected]);

  const selectDependencies = useCallback(async (filePath: string) => {
    const deps = await extractDependencies(filePath);
    if (deps.length === 0) { setDepMessage('No local dependencies found'); return; }
    const depPaths = new Set(deps.map(d => d.resolvedPath));
    const matchedIndices = files.map((f, i) => depPaths.has(f.path) ? i : -1).filter(i => i >= 0);
    if (matchedIndices.length > 0) {
      setSelected(prev => new Set([...prev, ...matchedIndices]));
      setDepMessage(`Selected ${matchedIndices.length} dependencies`);
    } else { setDepMessage('Dependencies not in file list'); }
  }, [files]);

  return {
    // Terminal
    terminalSize,
    // Tree
    tree, flatNodes, collapsed, setCollapsed,
    // Selection
    selected, setSelected, selectionAnchor, setSelectionAnchor,
    // Cursor
    cursor, setCursor,
    // Filter
    filterText, setFilterText, filterCursor, setFilterCursor, isFiltering, setIsFiltering,
    // Modes
    showExtensions, setShowExtensions, showHelp, setShowHelp,
    // Preview
    previewContent, previewScroll, setPreviewScroll, previewFocused, setPreviewFocused, isLoadingPreview,
    // Banish
    banished, banishMessage, banishNode,
    // Dependencies
    depMessage, selectDependencies,
    // Toggles
    stripCommentsEnabled, setStripCommentsEnabled, liveContextLines, setLiveContextLines,
    // Extensions
    extSummary,
    // Totals
    selectedTokens, totalTokens,
    // Page size
    pageSize,
  };
}
