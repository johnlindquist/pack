/**
 * StatusBar component - Bottom status bar showing token count, file count, and toggles
 */

import React from 'react';
import { Box, Text } from 'ink';

export type StatusBarProps = {
  selectedCount: number;
  totalCount: number;
  selectedTokens: number;
  totalTokens: number;
  tokenLimit?: number;
  stripComments?: boolean;
  contextLines?: number;
  width: number;
};

/**
 * Format token count for display (e.g., 1.5K, 2.3M)
 */
function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Render a visual token budget progress bar
 */
function TokenBudgetBar({
  selectedTokens,
  limit,
  width,
}: {
  selectedTokens: number;
  limit: number;
  width: number;
}) {
  const percentage = Math.min(100, (selectedTokens / limit) * 100);

  // Calculate bar width (reserve space for labels)
  const labelWidth = 30;
  const barWidth = Math.max(10, Math.min(40, width - labelWidth - 4));

  const filledCount = Math.round((percentage / 100) * barWidth);
  const emptyCount = barWidth - filledCount;

  // Color based on percentage
  let color: 'green' | 'yellow' | 'red' = 'green';
  if (percentage >= 85) {
    color = 'red';
  } else if (percentage >= 60) {
    color = 'yellow';
  }

  const filled = '\u2588'.repeat(filledCount);
  const empty = '\u2591'.repeat(emptyCount);
  const percentStr = percentage.toFixed(0) + '%';

  const formatK = (n: number): string => {
    if (n >= 1000) {
      return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return n.toString();
  };

  return (
    <Text>
      <Text color={color}>[{filled}{empty}]</Text>
      {' '}{formatK(selectedTokens)} / {formatK(limit)} ({percentStr})
    </Text>
  );
}

export function StatusBar({
  selectedCount,
  totalCount,
  selectedTokens,
  totalTokens,
  tokenLimit,
  stripComments,
  contextLines,
  width,
}: StatusBarProps) {
  // Build toggles status string
  const toggles: string[] = [];
  if (stripComments) toggles.push('comments:off');
  if (contextLines && contextLines > 0) toggles.push(`ctx:${contextLines}`);
  const togglesStr = toggles.length > 0 ? ` | ${toggles.join(' ')}` : '';

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text bold>
          {tokenLimit ? (
            <>
              Token Budget:{' '}
              <TokenBudgetBar
                selectedTokens={selectedTokens}
                limit={tokenLimit}
                width={width}
              />
              {' '}({selectedCount}/{totalCount} files){togglesStr}
            </>
          ) : (
            <>
              Selected: {formatTokenCount(selectedTokens)} / {formatTokenCount(totalTokens)} tokens
              {' '}({selectedCount}/{totalCount} files){togglesStr}
            </>
          )}
        </Text>
      </Box>
    </Box>
  );
}
