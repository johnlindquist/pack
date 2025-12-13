/**
 * FileList component - Tree-based file selection with fuzzy search
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { TreeNode, FileChoice } from '../../types.js';
import { formatTokenCount } from '../../analysis.js';

export type FileListProps = {
  nodes: TreeNode[];
  files: FileChoice[];
  selected: Set<number>;
  cursor: number;
  collapsed: Set<string>;
  selectionAnchor: number | null;
  pageSize: number;
  filterText: string;
  isFiltering: boolean;
  filterCursor: number;
  gitStatusMap?: Map<string, 'M' | 'A' | 'D' | '?'>;
  width: number;
};

export function FileList({
  nodes,
  files,
  selected,
  cursor,
  collapsed,
  selectionAnchor,
  pageSize,
  filterText,
  isFiltering,
  filterCursor,
  gitStatusMap,
  width,
}: FileListProps) {
  // Calculate visible range with pagination
  const startIdx = Math.max(0, Math.min(cursor - Math.floor(pageSize / 2), nodes.length - pageSize));
  const endIdx = Math.min(startIdx + pageSize, nodes.length);
  const visibleNodes = nodes.slice(startIdx, endIdx);

  const hasGlobChars = /[\*\?\[\]\{\}!]/.test(filterText);

  return (
    <Box flexDirection="column" width={width}>
      {/* Filter input line */}
      {(isFiltering || filterText) && (
        <Box marginBottom={1}>
          <Text color="yellow">
            Filter{hasGlobChars ? ' (glob)' : ' (fuzzy)'}: {isFiltering ? (
              <>
                {filterText.slice(0, filterCursor)}
                <Text inverse>{filterText[filterCursor] || ' '}</Text>
                <Text color="yellow">{filterText.slice(filterCursor + 1)}</Text>
              </>
            ) : (
              `"${filterText}"`
            )}
          </Text>
          <Text dimColor>
            {isFiltering
              ? '  (Enter apply, Esc cancel)'
              : `  (showing ${nodes.length} matches, Esc clear)`}
          </Text>
        </Box>
      )}

      {/* Scroll indicator - top */}
      {startIdx > 0 && (
        <Text dimColor>  ^ more above</Text>
      )}

      {/* File tree */}
      {visibleNodes.map((node, i) => {
        const actualIdx = startIdx + i;
        const isCursor = actualIdx === cursor;
        const isAnchor = actualIdx === selectionAnchor;
        const allSelected = node.fileIndices.every(idx => selected.has(idx));
        const someSelected = node.fileIndices.some(idx => selected.has(idx));

        // Checkbox state
        const checkbox = allSelected ? '\u25C9' : (someSelected ? '\u25D0' : '\u25CB');

        // Pointer indicator
        let pointer = isCursor ? '\u276F' : ' ';
        if (isAnchor && !isCursor) {
          pointer = '\u2503';
        } else if (isAnchor && isCursor) {
          pointer = '\u25B6';
        }

        // Indentation and icon
        const indent = '  '.repeat(node.depth);
        let icon = '';
        if (node.isFolder) {
          icon = collapsed.has(node.path) ? '\u25B8 ' : '\u25BE ';
        } else {
          icon = '  ';
        }

        // Git status
        let gitStatus = null;
        if (gitStatusMap && !node.isFolder) {
          const fileIdx = node.fileIndices[0];
          const filePath = files[fileIdx]?.path;
          if (filePath && gitStatusMap.has(filePath)) {
            const status = gitStatusMap.get(filePath);
            if (status === 'M') gitStatus = <Text color="yellow">[M] </Text>;
            else if (status === 'A') gitStatus = <Text color="green">[A] </Text>;
            else if (status === '?') gitStatus = <Text color="red">[?] </Text>;
          }
        }

        // Token count
        const tokenStr = ` (${formatTokenCount(node.tokens)})`;

        // Determine color
        let color: 'cyan' | 'green' | 'yellow' | 'gray' = 'gray';
        if (isCursor) color = 'cyan';
        else if (allSelected) color = 'green';
        else if (someSelected) color = 'yellow';

        return (
          <Text key={node.path} color={color}>
            {pointer} {checkbox} {indent}{icon}{gitStatus}
            <Text bold={node.isFolder}>{node.name}</Text>
            {tokenStr}
          </Text>
        );
      })}

      {/* Scroll indicator - bottom */}
      {endIdx < nodes.length && (
        <Text dimColor>  v more below</Text>
      )}
    </Box>
  );
}

/**
 * Extension list view for extension filter mode
 */
export type ExtensionSummary = {
  ext: string;
  count: number;
  tokens: number;
  indices: number[];
  allSelected: boolean;
};

export type ExtensionListProps = {
  extensions: ExtensionSummary[];
  selected: Set<number>;
  cursor: number;
};

export function ExtensionList({ extensions, selected, cursor }: ExtensionListProps) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}><Text bold>Filter by Extension:</Text></Box>
      {extensions.map((ext, i) => {
        const isCursor = i === cursor;
        const checkbox = ext.allSelected
          ? '\u25C9'
          : (ext.indices.some(idx => selected.has(idx)) ? '\u25D0' : '\u25CB');
        const pointer = isCursor ? '\u276F' : ' ';

        let color: 'cyan' | 'green' | 'gray' = 'gray';
        if (isCursor) color = 'cyan';
        else if (ext.allSelected) color = 'green';

        return (
          <Text key={ext.ext} color={color}>
            {pointer} {checkbox} {ext.ext} ({ext.count} files, {formatTokenCount(ext.tokens)} tokens)
          </Text>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>(Up/Down navigate, Space toggle, e/Esc back to tree, Enter confirm)</Text>
      </Box>
    </Box>
  );
}
