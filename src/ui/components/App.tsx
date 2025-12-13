/**
 * Main App component for interactive file selection TUI
 * Uses React Ink for component-based terminal UI
 */

import React from 'react';
import { Box, Text } from 'ink';

import { FileList, ExtensionList } from './FileList.js';
import { Preview } from './Preview.js';
import { StatusBar } from './StatusBar.js';
import { HelpOverlay } from './HelpOverlay.js';
import { useAppState, type InteractiveResult } from './useAppState.js';
import { useInputHandler } from './useInputHandler.js';
import type { FileChoice } from '../../types.js';

export type { InteractiveResult } from './useAppState.js';

export type AppProps = {
  files: FileChoice[];
  message: string;
  pageSize?: number;
  showPreview?: boolean;
  previewWidth?: number;
  searchPattern?: RegExp | null;
  contextLines?: number;
  packignoreIndices?: Set<number>;
  initialSelectedIndices?: Set<number>;
  gitStatusMap?: Map<string, 'M' | 'A' | 'D' | '?'>;
  tokenLimit?: number;
  onComplete: (result: InteractiveResult) => void;
};

export function App({
  files,
  message,
  pageSize = 20,
  showPreview = false,
  previewWidth: configPreviewWidth,
  searchPattern = null,
  contextLines,
  packignoreIndices = new Set<number>(),
  initialSelectedIndices,
  gitStatusMap,
  tokenLimit,
  onComplete,
}: AppProps) {
  const state = useAppState({
    files,
    pageSize,
    showPreview,
    contextLines,
    packignoreIndices,
    initialSelectedIndices,
  });

  useInputHandler({
    files,
    flatNodes: state.flatNodes,
    extSummary: state.extSummary,
    showPreview,
    cursor: state.cursor,
    setCursor: state.setCursor,
    selected: state.selected,
    setSelected: state.setSelected,
    collapsed: state.collapsed,
    setCollapsed: state.setCollapsed,
    selectionAnchor: state.selectionAnchor,
    setSelectionAnchor: state.setSelectionAnchor,
    filterText: state.filterText,
    setFilterText: state.setFilterText,
    filterCursor: state.filterCursor,
    setFilterCursor: state.setFilterCursor,
    isFiltering: state.isFiltering,
    setIsFiltering: state.setIsFiltering,
    showExtensions: state.showExtensions,
    setShowExtensions: state.setShowExtensions,
    showHelp: state.showHelp,
    setShowHelp: state.setShowHelp,
    previewScroll: state.previewScroll,
    setPreviewScroll: state.setPreviewScroll,
    previewFocused: state.previewFocused,
    setPreviewFocused: state.setPreviewFocused,
    previewContent: state.previewContent,
    stripCommentsEnabled: state.stripCommentsEnabled,
    setStripCommentsEnabled: state.setStripCommentsEnabled,
    liveContextLines: state.liveContextLines,
    setLiveContextLines: state.setLiveContextLines,
    banishNode: state.banishNode,
    selectDependencies: state.selectDependencies,
    terminalSize: state.terminalSize,
    pageSize: state.pageSize,
    onComplete,
  });

  // Calculate layout
  const termWidth = state.terminalSize.width;
  const previewWidth = configPreviewWidth || Math.floor(termWidth * 0.5);
  const treeWidth = showPreview ? Math.floor(termWidth * 0.45) : termWidth - 4;
  const reservedLines = (state.isFiltering || state.filterText) ? 9 : 7;
  const maxTreeLines = Math.max(5, state.terminalSize.height - reservedLines);
  const effectivePageSize = Math.min(pageSize, maxTreeLines);
  const previewHeight = Math.min(effectivePageSize, 15);

  // Render help overlay
  if (state.showHelp) {
    return <HelpOverlay onClose={() => state.setShowHelp(false)} />;
  }

  // Render extension mode
  if (state.showExtensions) {
    return (
      <Box flexDirection="column" padding={1}>
        <ExtensionList
          extensions={state.extSummary}
          selected={state.selected}
          cursor={state.cursor}
        />
        <StatusBar
          selectedCount={state.selected.size}
          totalCount={files.length}
          selectedTokens={state.selectedTokens}
          totalTokens={state.totalTokens}
          tokenLimit={tokenLimit}
          stripComments={state.stripCommentsEnabled}
          contextLines={state.liveContextLines}
          width={termWidth}
        />
      </Box>
    );
  }

  // Render main tree view
  return (
    <Box flexDirection="column" padding={1}>
      <Text>{message}</Text>

      <Box flexDirection="row" marginTop={1}>
        <FileList
          nodes={state.flatNodes}
          files={files}
          selected={state.selected}
          cursor={state.cursor}
          collapsed={state.collapsed}
          selectionAnchor={state.selectionAnchor}
          pageSize={effectivePageSize}
          filterText={state.filterText}
          isFiltering={state.isFiltering}
          filterCursor={state.filterCursor}
          gitStatusMap={gitStatusMap}
          width={treeWidth}
        />

        {showPreview && (
          <Preview
            node={state.flatNodes[state.cursor] || null}
            content={state.previewContent}
            isLoading={state.isLoadingPreview}
            scroll={state.previewScroll}
            focused={state.previewFocused}
            height={previewHeight}
            width={previewWidth}
            searchPattern={searchPattern}
            contextLines={state.liveContextLines || undefined}
          />
        )}
      </Box>

      <StatusBar
        selectedCount={state.selected.size}
        totalCount={files.length}
        selectedTokens={state.selectedTokens}
        totalTokens={state.totalTokens}
        tokenLimit={tokenLimit}
        stripComments={state.stripCommentsEnabled}
        contextLines={state.liveContextLines}
        width={termWidth}
      />

      {state.depMessage && <Text color="yellow">{state.depMessage}</Text>}
      {state.banishMessage && <Text color="yellow">{state.banishMessage}</Text>}

      <Text dimColor>
        {state.previewFocused
          ? '(Tab: back to tree, PgUp/PgDn: scroll, ? help)'
          : '(? help, Enter confirm)'}
      </Text>
    </Box>
  );
}
