/**
 * CLI argument parsing and help text for packx
 */

import mri from "mri";

export type Argv = mri.Argv & {
  strings?: string | string[];
  s?: string | string[];
  "exclude-strings"?: string | string[];
  S?: string | string[];
  extensions?: string;
  e?: string;
  "exclude-extensions"?: string;
  x?: string;
  file?: string;
  f?: string;
  lines?: number;
  l?: number;
  prompt?: string | string[];
  p?: string | string[];
  "prompt-path"?: string | string[];
  P?: string | string[];
  "case-sensitive"?: boolean;
  C?: boolean;
  copy?: boolean;
  c?: boolean;
  preview?: boolean;
  help?: boolean;
  h?: boolean;
  version?: boolean;
  v?: boolean;
  // Git-aware context flags
  staged?: boolean;
  diff?: boolean;
  dirty?: boolean;
  // Interactive selection
  interactive?: boolean;
  I?: boolean;
  // Related files discovery
  related?: boolean;
  r?: boolean;
  // Regex mode
  regex?: boolean;
  R?: boolean;
};

export function parseArgs(args: string[]): Argv {
  return mri(args, {
    alias: {
      s: "strings",
      S: "exclude-strings",
      e: "extensions",
      x: "exclude-extensions",
      f: "file",
      l: "lines",
      p: "prompt",
      P: "prompt-path",
      C: "case-sensitive",
      c: "copy",
      h: "help",
      v: "version",
      I: "interactive",
      r: "related",
      R: "regex"
    },
    string: [
      "strings", "s",
      "exclude-strings", "S",
      "extensions", "e",
      "exclude-extensions", "x",
      "file", "f",
      "prompt", "p",
      "prompt-path", "P",
      "include",
      "ignore", "i"
    ],
    boolean: [
      "case-sensitive", "C",
      "preview",
      "copy", "c",
      "help", "h",
      "version", "v",
      "stdout",
      // Git-aware context
      "staged",
      "diff",
      "dirty",
      // Interactive & related
      "interactive", "I",
      "related", "r",
      // Regex mode
      "regex", "R"
    ]
  }) as Argv;
}

export function printHelp(): void {
  const txt = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                           PACKX - Smart File Filter                          ║
║         Bundle only the files you need for focused AI analysis              ║
╚══════════════════════════════════════════════════════════════════════════════╝

OVERVIEW
  Packx filters your repository files by content AND extension, then bundles
  only matching files for AI consumption. Perfect for providing focused context
  to LLMs without overwhelming them with irrelevant code.

USAGE
  packx init [filename]                      Create a config file template
  packx -s "string" [options] [repomix...]   Search and bundle files
  packx -f config.txt [options] [repomix...] Use a config file

╭──────────────────────────────────────────────────────────────────────────────╮
│                              QUICK START                                     │
╰──────────────────────────────────────────────────────────────────────────────╯

  1. Install packx:
     npm install -g packx

  2. Create a search config:
     packx init my-search

  3. Edit the config with your patterns:
     nano my-search.ini

  4. Run the search:
     packx -f my-search.ini -o results.md

╭──────────────────────────────────────────────────────────────────────────────╮
│                           COMMON USE CASES                                   │
╰──────────────────────────────────────────────────────────────────────────────╯

🔍 FIND ALL TODOS AND FIXMES
  packx -s "TODO" -s "FIXME" -s "HACK" -s "XXX"

  This searches ALL common code files by default - no need to specify extensions!

📦 BUNDLE REACT HOOKS FOR REVIEW
  packx -s "useState" -s "useEffect" -s "useCallback" -e "tsx,jsx" -o hooks.md

  Focus on just React/JSX files containing hooks.

🐛 DEBUG WITH CONTEXT LINES
  packx -s "error" -s "exception" -l 20 --style markdown

  Extract only 20 lines around each error/exception - perfect for debugging!

🔒 SECURITY AUDIT
  packx -s "apiKey" -s "secret" -s "password" -s "token" \\
        -e "js,ts,env,json" -x "test.js,spec.js" -o security.xml

  Find sensitive strings, excluding test files.

📋 COPY TO CLIPBOARD
  packx -s "console.log" --copy
  packx -s "debugger" -c      # -c is shorthand for --copy

  Instantly copy results to clipboard for pasting into ChatGPT, Claude, etc.

🔤 REGEX SEARCH MODE
  packx -s "function\\s+\\w+" -R        # Match function declarations
  packx -s "console\\.(log|warn)" -R    # Match console methods

  Use -R/--regex to enable raw regex patterns instead of literal strings.

╭──────────────────────────────────────────────────────────────────────────────╮
│                              OPTIONS REFERENCE                               │
╰──────────────────────────────────────────────────────────────────────────────╯

PACKX OPTIONS
  -s, --strings STRING        Search string (use multiple times)
  -S, --exclude-strings       Exclude files containing these strings
  -e, --extensions EXTS       Include only these extensions (comma-separated)
  -x, --exclude-extensions    Exclude these patterns (matched from end)
  -f, --file PATH            Read configuration from file
  -l, --lines NUMBER         Context lines around matches (default: entire file)
  -p, --prompt TEXT         Append a Markdown prompt at end of output
      --prompt-path PATH    Append contents of file as a prompt
  -C, --case-sensitive       Make search case-sensitive (default: case-insensitive)
  -R, --regex                Treat search strings as raw regex patterns
      --preview              List matched files without bundling
  -h, --help                 Show this help message
  -v, --version              Show version number

GIT-AWARE CONTEXT (Work-in-Progress Mode)
      --staged               Bundle only files staged for commit
      --diff                 Bundle files changed vs main/master branch
      --dirty                Bundle modified + untracked files in working tree

INTERACTIVE & RELATED FILES
  -I, --interactive          Interactively select files from matches
  -r, --related              Include related files (tests, styles, stories)

REPOMIX PASSTHROUGH OPTIONS
  -o, --output PATH          Output file path (default: repomix-output.xml)
      --style FORMAT         Output format: xml, markdown, plain
      --compress             Compress output for smaller size
  -c, --copy                 Copy output to clipboard
      --remove-comments      Strip comments from code
      --token-count-tree     Show token count statistics
      --instruction-file-path  Custom instructions file

  (All other Repomix flags are automatically passed through)

DEFAULT EXTENSIONS
  When -e is not specified, packx searches ALL of these by default:

  • Languages: js, jsx, ts, tsx, mjs, cjs, py, rb, go, java, cpp, c, h,
               rs, swift, kt, scala, php
  • Frameworks: vue, svelte, astro
  • Styles: css, scss, less
  • Config: json, yaml, yml, toml, xml
  • Docs: md, mdx, txt
  • Scripts: sh, bash, zsh, fish
  • Data: sql, graphql, gql

╭──────────────────────────────────────────────────────────────────────────────╮
│                               ABOUT PACKX                                    │
╰──────────────────────────────────────────────────────────────────────────────╯

  Version: v3.4.0
  Author: John Lindquist
  License: MIT
  Repository: https://github.com/johnlindquist/pack

  Packx bundles files for AI consumption with smart filtering,
  ensuring you only package what you need. Perfect for focused AI analysis,
  code reviews, debugging sessions, and codebase exploration.

  Report issues: https://github.com/johnlindquist/pack/issues
  Star if useful: https://github.com/johnlindquist/pack ⭐

`;
  process.stdout.write(txt);
}
