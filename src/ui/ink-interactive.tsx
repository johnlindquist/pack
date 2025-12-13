/**
 * Ink-based interactive file selection
 * This module provides the React Ink TUI for file selection
 */

import React from 'react';
import { render } from 'ink';
import { App, type InteractiveResult } from './components/App.js';
import type { FileChoice, TreeCheckboxConfig } from '../types.js';

// Re-export types
export type { InteractiveResult } from './components/App.js';
export type { FileChoice, TreeNode, TreeCheckboxConfig } from '../types.js';

// Re-export buildFileTree for backwards compatibility
export { buildFileTree } from './interactive.js';

/**
 * Run interactive file selection with React Ink TUI
 * Returns a promise that resolves when the user confirms selection
 */
export async function runInkInteractive(config: TreeCheckboxConfig): Promise<InteractiveResult> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <App
        files={config.files}
        message={config.message}
        pageSize={config.pageSize}
        showPreview={config.showPreview}
        previewWidth={config.previewWidth}
        searchPattern={config.searchPattern}
        contextLines={config.contextLines}
        packignoreIndices={config.packignoreIndices}
        initialSelectedIndices={config.initialSelectedIndices}
        gitStatusMap={config.gitStatusMap}
        tokenLimit={config.tokenLimit}
        onComplete={(result) => {
          unmount();
          resolve(result);
        }}
      />
    );
  });
}

/**
 * Convenience function matching the existing API
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

  return runInkInteractive({
    message,
    files: fileChoices,
    pageSize,
  });
}
