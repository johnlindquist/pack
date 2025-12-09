/**
 * CLI argument parsing using yargs for packx
 */

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import type { Argv } from "./types.js";

// Re-export the Argv type for convenience
export type { Argv } from "./types.js";

export function parseArgs(args: string[]): Argv {
  const parser = yargs(hideBin(['node', 'packx', ...args]))
    // Disable built-in help and version first, before defining custom options
    .help(false)
    .version(false)

    // Search & Filter options
    // Note: Using 'string' type instead of 'array' to match mri behavior
    // When flags are repeated, yargs automatically creates arrays
    .option('strings', {
      alias: 's',
      type: 'string',
      description: 'Include files containing text (use multiple times)',
      group: 'Search & Filter:',
    })
    .option('exclude-strings', {
      alias: 'S',
      type: 'string',
      description: 'Exclude files containing text',
      group: 'Search & Filter:',
    })
    .option('include', {
      alias: 'i',
      type: 'string',
      description: 'Include filenames/extensions (e.g. "*.ts", "src/")',
      group: 'Search & Filter:',
    })
    .option('extensions', {
      alias: 'e',
      type: 'string',
      description: 'File extensions to include',
      group: 'Search & Filter:',
    })
    .option('exclude', {
      alias: 'x',
      type: 'string',
      description: 'Exclude filenames/extensions',
      group: 'Search & Filter:',
    })
    .option('exclude-extensions', {
      type: 'string',
      description: 'Exclude file extensions',
      group: 'Search & Filter:',
    })
    .option('regex', {
      alias: 'R',
      type: 'boolean',
      description: 'Treat search strings as regex patterns',
      group: 'Search & Filter:',
    })
    .option('case-sensitive', {
      alias: 'C',
      type: 'boolean',
      description: 'Enable case-sensitive search',
      group: 'Search & Filter:',
    })
    .option('staged', {
      type: 'boolean',
      description: 'Include only git staged files',
      group: 'Search & Filter:',
    })
    .option('diff', {
      type: 'boolean',
      description: 'Include only files changed from main',
      group: 'Search & Filter:',
    })
    .option('dirty', {
      type: 'boolean',
      description: 'Include only modified/untracked files',
      group: 'Search & Filter:',
    })
    .option('no-packignore', {
      type: 'boolean',
      description: 'Ignore .packignore file',
      group: 'Search & Filter:',
    })

    // Processing options
    .option('strip-comments', {
      type: 'boolean',
      description: 'Strip comments from code',
      group: 'Processing:',
    })
    .option('no-comments', {
      type: 'boolean',
      description: 'Alias for --strip-comments',
      group: 'Processing:',
    })
    .option('minify', {
      type: 'boolean',
      description: 'Remove empty lines and whitespace',
      group: 'Processing:',
    })
    .option('lines', {
      alias: 'l',
      type: 'number',
      description: 'Extract N lines of context around matches',
      group: 'Processing:',
    })
    .option('related', {
      alias: 'r',
      type: 'boolean',
      description: 'Include related files (tests, stories)',
      group: 'Processing:',
    })
    .option('follow-imports', {
      type: 'boolean',
      description: 'Include files imported by matched files',
      group: 'Processing:',
    })
    .option('instruction', {
      type: 'string',
      description: 'Prepend custom instructions from file',
      group: 'Processing:',
    })

    // Output options
    .option('output', {
      alias: 'o',
      type: 'string',
      description: 'Write output to file',
      group: 'Output:',
    })
    .option('format', {
      type: 'string',
      choices: ['xml', 'markdown', 'plain', 'jsonl'],
      description: 'Output format (default: xml)',
      group: 'Output:',
    })
    .option('style', {
      type: 'string',
      description: 'Alias for --format',
      group: 'Output:',
    })
    .option('copy', {
      alias: 'c',
      type: 'boolean',
      description: 'Copy output to clipboard',
      group: 'Output:',
    })
    .option('stdout', {
      type: 'boolean',
      description: 'Write to stdout (default if no -o)',
      group: 'Output:',
    })
    .option('preview', {
      type: 'boolean',
      description: 'Show matching files without packing',
      group: 'Output:',
    })
    .option('max-tokens', {
      alias: 'M',
      type: 'number',
      description: 'Split output into chunks of max N tokens each',
      group: 'Output:',
    })

    // Performance options
    .option('rg', {
      type: 'boolean',
      description: 'Force ripgrep for file search (auto-detected by default)',
      group: 'Performance:',
    })
    .option('no-rg', {
      type: 'boolean',
      description: 'Disable ripgrep, use Node.js glob instead',
      group: 'Performance:',
    })

    // Interactive mode
    .option('interactive', {
      alias: 'I',
      type: 'boolean',
      description: 'Select files interactively with preview pane',
      group: 'Interactive Mode:',
    })

    // Watch mode
    .option('watch', {
      alias: 'w',
      type: 'boolean',
      description: 'Watch for file changes and auto-update output',
      group: 'Watch Mode:',
    })

    // Other options
    .option('prompt', {
      alias: 'p',
      type: 'string',
      description: 'Prompt text to prepend',
      group: 'Other:',
    })
    .option('template', {
      type: 'string',
      description: 'Template for prompt',
      group: 'Other:',
    })
    .option('no-cache', {
      type: 'boolean',
      description: 'Disable caching (force fresh analysis)',
      group: 'Other:',
    })
    .option('explain', {
      type: 'boolean',
      description: 'Dry run with detailed logging (no output generated)',
      group: 'Other:',
    })
    .option('verbose', {
      type: 'boolean',
      description: 'Enable verbose error logging for debugging',
      group: 'Other:',
    })
    .option('help', {
      alias: 'h',
      type: 'boolean',
      description: 'Show help',
      group: 'Other:',
    })
    .option('version', {
      alias: 'v',
      type: 'boolean',
      description: 'Show version',
      group: 'Other:',
    })

    // Conflicts and implications
    .conflicts('watch', 'interactive')
    .conflicts('staged', 'diff')
    .conflicts('staged', 'dirty')
    .conflicts('diff', 'dirty')

    // Usage and examples
    .usage('\x1b[1mPACKX\x1b[0m - AI Context Bundler\n\n\x1b[1mUSAGE\x1b[0m\n  packx [options] [path...]')
    .example('packx -s "TODO"', 'Find "TODO" in all code files')
    .example('packx -s "useState" -i tsx', 'Find hooks in TSX files')
    .example('packx src/ -i "*.py"', 'Pack all Python files in src/')
    .example('packx -s "error" -l 5', '5 lines of context around errors')

    // Epilogue with additional information
    .epilogue('For more information, visit: https://github.com/johnlindquist/pack')

    // Parse with strict mode disabled to allow positional arguments
    .strict(false)

  const parsed = parser.parseSync();

  // Return as Argv type
  return parsed as unknown as Argv;
}

// printHelp is no longer needed - yargs generates help automatically
// But we keep it for backward compatibility, delegating to yargs
export function printHelp(): void {
  const txt = `
\x1b[1mPACKX\x1b[0m - AI Context Bundler

\x1b[1mUSAGE\x1b[0m
  packx [options] [path...]

\x1b[1mEXAMPLES\x1b[0m
  packx -s "TODO"                  # Find "TODO" in all code files
  packx -s "useState" -i tsx       # Find hooks in TSX files
  packx src/ -i "*.py"             # Pack all Python files in src/
  packx -s "error" -l 5            # 5 lines of context around errors

\x1b[1mSEARCH & FILTER\x1b[0m
  -s, --strings <text>     Include files containing text (use multiple times)
  -S, --exclude-strings    Exclude files containing text
  -i, --include <glob>     Include filenames/extensions (e.g. "*.ts", "src/")
  -x, --exclude <glob>     Exclude filenames/extensions
  -R, --regex              Treat search strings as regex patterns
  -C, --case-sensitive     Enable case-sensitive search
      --staged             Include only git staged files
      --diff               Include only files changed from main
      --dirty              Include only modified/untracked files
      --no-packignore      Ignore .packignore file

\x1b[1mPROCESSING\x1b[0m
      --strip-comments     Strip comments from code
      --no-comments        Alias for --strip-comments
      --minify             Remove empty lines and whitespace
  -l, --lines <num>        Extract N lines of context around matches
  -r, --related            Include related files (tests, stories)
      --follow-imports     Include files imported by matched files
      --instruction <file> Prepend custom instructions

\x1b[1mOUTPUT\x1b[0m
  -o, --output <file>      Write output to file
  -f, --format <fmt>       Output format: xml, markdown, plain, jsonl (default: xml)
  -c, --copy               Copy output to clipboard
      --stdout             Write to stdout (default if no -o)
      --preview            Show matching files without packing
  -M, --max-tokens <N>     Split output into chunks of max N tokens each
                           Creates output-1.xml, output-2.xml, etc.

\x1b[1mPERFORMANCE\x1b[0m
      --rg                 Force ripgrep for file search (auto-detected by default)
      --no-rg              Disable ripgrep, use Node.js glob instead

\x1b[1mINTERACTIVE MODE\x1b[0m
  -I, --interactive        Select files interactively with preview pane
                           • Tab to focus/unfocus preview
                           • PgUp/PgDn to scroll preview
                           • With -l, shows context windows around matches

\x1b[1mWATCH MODE\x1b[0m
  -w, --watch              Watch for file changes and auto-update output

\x1b[1mOTHER\x1b[0m
      --no-cache           Disable caching (force fresh analysis)
      --explain            Dry run with detailed logging (no output generated)
      --verbose            Enable verbose error logging for debugging
  -h, --help               Show this help
  -v, --version            Show version
`;
  console.log(txt);
}
