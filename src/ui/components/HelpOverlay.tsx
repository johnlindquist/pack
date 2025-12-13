/**
 * HelpOverlay component - Full-screen help modal triggered by ?
 */

import React from 'react';
import { Box, Text } from 'ink';

export type HelpOverlayProps = {
  onClose: () => void;
};

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" flexDirection="column" paddingX={2} paddingY={1}>
        <Box justifyContent="center" marginBottom={1}>
          <Text bold>KEYBOARD SHORTCUTS</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold dimColor>Navigation</Text>
          <Text>  <Text color="cyan">Up/k, Down/j</Text>     Move cursor up/down</Text>
          <Text>  <Text color="cyan">g</Text>               Jump to top</Text>
          <Text>  <Text color="cyan">G</Text>               Jump to bottom</Text>
          <Text>  <Text color="cyan">Left/h</Text>          Collapse folder / go to parent</Text>
          <Text>  <Text color="cyan">Right/l</Text>         Expand folder</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold dimColor>Selection</Text>
          <Text>  <Text color="cyan">Space</Text>           Toggle selection</Text>
          <Text>  <Text color="cyan">Shift+Space</Text>     Range select (from anchor)</Text>
          <Text>  <Text color="cyan">v</Text>               Set/clear selection anchor</Text>
          <Text>  <Text color="cyan">a</Text>               Toggle all visible</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold dimColor>Features</Text>
          <Text>  <Text color="cyan">/</Text>               Search/filter files</Text>
          <Text>  <Text color="cyan">d</Text>               Select dependencies of current file</Text>
          <Text>  <Text color="cyan">x</Text>               Banish to .packignore</Text>
          <Text>  <Text color="cyan">o</Text>               Open file in editor</Text>
          <Text>  <Text color="cyan">e</Text>               Extension filter mode</Text>
          <Text>  <Text color="cyan">c</Text>               Toggle comment stripping</Text>
          <Text>  <Text color="cyan">+/-</Text>             Adjust context lines</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold dimColor>Preview (when enabled)</Text>
          <Text>  <Text color="cyan">Tab</Text>             Focus preview pane</Text>
          <Text>  <Text color="cyan">PgUp/PgDn</Text>       Scroll preview</Text>
        </Box>

        <Box flexDirection="column">
          <Text>  <Text color="cyan">Enter</Text>           Confirm selection</Text>
          <Text>  <Text color="cyan">?</Text>               Toggle this help</Text>
        </Box>
      </Box>

      <Box marginTop={1} justifyContent="center">
        <Text dimColor>Press any key to close</Text>
      </Box>
    </Box>
  );
}
