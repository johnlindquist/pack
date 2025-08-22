#!/usr/bin/env node
/**
 * repomix-filter-pack
 *
 * Usage:
 *   pack -s "setFlags" -s "flaggedValue" -e "ts,tsx" [repomix flags...]
 *
 * Examples (forwarding extra Repomix options):
 *   pack -s "foo" -s "bar" -e "ts,tsx" --compress -o filtered.xml --style xml
 */

import mri from "mri";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { glob } from "glob";
import { Minimatch } from "minimatch";

type Argv = mri.Argv & {
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
  "case-sensitive"?: boolean;
  C?: boolean;
  preview?: boolean;
  help?: boolean;
  h?: boolean;
  version?: boolean;
  v?: boolean;
};

function printHelp() {
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

╭──────────────────────────────────────────────────────────────────────────────╮
│                          DETAILED EXAMPLES                                   │
╰──────────────────────────────────────────────────────────────────────────────╯

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. BASIC STRING SEARCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  # Single string search across all default extensions
  packx -s "localStorage"
  
  # Multiple strings (files must contain at least ONE)
  packx -s "fetch" -s "axios" -s "XMLHttpRequest"
  
  # Strings with special characters (no escaping needed!)
  packx -s "array[index]" -s "obj.prop" -s "foo(bar, baz)"
  packx -s "// TODO:" -s "/* FIXME" -s "@deprecated"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. EXTENSION FILTERING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  # Specific extensions (multiple formats supported)
  packx -s "import" -e "ts,tsx"              # Comma-separated
  packx -s "import" -e "ts" -e "tsx"         # Multiple flags
  packx -s "import" -e ts -e tsx -e jsx      # No quotes needed
  
  # Exclude patterns (matched from end of filename)
  packx -s "interface" -e "ts" -x "d.ts"     # Exclude .d.ts files
  packx -s "test" -x "spec.ts" -x "test.ts"  # Exclude test files
  packx -s "build" -x ".min.js" -x ".min.css" # Exclude minified
  
  # Exclude files containing specific strings
  packx -s "useState" -S "test" -S "mock"    # Find useState, skip test/mock files
  packx -s "API" -S "deprecated" -S "legacy" # Find API, skip deprecated/legacy
  
  # Case-sensitive search (default is case-insensitive)
  packx -s "API" -C                          # Match API but not api or Api
  packx -s "TODO" --case-sensitive           # Match TODO but not todo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. CONTEXT LINES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  # Extract only N lines around each match (not entire files!)
  packx -s "TODO" -l 5                    # 5 lines before & after
  packx -s "error" -l 20 -o errors.md     # 20 lines of context
  packx -s "FIXME" --lines 10             # Long form flag
  
  # Context windows are automatically merged when they overlap!
  # If two TODOs are 3 lines apart with -l 5, you get one combined window

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. CONFIG FILES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  # Create config templates
  packx init                        # Creates pack-config.ini
  packx init todos                  # Creates todos.ini
  packx init team-search.config     # Keep custom extension if specified
  
  # Use config files
  packx -f todos.txt
  packx -f api-search.txt -o api.md
  packx -f hooks.txt --style markdown --compress
  
  # Combine config with CLI args (CLI adds to config)
  packx -f base.txt -s "extraSearch" -e "vue"

  Example config file (todos.txt):
  ────────────────────────────────
  [search]
  TODO
  FIXME
  HACK
  XXX
  NOTE
  
  [extensions]
  # Leave empty for all defaults
  # Or specify specific ones:
  ts
  tsx
  js
  jsx
  
  [exclude]
  node_modules
  .min.js
  dist
  build

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. OUTPUT OPTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  # Different output formats
  packx -s "API" --style markdown -o api.md
  packx -s "API" --style xml -o api.xml
  packx -s "API" --style plain -o api.txt
  
  # Copy to clipboard (multiple ways)
  packx -s "bug" --copy              # Long form
  packx -s "bug" -c                  # Short form
  packx -s "bug" -l 10 -c            # With context + copy
  
  # Preview mode (just list files, no bundling)
  packx -s "deprecated" --preview
  packx -s "legacy" -e "js" --preview

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. REPOMIX INTEGRATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  # All Repomix flags pass through automatically
  packx -s "class" --compress --remove-comments
  packx -s "function" --token-count-tree
  packx -s "import" --instruction-file-path ./instructions.md
  
  # Complex Repomix examples
  packx -s "useState" -e "tsx" \\
        --compress \\
        --style markdown \\
        --remove-comments \\
        --token-count-tree \\
        -o react-analysis.md

╭──────────────────────────────────────────────────────────────────────────────╮
│                           REAL-WORLD WORKFLOWS                               │
╰──────────────────────────────────────────────────────────────────────────────╯

📱 REACT NATIVE DEBUGGING
  # Find all state management issues
  packx -s "setState" -s "useState" -s "redux" -s "mobx" \\
        -e "tsx,jsx" -l 30 -o state-debug.md
  
  # Find navigation problems
  packx -s "navigation" -s "navigate" -s "route" \\
        -e "tsx" -x "test.tsx" --compress

🔧 REFACTORING PREPARATION
  # Find all deprecated patterns
  packx -s "componentWillMount" -s "componentWillReceiveProps" \\
        -s "componentWillUpdate" -e "jsx,tsx" -o deprecated.md
  
  # Find all console.logs to remove
  packx -s "console.log" -s "console.debug" \\
        -x "test.js" --preview

🏗️ ARCHITECTURE REVIEW
  # Find all API endpoints
  packx -s "/api/" -s "fetch(" -s "axios" -s ".get(" -s ".post(" \\
        -e "ts,tsx,js" -o api-surface.md
  
  # Find all database queries
  packx -s "SELECT" -s "INSERT" -s "UPDATE" -s "DELETE" \\
        -s "mongodb" -s "mongoose" -o database-layer.md

🧪 TEST COVERAGE ANALYSIS
  # Find untested functions
  packx -s "export function" -s "export const" -e "ts" \\
        -x "test.ts" -x "spec.ts" -o possibly-untested.md
  
  # Find all test files
  packx -s "describe(" -s "test(" -s "it(" \\
        -e "test.ts,spec.ts,test.js,spec.js" -o all-tests.md

🚀 PERFORMANCE OPTIMIZATION
  # Find potential performance issues
  packx -s "forEach" -s "map" -s "filter" -s "reduce" \\
        -s "for (" -s "while (" -l 20 -o loops-analysis.md
  
  # Find all async operations
  packx -s "async" -s "await" -s "Promise" -s "then(" \\
        -e "ts,tsx" -l 30 --compress

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
  -C, --case-sensitive       Make search case-sensitive (default: case-insensitive)
      --preview              List matched files without bundling
  -h, --help                 Show this help message
  -v, --version              Show version number

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
│                              TIPS & TRICKS                                   │
╰──────────────────────────────────────────────────────────────────────────────╯

💡 PRO TIPS

  1. Use --preview first to verify your search:
     packx -s "password" --preview
     # Check the file list, then run without --preview

  2. Combine multiple patterns for OR logic:
     packx -s "error" -s "exception" -s "fail" -s "crash"
     # Finds files with ANY of these strings

  3. Use config files for team sharing:
     # Create standard searches for your team
     packx init team-standards.txt
     git add team-standards.txt
     git commit -m "Add team search patterns"

  4. Context lines for token optimization:
     # Instead of sending entire files to AI:
     packx -s "bug" -l 20    # Just 20 lines around bugs
     packx -s "TODO" -l 5    # Minimal context for TODOs

  5. Quick clipboard for AI chats:
     # Search and instantly copy for ChatGPT/Claude
     packx -s "function calculatePrice" -l 50 -c
     # Now just paste into your AI chat!

⚠️ COMMON PITFALLS

  • Don't use dots in extensions: use "ts" not ".ts"
  • Search is case-insensitive by default (use -C for case-sensitive)
  • Use quotes for special chars in shell: -s "foo()"
  • Large repos: use -e to limit extensions: -e "ts,tsx"
  • -x matches from END: "d.ts" matches "*.d.ts" files

📊 PERFORMANCE NOTES

  • Packx uses ripgrep-like algorithms for speed
  • .gitignore patterns are respected automatically
  • Binary files are skipped automatically
  • Files > 10MB are skipped for safety
  • Use --preview to estimate before processing

╭──────────────────────────────────────────────────────────────────────────────╮
│                               ABOUT PACKX                                    │
╰──────────────────────────────────────────────────────────────────────────────╯

  Version: v1.4.1
  Author: John Lindquist
  License: MIT
  Repository: https://github.com/johnlindquist/pack
  
  Packx is a smart wrapper around Repomix that filters files BEFORE bundling,
  ensuring you only package what you need. Perfect for focused AI analysis,
  code reviews, debugging sessions, and codebase exploration.

  Report issues: https://github.com/johnlindquist/pack/issues
  Star if useful: https://github.com/johnlindquist/pack ⭐

`;
  process.stdout.write(txt);
}

function parseCSV(input?: string): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toExtSet(exts: string[]): Set<string> {
  const s = new Set<string>();
  for (const e of exts) {
    const dot = e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`;
    s.add(dot);
  }
  return s;
}

function escRegex(lit: string): string {
  // Escape regex-special chars for safe substring search
  return lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Context extraction types and functions
type MatchPosition = {
  line: number;
  column: number;
  match: string;
};

type ContextWindow = {
  startLine: number;
  endLine: number;
  lines: string[];
  matches: MatchPosition[];
};

function findAllMatches(content: string, pattern: RegExp): MatchPosition[] {
  const lines = content.split('\n');
  const matches: MatchPosition[] = [];
  
  lines.forEach((line, lineIndex) => {
    let match;
    const linePattern = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g');
    while ((match = linePattern.exec(line)) !== null) {
      matches.push({
        line: lineIndex + 1, // 1-based line numbers
        column: match.index,
        match: match[0]
      });
    }
  });
  
  return matches;
}

function extractContextWindows(
  content: string, 
  pattern: RegExp, 
  contextLines: number
): ContextWindow[] {
  const lines = content.split('\n');
  const matches = findAllMatches(content, pattern);
  
  if (matches.length === 0) return [];
  
  // Create initial windows
  const windows: ContextWindow[] = [];
  
  for (const match of matches) {
    const startLine = Math.max(1, match.line - contextLines);
    const endLine = Math.min(lines.length, match.line + contextLines);
    
    windows.push({
      startLine,
      endLine,
      lines: lines.slice(startLine - 1, endLine),
      matches: [match]
    });
  }
  
  // Merge overlapping windows
  const merged: ContextWindow[] = [];
  let current: ContextWindow | null = null;
  
  for (const window of windows) {
    if (!current) {
      current = window;
    } else if (window.startLine <= current.endLine + 1) {
      // Merge windows
      current.endLine = Math.max(current.endLine, window.endLine);
      current.lines = lines.slice(current.startLine - 1, current.endLine);
      current.matches.push(...window.matches);
    } else {
      // Start new window
      merged.push(current);
      current = window;
    }
  }
  
  if (current) {
    merged.push(current);
  }
  
  return merged;
}

function formatContextWindows(windows: ContextWindow[], filePath: string): string {
  if (windows.length === 0) return '';
  
  let output = '';
  for (const window of windows) {
    // Add separator between windows
    if (output) {
      output += '\n  ...\n';
    }
    
    // Add lines with line numbers
    window.lines.forEach((line, index) => {
      const lineNum = window.startLine + index;
      output += `${String(lineNum).padStart(6, ' ')}│ ${line}\n`;
    });
  }
  
  return output;
}

async function fileContainsAnyStrings(absPath: string, pattern?: RegExp | null, excludePattern?: RegExp | null): Promise<boolean> {
  try {
    const stat = await fs.stat(absPath);
    // Skip extremely large files (> 10MB) as a guard (Repomix ignores most binaries anyway)
    if (stat.size > 10 * 1024 * 1024) return false;

    const buf = await fs.readFile(absPath, "utf8");
    
    // First check if file contains excluded strings
    if (excludePattern && excludePattern.test(buf)) {
      return false;
    }
    
    // Then check if file contains required strings (if provided)
    return pattern ? pattern.test(buf) : true;
  } catch {
    return false;
  }
}

function buildRepomixPassthroughArgs(parsed: Argv): string[] {
  const passthrough: string[] = [];
  const reserved = new Set([
    "_",
    "strings",
    "exclude-strings",
    "extensions",
    "exclude-extensions",
    "file",
    "lines",
    "include",
    "ignore",
    "i",
    "case-sensitive",
    "s",
    "S",
    "e",
    "x",
    "f",
    "l",
    "C",
    "stdout",
    "preview",
    "help",
    "h",
    "version",
    "v",
  ]);

  for (const [key, val] of Object.entries(parsed)) {
    if (reserved.has(key)) continue;
    if (val === undefined) continue;

    const flag = key.length === 1 ? `-${key}` : `--${key}`;

    if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === "boolean") {
          if (v) passthrough.push(flag);
        } else {
          passthrough.push(flag, String(v));
        }
      }
    } else if (typeof val === "boolean") {
      if (val) passthrough.push(flag);
    } else {
      passthrough.push(flag, String(val));
    }
  }

  return passthrough;
}

// Normalize strings to array
function normalizeStrings(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

// Parse config file
async function parseConfigFile(filePath: string): Promise<{
  search: string[];
  extensions: string[];
  exclude: string[];
}> {
  const config = {
    search: [] as string[],
    extensions: [] as string[],
    exclude: [] as string[]
  };

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    let currentSection: 'search' | 'extensions' | 'exclude' | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Check for section headers
      if (trimmed === '[search]' || trimmed === '[strings]') {
        currentSection = 'search';
        continue;
      }
      if (trimmed === '[extensions]' || trimmed === '[include]') {
        currentSection = 'extensions';
        continue;
      }
      if (trimmed === '[exclude]' || trimmed === '[exclude-extensions]' || trimmed === '[ignore]') {
        currentSection = 'exclude';
        continue;
      }
      
      // Add line to current section
      if (currentSection) {
        config[currentSection].push(trimmed);
      }
    }
    
    return config;
  } catch (error) {
    console.error(`Error reading config file: ${filePath}`);
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  }
}

async function createConfigTemplate(filename: string = 'pack-config.ini') {
  const template = `# Pack configuration file
# Search for specific strings in your codebase
# Lines starting with # are comments
# Empty lines are ignored

[search]
# Add search strings here, one per line
# Examples:
# console.log
# TODO
# FIXME

[extensions]
# File extensions to include (without dots)
# Leave empty to search all common code files
# Examples:
# ts
# tsx
# js
# jsx

[exclude]
# Exclude patterns using gitignore syntax
# Examples:
# *.d.ts              # All TypeScript declaration files
# *.test.ts           # All test files
# *.spec.ts           # All spec files  
# *.min.js            # All minified JS files
# docs/               # Docs directory
# site/               # Site directory
# **/test/**          # Any test directories
# **/*.test.ts        # Test files anywhere
# examples/**         # Everything under examples
# !important.test.ts  # Exception: include this test file
`;

  try {
    // Check if file already exists
    try {
      await fs.access(filename);
      console.error(`❌ File '${filename}' already exists. Use a different name or delete the existing file.`);
      process.exit(1);
    } catch {
      // File doesn't exist, proceed
    }

    // Check if directory exists, create if needed
    const dir = path.dirname(filename);
    if (dir && dir !== '.' && dir !== '') {
      try {
        await fs.access(dir);
      } catch {
        // Directory doesn't exist, prompt user
        console.log(`📁 Directory '${dir}' does not exist.`);
        
        // Import readline for user input
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const answer = await new Promise<string>((resolve) => {
          rl.question('Would you like to create it? (y/n): ', resolve);
        });
        rl.close();
        
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          await fs.mkdir(dir, { recursive: true });
          console.log(`✅ Created directory: ${dir}`);
        } else {
          console.log('❌ Directory creation cancelled.');
          process.exit(1);
        }
      }
    }

    await fs.writeFile(filename, template, 'utf8');
    console.log(`✅ Created config template: ${filename}`);
    console.log(`\nEdit the file and then run:`);
    console.log(`  packx -f ${filename}`);
  } catch (error) {
    console.error(`❌ Failed to create config file: ${error}`);
    process.exit(1);
  }
}

async function main() {
  // Check for init command first
  if (process.argv[2] === 'init') {
    let filename = process.argv[3] || 'pack-config.ini';
    
    // Add .ini extension if no extension provided
    if (filename && !path.extname(filename)) {
      filename = `${filename}.ini`;
    }
    
    await createConfigTemplate(filename);
    process.exit(0);
  }

  // Parse with aliases properly configured
  const parsed = mri(process.argv.slice(2), {
    alias: {
      s: "strings",
      S: "exclude-strings",
      e: "extensions",
      x: "exclude-extensions",
      f: "file",
      l: "lines",
      C: "case-sensitive",
      h: "help",
      v: "version"
    },
    string: [
      "strings", "s",
      "exclude-strings", "S",
      "extensions", "e",
      "exclude-extensions", "x",
      "file", "f",
      "include",
      "ignore", "i"
    ],
    boolean: ["case-sensitive", "C", "preview", "help", "h", "version", "v", "stdout"]
  }) as Argv;

  if (parsed.help || parsed.h) {
    printHelp();
    process.exit(0);
  }
  if (parsed.version || parsed.v) {
    console.log("packx v3.0.4");
    process.exit(0);
  }

  let strings: string[] = [];
  let excludeStrings: string[] = [];
  let extensions: Set<string>;
  let excludePatterns: string[] = [];
  const caseSensitive = parsed["case-sensitive"] || parsed.C || false;
  
  // Repomix-style include/ignore patterns (post-filtered via Minimatch on relative paths)
  function toArray(val: any): string[] {
    if (!val) return [];
    return Array.isArray(val) ? val.map(String) : [String(val)];
  }
  const includeRaw = toArray((parsed as any).include);
  const includeList = includeRaw.flatMap(v => parseCSV(v));
  const ignoreRaw = toArray((parsed as any).ignore || (parsed as any).i);
  const ignoreList = ignoreRaw.flatMap(v => parseCSV(v));

  function hasGlobChars(s: string): boolean {
    return /[\*\?\[\]\{\}!]/.test(s);
  }
  function expandPattern(p: string, forInclude = true): string[] {
    // If pattern already has glob characters or path separators with glob, keep as-is
    if (hasGlobChars(p)) return [p];
    const norm = p.replace(/^[./]+/, '');
    const patterns: string[] = [];
    // exact relative path (file at root)
    patterns.push(norm);
    // any file named p anywhere
    patterns.push(`**/${norm}`);
    // any path under a directory named p at root
    patterns.push(`${norm}/**`);
    // any path under a directory named p anywhere
    patterns.push(`**/${norm}/**`);
    return Array.from(new Set(patterns));
  }

  const includeExpanded = includeList.flatMap(p => expandPattern(p, true));
  const ignoreExpanded = ignoreList.flatMap(p => expandPattern(p, false));
  const includeMatchers = includeExpanded.map(p => new Minimatch(p, { dot: true, nocase: !caseSensitive, noglobstar: false }));
  const ignoreMatchers = ignoreExpanded.map(p => new Minimatch(p, { dot: true, nocase: !caseSensitive, noglobstar: false }));

  // Check if config file is provided
  const configFile = parsed.file || parsed.f;
  if (configFile) {
    const config = await parseConfigFile(configFile);
    strings = config.search;
    extensions = toExtSet(config.extensions);
    excludePatterns = config.exclude;  // Treat all excludes as gitignore patterns
    
    // Allow command-line args to add to config file values
    strings.push(...normalizeStrings(parsed.strings));
    strings.push(...normalizeStrings(parsed.s));
    
    // Collect exclude strings from CLI
    excludeStrings = [
      ...normalizeStrings(parsed["exclude-strings"]),
      ...normalizeStrings(parsed.S)
    ].filter(Boolean);
    
    const cliExtensions = parsed.extensions || parsed.e;
    const cliExtList = Array.isArray(cliExtensions) 
      ? cliExtensions.flatMap(v => parseCSV(String(v)))
      : parseCSV(cliExtensions);
    for (const ext of toExtSet(cliExtList)) {
      extensions.add(ext);
    }
    
    // Handle CLI exclude patterns
    const cliExclude = parsed["exclude-extensions"] || parsed.x;
    const cliExcludeList = Array.isArray(cliExclude)
      ? cliExclude.flatMap(v => parseCSV(String(v)))
      : parseCSV(cliExclude);
    
    // Convert extensions to gitignore patterns
    for (const excl of cliExcludeList) {
      if (excl) {
        // If it looks like an extension, convert to gitignore pattern
        if (!excl.includes('/') && !excl.includes('*')) {
          excludePatterns.push(`**/*.${excl.replace(/^\./, '')}`);
        } else {
          excludePatterns.push(excl);
        }
      }
    }
  } else {
    // Collect all strings from multiple -s flags
    strings = [
      ...normalizeStrings(parsed.strings),
      ...normalizeStrings(parsed.s)
    ].filter(Boolean);

    // Collect exclude strings from -S flags
    excludeStrings = [
      ...normalizeStrings(parsed["exclude-strings"]),
      ...normalizeStrings(parsed.S)
    ].filter(Boolean);

    // Handle both single string and array of strings for extensions
    const extensionValues = parsed.extensions || parsed.e;
    const extensionsList = Array.isArray(extensionValues) 
      ? extensionValues.flatMap(v => parseCSV(String(v)))
      : parseCSV(extensionValues);
    extensions = toExtSet(extensionsList);

    // Handle exclude patterns from CLI
    const excludeValues = parsed["exclude-extensions"] || parsed.x;
    const excludeList = Array.isArray(excludeValues)
      ? excludeValues.flatMap(v => parseCSV(String(v)))
      : parseCSV(excludeValues);
    
    // Convert to gitignore patterns
    for (const excl of excludeList) {
      if (excl) {
        // If it looks like an extension, convert to gitignore pattern
        if (!excl.includes('/') && !excl.includes('*')) {
          excludePatterns.push(`**/*.${excl.replace(/^\./, '')}`);
        } else {
          excludePatterns.push(excl);
        }
      }
    }
  }

  strings = strings.filter(Boolean);

  // If no extensions specified, use common defaults
  if (!extensions.size) {
    extensions = toExtSet([
      'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
      'py', 'rb', 'go', 'java', 'cpp', 'c', 'h',
      'rs', 'swift', 'kt', 'scala', 'php',
      'vue', 'svelte', 'astro',
      'css', 'scss', 'less',
      'json', 'yaml', 'yml', 'toml', 'xml',
      'md', 'mdx', 'txt',
      'sh', 'bash', 'zsh', 'fish',
      'sql', 'graphql', 'gql'
    ]);
  }

  // If no search strings are provided, behave like a repomix wrapper: select by extensions only

  const roots = parsed._.length ? parsed._ : ["."];
  const regexFlags = caseSensitive ? "" : "i";
  const pattern: RegExp | null = strings.length > 0
    ? new RegExp(strings.map(escRegex).join("|"), regexFlags)
    : null;
  const excludePattern: RegExp | null = excludeStrings.length > 0 
    ? new RegExp(excludeStrings.map(escRegex).join("|"), regexFlags)
    : null;

  // 1) Discover files (respecting .gitignore) under each root
  const candidates = new Set<string>();

  for (const root of roots) {
    const absRoot = path.resolve(root);
    
    // Build glob patterns for each extension
    const patterns: string[] = [];
    for (const ext of extensions) {
      const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
      patterns.push(`**/*.${cleanExt}`);
    }
    
    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: absRoot,
        ignore: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/.next/**',
          '**/coverage/**',
          '**/.cache/**',
          '**/tmp/**',
          '**/temp/**',
          '**/*.log',
          '**/.DS_Store',
          '**/Thumbs.db',
          ...excludePatterns  // Add user-defined exclude patterns
        ],
        absolute: true,
        dot: false
      });
      
      for (const file of files) {
        // Accumulate; include/ignore filtering applied after discovery
        candidates.add(file);
      }
    }
  }

  if (!candidates.size) {
    console.warn("⚠️  No files found with the specified extensions in the given roots.");
    process.exit(2);
  }

  // Apply include/ignore matchers on repo-relative paths
  const filteredCandidates: string[] = [];
  for (const p of candidates) {
    const rel = path.relative(process.cwd(), p).replace(/\\/g, '/');
    if (includeMatchers.length && !includeMatchers.some(mm => mm.match(rel))) continue;
    if (ignoreMatchers.length && ignoreMatchers.some(mm => mm.match(rel))) continue;
    filteredCandidates.push(p);
  }

  // 2) Content filter (or pass-through if no strings)
  const matched: string[] = [];
  const foundExtensions = new Set<string>();
  
  if (!pattern) {
    // No include strings: include all candidates unless they match exclude strings
    for (const p of filteredCandidates) {
      if (excludePattern) {
        try {
          const stat = await fs.stat(p);
          if (stat.size > 10 * 1024 * 1024) continue; // safety: skip huge files
          const buf = await fs.readFile(p, 'utf8');
          if (excludePattern.test(buf)) continue;
        } catch { continue; }
      }
      const resolvedPath = path.resolve(p);
      matched.push(resolvedPath);
      const ext = path.extname(resolvedPath).toLowerCase();
      if (ext) foundExtensions.add(ext);
    }
  } else {
    for (const p of filteredCandidates) {
      if (await fileContainsAnyStrings(p, pattern, excludePattern)) {
        const resolvedPath = path.resolve(p);
        matched.push(resolvedPath);
        const ext = path.extname(resolvedPath).toLowerCase();
        if (ext) {
          foundExtensions.add(ext);
        }
      }
    }
  }

  if (!matched.length) {
    console.warn("⚠️  No files matched the given strings.");
    process.exit(3);
  }

  if (parsed.preview) {
    console.log("Matched files:");
    for (const m of matched) console.log(m);
    console.log(`\nTotal: ${matched.length} file(s).`);
    process.exit(0);
  }

  // 3) Run Repomix using custom implementation since stdin and include are broken
  // Convert matched files to relative paths
  const cwd = process.cwd();
  const relativePaths = matched.map(p => path.relative(cwd, p));

  // Determine output early to route logs when writing to stdout
  const rawOutputArg = (parsed.output ?? parsed.o) as any;
  let toStdout = Boolean((parsed as any).stdout);
  if (rawOutputArg === '-' || (parsed.o === true && (parsed._ || []).includes('-'))) {
    toStdout = true;
  }
  const outputFile = typeof rawOutputArg === 'string' ? rawOutputArg : undefined;
  const summaryOnly = !toStdout && !outputFile;
  const outputStyle = parsed.style || "xml";
  const log = (msg: string) => (toStdout ? console.error(msg) : console.log(msg));

  log(`🧩 Packing ${matched.length} file(s)...`);
  
  // Get context lines: if no search strings, ignore -l and pack full files
  const hasSearchStrings = strings.length > 0;
  const contextLines = hasSearchStrings ? (parsed.lines || parsed.l) : undefined;
  
  if (contextLines) {
    log(`📝 Extracting ${contextLines} lines of context around matches...`);
  } else {
    log(`📝 Files selected:`);
    relativePaths.forEach(p => log(`  • ${p}`));
    if (!toStdout && !outputFile) {
      log(`(Summary only. Use -o <file> or --stdout to write content)`);
    }
  }

  // Since Repomix's stdin and include features are broken, 
  // we'll directly create the output ourselves
  
  // Read and (optionally) combine the files
  let output = '';
  let totalMatchCount = 0;
  let totalWindowCount = 0;
  const fileSizes: { path: string; size: number; tokens: number }[] = [];
  
  if (outputStyle === "xml") {
    if (!summaryOnly) {
      output = `This file is a merged representation of the filtered codebase, combined into a single document by packx.

<file_summary>
This section contains a summary of this file.

<purpose>
This file contains a packed representation of filtered repository contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.
</purpose>

<usage_guidelines>
- Treat this file as a snapshot of the repository's state
- Be aware that this file may contain sensitive information
</usage_guidelines>

<notes>
- Files were filtered by packx based on content and extension matching
- Total files included: ${matched.length}${contextLines ? `\n- Context lines: ${contextLines} lines around each match` : ''}
</notes>
</file_summary>

<directory_structure>
${relativePaths.join('\n')}
</directory_structure>

<files>
This section contains the contents of the repository's files.

`;
    }
    
    for (const [index, filePath] of matched.entries()) {
      const relPath = relativePaths[index];
      try {
        const content = await fs.readFile(filePath, 'utf8');
        
        let fileOutput = '';
        if (contextLines) {
          // Extract context windows
          const windows = extractContextWindows(content, pattern!, contextLines);
          if (windows.length > 0) {
            totalWindowCount += windows.length;
            totalMatchCount += windows.reduce((sum, w) => sum + w.matches.length, 0);
            
            const formatted = formatContextWindows(windows, relPath);
            if (formatted) {
              fileOutput = `<file path="${relPath}" matches="${windows.reduce((sum, w) => sum + w.matches.length, 0)}" windows="${windows.length}">
${formatted}</file>

`;
            }
          }
        } else {
          // Include entire file
          fileOutput = `<file path="${relPath}">
${content}
</file>

`;
        }
        
        if (fileOutput) {
          if (!summaryOnly) output += fileOutput;
          // Track file size for summary
          const fileSize = fileOutput.length;
          const fileTokens = Math.round(fileSize / 4);
          fileSizes.push({ path: relPath, size: fileSize, tokens: fileTokens });
        }
      } catch (err) {
        console.error(`Warning: Could not read file ${relPath}: ${err}`);
      }
    }
    if (!summaryOnly) {
      output += `</files>`;
    }
  } else {
    // Markdown format
    if (!summaryOnly) {
      output = `# Packx Output

This file contains ${matched.length} filtered files from the repository.${contextLines ? `\n\n**Context:** ${contextLines} lines around each match` : ''}

## Files

`;
    }
    
    for (const [index, filePath] of matched.entries()) {
      const relPath = relativePaths[index];
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const ext = path.extname(relPath).slice(1) || 'txt';
        
        let fileOutput = '';
        if (contextLines) {
          // Extract context windows
          const windows = extractContextWindows(content, pattern!, contextLines);
          if (windows.length > 0) {
            totalWindowCount += windows.length;
            totalMatchCount += windows.reduce((sum, w) => sum + w.matches.length, 0);
            
            fileOutput = `### ${relPath}

**Matches:** ${windows.reduce((sum, w) => sum + w.matches.length, 0)} | **Context windows:** ${windows.length}

\`\`\`${ext}
${formatContextWindows(windows, relPath)}\`\`\`

`;
          }
        } else {
          // Include entire file
          fileOutput = `### ${relPath}

\`\`\`${ext}
${content}
\`\`\`

`;
        }
        
        if (fileOutput) {
          if (!summaryOnly) output += fileOutput;
          // Track file size for summary
          const fileSize = fileOutput.length;
          const fileTokens = Math.round(fileSize / 4);
          fileSizes.push({ path: relPath, size: fileSize, tokens: fileTokens });
        }
      } catch (err) {
        console.error(`Warning: Could not read file ${relPath}: ${err}`);
      }
    }
  }
  
  // Write the output (file or stdout). Default is summary-only (no content output)
  if (toStdout) {
    process.stdout.write(output);
  } else if (outputFile) {
    await fs.writeFile(outputFile, output, 'utf8');
    console.log(`\n✅ Successfully packed ${matched.length} file(s) to ${outputFile}`);
  }
  
  // Handle passthrough args like --copy
  if (!toStdout && (parsed.copy || parsed.c)) {
    try {
      // Copy to clipboard using the native clipboard API via a child process
      const { spawn } = await import('child_process');
      
      // Determine the platform and use appropriate command
      const platform = process.platform;
      let copyProc;
      
      if (platform === 'darwin') {
        // macOS
        copyProc = spawn('pbcopy');
      } else if (platform === 'win32') {
        // Windows
        copyProc = spawn('clip');
      } else {
        // Linux - try xclip
        copyProc = spawn('xclip', ['-selection', 'clipboard']);
      }
      
      copyProc.stdin.write(output);
      copyProc.stdin.end();
      
      await new Promise((resolve, reject) => {
        copyProc.on('exit', (code) => {
          if (code === 0) {
            console.log('📋 Copied to clipboard!');
            resolve(code);
          } else {
            console.log('⚠️  Could not copy to clipboard');
            reject(new Error(`Copy process exited with code ${code}`));
          }
        });
        copyProc.on('error', (err) => {
          console.log('⚠️  Could not copy to clipboard (clipboard tool not found)');
          reject(err);
        });
      });
    } catch (err) {
      // Silently fail if clipboard is not available
    }
  }
  
  // Calculate some stats
  const totalChars = (!toStdout && !outputFile && fileSizes.length)
    ? fileSizes.reduce((sum, f) => sum + f.size, 0)
    : output.length;
  const totalTokens = Math.round(totalChars / 4); // Rough estimate
  
  // Reuse existing log() for summary output
  log(`\n📊 Pack Summary:`);
  log(`────────────────`);
  log(`  Total Files: ${matched.length} files`);
  if (contextLines) {
    log(`  Context Lines: ${contextLines} around each match`);
    log(`  Total Matches: ${totalMatchCount} matches`);
    log(`  Context Windows: ${totalWindowCount} windows`);
  }
  log(`  Total Tokens: ~${totalTokens.toLocaleString()} tokens`);
  log(`  Total Chars: ${totalChars.toLocaleString()} chars`);
  log(`       Output: ${toStdout ? '-' : (outputFile ?? 'none')}`);
  
  // Show found extensions
  if (foundExtensions.size > 0) {
    const sortedExtensions = Array.from(foundExtensions).sort();
    log(`\n📁 Extensions Found:`);
    log(`────────────────────`);
    log(`  ${sortedExtensions.join(', ')}`);
  }
  
  // Show top files by size
  if (fileSizes.length > 0) {
    const topFiles = fileSizes
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 10);
    
    log(`\n📂 Top 10 Files (by tokens):`);
    log(`──────────────────────────`);
    for (const file of topFiles) {
      const fileName = path.basename(file.path);
      const dirName = path.dirname(file.path);
      const shortPath = dirName === '.' ? fileName : `${dirName}/${fileName}`;
      log(`  ${file.tokens.toLocaleString().padStart(8)} tokens - ${shortPath}`);
    }
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(99);
});
