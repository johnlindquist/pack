/**
 * Input handling hook for the interactive file selection TUI
 */

import { useCallback } from 'react';
import { useInput, useApp } from 'ink';
import { spawn } from 'node:child_process';
import type { FileChoice, TreeNode } from '../../types.js';
import type { ExtensionSummary } from './useAppState.js';

export type InteractiveResult = {
  selectedPaths: string[];
  globPattern?: string;
  stripComments?: boolean;
  contextLines?: number;
};

export type InputHandlerProps = {
  files: FileChoice[];
  flatNodes: TreeNode[];
  extSummary: ExtensionSummary[];
  showPreview: boolean;
  // State
  cursor: number;
  setCursor: (n: number) => void;
  selected: Set<number>;
  setSelected: (s: Set<number>) => void;
  collapsed: Set<string>;
  setCollapsed: (s: Set<string>) => void;
  selectionAnchor: number | null;
  setSelectionAnchor: (n: number | null) => void;
  // Filter
  filterText: string;
  setFilterText: (s: string) => void;
  filterCursor: number;
  setFilterCursor: (n: number) => void;
  isFiltering: boolean;
  setIsFiltering: (b: boolean) => void;
  // Modes
  showExtensions: boolean;
  setShowExtensions: (b: boolean) => void;
  showHelp: boolean;
  setShowHelp: (b: boolean) => void;
  // Preview
  previewScroll: number;
  setPreviewScroll: (n: number) => void;
  previewFocused: boolean;
  setPreviewFocused: (b: boolean) => void;
  previewContent: string;
  // Toggles
  stripCommentsEnabled: boolean;
  setStripCommentsEnabled: (b: boolean) => void;
  liveContextLines: number;
  setLiveContextLines: (n: number) => void;
  // Actions
  banishNode: (node: TreeNode) => void;
  selectDependencies: (filePath: string) => void;
  // Layout
  terminalSize: { width: number; height: number };
  pageSize: number;
  // Complete
  onComplete: (result: InteractiveResult) => void;
};

export function useInputHandler({
  files,
  flatNodes,
  extSummary,
  showPreview,
  cursor, setCursor,
  selected, setSelected,
  collapsed, setCollapsed,
  selectionAnchor, setSelectionAnchor,
  filterText, setFilterText,
  filterCursor, setFilterCursor,
  isFiltering, setIsFiltering,
  showExtensions, setShowExtensions,
  showHelp, setShowHelp,
  previewScroll, setPreviewScroll,
  previewFocused, setPreviewFocused,
  previewContent,
  stripCommentsEnabled, setStripCommentsEnabled,
  liveContextLines, setLiveContextLines,
  banishNode, selectDependencies,
  terminalSize, pageSize,
  onComplete,
}: InputHandlerProps) {
  const { exit } = useApp();

  const handleComplete = useCallback(() => {
    const selectedPaths = files.filter((_, i) => selected.has(i)).map(f => f.path);
    const hasGlobChars = /[\*\?\[\]\{\}!]/.test(filterText);
    onComplete({
      selectedPaths,
      globPattern: hasGlobChars && filterText ? filterText : undefined,
      stripComments: stripCommentsEnabled || undefined,
      contextLines: liveContextLines > 0 ? liveContextLines : undefined,
    });
    exit();
  }, [files, selected, filterText, stripCommentsEnabled, liveContextLines, onComplete, exit]);

  const toggleSelection = useCallback((node: TreeNode, shiftKey: boolean) => {
    const next = new Set(selected);
    if (shiftKey && selectionAnchor !== null) {
      const start = Math.min(selectionAnchor, cursor);
      const end = Math.max(selectionAnchor, cursor);
      const anchorNode = flatNodes[selectionAnchor];
      const shouldSelect = anchorNode && !anchorNode.fileIndices.every(i => selected.has(i));
      for (let i = start; i <= end; i++) {
        const rangeNode = flatNodes[i];
        if (rangeNode) {
          if (shouldSelect) rangeNode.fileIndices.forEach(idx => next.add(idx));
          else rangeNode.fileIndices.forEach(idx => next.delete(idx));
        }
      }
    } else {
      const allSelected = node.fileIndices.every(i => selected.has(i));
      if (allSelected) node.fileIndices.forEach(i => next.delete(i));
      else node.fileIndices.forEach(i => next.add(i));
    }
    setSelected(next);
    setSelectionAnchor(cursor);
  }, [selected, selectionAnchor, cursor, flatNodes, setSelected, setSelectionAnchor]);

  useInput((input, key) => {
    // Help toggle
    if (input === '?' && !isFiltering) { setShowHelp(!showHelp); return; }
    if (showHelp) { setShowHelp(false); return; }

    // Enter to confirm
    if (key.return) {
      if (isFiltering) { setIsFiltering(false); setCursor(0); return; }
      handleComplete();
      return;
    }

    // Filter mode
    if (isFiltering) {
      if (key.escape) { setIsFiltering(false); setFilterText(''); setFilterCursor(0); setCursor(0); }
      else if (key.leftArrow) setFilterCursor(Math.max(0, filterCursor - 1));
      else if (key.rightArrow) setFilterCursor(Math.min(filterText.length, filterCursor + 1));
      else if (key.backspace && filterCursor > 0) {
        setFilterText(filterText.slice(0, filterCursor - 1) + filterText.slice(filterCursor));
        setFilterCursor(filterCursor - 1);
      } else if (key.delete && filterCursor < filterText.length) {
        setFilterText(filterText.slice(0, filterCursor) + filterText.slice(filterCursor + 1));
      } else if (key.upArrow) {
        setCursor(cursor > 0 ? cursor - 1 : flatNodes.length - 1);
        if (showPreview && !previewFocused) setPreviewScroll(0);
      } else if (key.downArrow) {
        setCursor(cursor < flatNodes.length - 1 ? cursor + 1 : 0);
        if (showPreview && !previewFocused) setPreviewScroll(0);
      } else if (input === ' ') {
        const node = flatNodes[cursor];
        if (node) toggleSelection(node, false);
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setFilterText(filterText.slice(0, filterCursor) + input + filterText.slice(filterCursor));
        setFilterCursor(filterCursor + 1);
      }
      return;
    }

    // Extension mode
    if (showExtensions) {
      if (key.upArrow || input === 'k') setCursor(cursor > 0 ? cursor - 1 : extSummary.length - 1);
      else if (key.downArrow || input === 'j') setCursor(cursor < extSummary.length - 1 ? cursor + 1 : 0);
      else if (input === ' ') {
        const ext = extSummary[cursor];
        if (ext) {
          const next = new Set(selected);
          if (ext.allSelected) ext.indices.forEach(i => next.delete(i));
          else ext.indices.forEach(i => next.add(i));
          setSelected(next);
        }
      } else if (input === 'e' || key.escape) { setShowExtensions(false); setCursor(0); }
      return;
    }

    // Tree navigation
    if (key.upArrow || input === 'k') {
      setCursor(cursor > 0 ? cursor - 1 : flatNodes.length - 1);
      if (showPreview && !previewFocused) setPreviewScroll(0);
    } else if (key.downArrow || input === 'j') {
      setCursor(cursor < flatNodes.length - 1 ? cursor + 1 : 0);
      if (showPreview && !previewFocused) setPreviewScroll(0);
    } else if (input === 'g' && !key.shift) {
      setCursor(0);
      if (showPreview && !previewFocused) setPreviewScroll(0);
    } else if (input === 'G') {
      setCursor(flatNodes.length - 1);
      if (showPreview && !previewFocused) setPreviewScroll(0);
    } else if (input === ' ') {
      const node = flatNodes[cursor];
      if (node) toggleSelection(node, key.shift);
    } else if (input === 'v' && !previewFocused) {
      setSelectionAnchor(selectionAnchor === cursor ? null : cursor);
    } else if (key.leftArrow || input === 'h') {
      const node = flatNodes[cursor];
      if (node?.isFolder && !collapsed.has(node.path)) {
        setCollapsed(new Set([...collapsed, node.path]));
      } else if (node) {
        const parts = node.path.split('/');
        if (parts.length > 1) {
          const parentPath = parts.slice(0, -1).join('/');
          const parentIdx = flatNodes.findIndex(n => n.path === parentPath && n.isFolder);
          if (parentIdx !== -1) { setCollapsed(new Set([...collapsed, parentPath])); setCursor(parentIdx); }
        }
      }
    } else if (key.rightArrow || input === 'l') {
      const node = flatNodes[cursor];
      if (node?.isFolder && collapsed.has(node.path)) {
        const next = new Set(collapsed);
        next.delete(node.path);
        setCollapsed(next);
      }
    } else if (input === 'a') {
      const visibleIndices = flatNodes.flatMap(n => n.fileIndices);
      const allSelected = visibleIndices.every(i => selected.has(i));
      const next = new Set(selected);
      if (allSelected) visibleIndices.forEach(i => next.delete(i));
      else visibleIndices.forEach(i => next.add(i));
      setSelected(next);
    } else if (input === 'e') { setShowExtensions(true); setCursor(0); }
    else if (input === 'x' && !previewFocused) {
      const node = flatNodes[cursor];
      if (node) {
        banishNode(node);
        if (cursor >= flatNodes.length - 1 && cursor > 0) setCursor(cursor - 1);
      }
    } else if (input === 'o' && !previewFocused) {
      const node = flatNodes[cursor];
      if (node && !node.isFolder && node.fileIndices.length > 0) {
        const filePath = files[node.fileIndices[0]].path;
        const editor = process.env.VISUAL || process.env.EDITOR || 'code';
        try { const child = spawn(editor, [filePath], { detached: true, stdio: 'ignore' }); child.unref(); } catch {}
      }
    } else if (input === '/') { setIsFiltering(true); setCursor(0); }
    else if (key.escape && filterText) { setFilterText(''); setCursor(0); }
    else if (input === 'd' && !previewFocused) {
      const node = flatNodes[cursor];
      if (node && !node.isFolder && node.fileIndices.length > 0) {
        selectDependencies(files[node.fileIndices[0]].path);
      }
    } else if (input === 'c' && !previewFocused) setStripCommentsEnabled(!stripCommentsEnabled);
    else if ((input === '+' || input === '=') && !previewFocused) setLiveContextLines(Math.min(liveContextLines + 1, 50));
    else if ((input === '-' || input === '_') && !previewFocused) setLiveContextLines(Math.max(liveContextLines - 1, 0));
    else if (key.tab && showPreview) setPreviewFocused(!previewFocused);
    else if (showPreview && previewFocused) {
      const reservedLines = (isFiltering || filterText) ? 9 : 7;
      const maxLines = Math.max(5, terminalSize.height - reservedLines);
      const previewHeight = Math.min(Math.min(pageSize, maxLines), 15);
      const totalLines = previewContent.split('\n').length;
      if (key.pageUp || input === 'u') setPreviewScroll(Math.max(0, previewScroll - previewHeight));
      else if (key.pageDown || input === 'd') setPreviewScroll(Math.min(totalLines - previewHeight, previewScroll + previewHeight));
      else if (input === 'g') setPreviewScroll(0);
      else if (input === 'G') setPreviewScroll(Math.max(0, totalLines - previewHeight));
    }
  });
}
