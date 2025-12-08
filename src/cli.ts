/**
 * CLI argument parsing and help text for packx
 */

import mri from "mri";

export type Argv = mri.Argv & {
  // Search & Filter
  strings?: string | string[];     // -s
  "exclude-strings"?: string | string[]; // -S
  include?: string | string[];     // -i
  exclude?: string | string[];     // -x
  regex?: boolean;                 // -R
  "case-sensitive"?: boolean;      // -C

  // Git
  staged?: boolean;
  diff?: boolean;
  dirty?: boolean;

  // Output
  output?: string;                 // -o
  format?: string;                 // -f
  copy?: boolean;                  // -c
  lines?: number;                  // -l
  preview?: boolean;               // --preview
  stdout?: boolean;

  // Processing
  "strip-comments"?: boolean;      // --strip-comments
  "no-comments"?: boolean;         // --no-comments (alias)
  minify?: boolean;                // --minify
  related?: boolean;               // -r

  // Instructions
  instruction?: string;
  prompt?: string | string[];      // -p

  // Meta
  config?: string;
  file?: string;                   // -f (legacy alias for config)
  interactive?: boolean;           // -I
  help?: boolean;                  // -h
  version?: boolean;               // -v

  // Legacy mappings
  extensions?: string | string[];
  "exclude-extensions"?: string | string[];
};

export function parseArgs(args: string[]): Argv {
  return mri(args, {
    alias: {
      s: "strings",
      S: "exclude-strings",
      i: "include",
      e: "extensions",
      x: "exclude",
      o: "output",
      f: "format",
      c: "copy",
      l: "lines",
      C: "case-sensitive",
      R: "regex",
      h: "help",
      v: "version",
      I: "interactive",
      r: "related",
      p: "prompt",
    },
    string: [
      "strings", "s",
      "exclude-strings", "S",
      "include", "i", "extensions", "e",
      "exclude", "x", "exclude-extensions",
      "output", "o",
      "format", "f", "style",
      "config", "file",
      "prompt", "p", "template",
      "instruction"
    ],
    boolean: [
      "regex", "R",
      "case-sensitive", "C",
      "copy", "c",
      "strip-comments", "no-comments",
      "minify",
      "staged",
      "diff",
      "dirty",
      "interactive", "I",
      "related", "r",
      "preview",
      "help", "h",
      "version", "v",
      "stdout"
    ]
  }) as Argv;
}

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

\x1b[1mPROCESSING\x1b[0m
      --strip-comments     Strip comments from code
      --no-comments        Alias for --strip-comments
      --minify             Remove empty lines and whitespace
  -l, --lines <num>        Extract N lines of context around matches
  -r, --related            Include related files (tests, stories)
      --instruction <file> Prepend custom instructions

\x1b[1mOUTPUT\x1b[0m
  -o, --output <file>      Write output to file
  -f, --format <fmt>       Output format: xml, markdown, plain (default: xml)
  -c, --copy               Copy output to clipboard
      --stdout             Write to stdout (default if no -o)
      --preview            Show matching files without packing

\x1b[1mOTHER\x1b[0m
  -I, --interactive        Select files interactively
      --config <file>      Load config file
  -h, --help               Show this help
  -v, --version            Show version
`;
  console.log(txt);
}
