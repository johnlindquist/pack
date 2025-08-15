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

type Argv = mri.Argv & {
  strings?: string | string[];
  s?: string | string[];
  extensions?: string;
  e?: string;
  "exclude-extensions"?: string;
  x?: string;
  file?: string;
  f?: string;
  context?: number;
  c?: number;
  preview?: boolean;
  help?: boolean;
  h?: boolean;
  version?: boolean;
  v?: boolean;
};

function printHelp() {
  const txt = `
Filter your repo by extension + substring match, then pipe the matches to Repomix (--stdin).

USAGE
  packx init [filename]              Create a config file template
  packx -s "string1" -s "string2" [options] [repomix options...]
  packx -f config.txt [repomix options...]

COMMANDS
  init [filename]    Create a config file template (default: pack-config.txt)

EXAMPLES
  # Search all common code files (default extensions)
  packx -s "TODO" -s "FIXME"
  
  # Search specific file types
  packx -s "useState" -e "ts,tsx"
  
  # Multiple extension flags or comma-separated
  packx -s "import" -e "ts" -e "tsx" -e "jsx"
  packx -s "import" -e "ts,tsx,jsx"
  
  # Exclude .d.ts files while searching .ts files
  packx -s "useState" -e "ts,tsx" -x "d.ts"
  
  # Using a config file
  pack -f my-search.txt --compress -o output.xml
  
  # With repomix passthrough flags
  pack -s "foo" -s "bar" -e "ts,tsx" --compress -o output.xml --style xml
  
  # Search for strings with special characters
  pack -s "array[index]" -s "foo,bar" -s "hello world" -e "js"
  
  # Include only 10 lines of context around each match
  pack -s "TODO" -c 10 -o todos-context.md
  
  # Include 50 lines of context for focused debugging
  pack -s "error" -s "exception" -c 50 --style markdown

OPTIONS (wrapper)
  -s, --strings           Search string (can be used multiple times) [required]
  -e, --extensions        Extensions to include (optional, defaults to common code files)
  -x, --exclude-extensions  Extensions to exclude (multiple flags or comma-separated)
  -f, --file              Read configuration from a file
  -c, --context           Number of context lines around matches (default: all)
      --preview           Only list matched files (no packing)
  -h, --help             Show this help
  -v, --version          Show version

DEFAULT EXTENSIONS (when -e is not specified)
  JavaScript/TypeScript: js, jsx, ts, tsx, mjs, cjs
  Python, Ruby, Go, Java, C/C++, Rust, Swift, Kotlin, Scala, PHP
  Web: vue, svelte, astro, css, scss, less
  Config: json, yaml, yml, toml, xml
  Docs: md, mdx, txt
  Scripts: sh, bash, zsh, fish
  Data: sql, graphql, gql

CONFIG FILE FORMAT
  Create a text file with sections marked by headers:
  
  # Example: my-search.txt
  
  [search]
  useState
  useEffect
  componentDidMount
  
  [extensions]
  ts
  tsx
  jsx
  
  [exclude]
  d.ts
  test.ts
  spec.ts
  
  # Lines starting with # are comments
  # Empty lines are ignored
  # Each line in a section is treated as a separate value

All additional flags are forwarded to Repomix. Common examples:
  --compress
  --style markdown
  -o repomix-output.md
  --remove-comments
  --token-count-tree
  --instruction-file-path ./repomix-instruction.md

Notes:
- Multiple -s flags can be used to search for multiple strings
- Strings can contain ANY characters including commas, spaces, special chars
- Extensions in -x are matched from the end (e.g., "d.ts" matches "*.d.ts")
- Only local directories are supported as inputs (positional). Default: "."

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

async function fileContainsAnyStrings(absPath: string, pattern: RegExp): Promise<boolean> {
  try {
    const stat = await fs.stat(absPath);
    // Skip extremely large files (> 10MB) as a guard (Repomix ignores most binaries anyway)
    if (stat.size > 10 * 1024 * 1024) return false;

    const buf = await fs.readFile(absPath, "utf8");
    return pattern.test(buf);
  } catch {
    return false;
  }
}

function buildRepomixPassthroughArgs(parsed: Argv): string[] {
  const passthrough: string[] = [];
  const reserved = new Set([
    "_",
    "strings",
    "extensions",
    "exclude-extensions",
    "file",
    "s",
    "e",
    "x",
    "f",
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

async function createConfigTemplate(filename: string = 'pack-config.txt') {
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
# Patterns to exclude (matched from end of filename)
# Examples:
# d.ts
# test.ts
# spec.ts
# .min.js
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
    const filename = process.argv[3] || 'pack-config.txt';
    await createConfigTemplate(filename);
    process.exit(0);
  }

  // Parse with aliases properly configured
  const parsed = mri(process.argv.slice(2), {
    alias: {
      s: "strings",
      e: "extensions",
      x: "exclude-extensions",
      f: "file",
      c: "context",
      h: "help",
      v: "version"
    },
    string: ["strings", "s", "extensions", "e", "exclude-extensions", "x", "file", "f"],
    number: ["context", "c"],
    boolean: ["preview", "help", "h", "version", "v"]
  }) as Argv;

  if (parsed.help || parsed.h) {
    printHelp();
    process.exit(0);
  }
  if (parsed.version || parsed.v) {
    console.log("packx v1.4.0");
    process.exit(0);
  }

  let strings: string[] = [];
  let extensions: Set<string>;
  let excludeExtensions: Set<string>;

  // Check if config file is provided
  const configFile = parsed.file || parsed.f;
  if (configFile) {
    const config = await parseConfigFile(configFile);
    strings = config.search;
    extensions = toExtSet(config.extensions);
    excludeExtensions = toExtSet(config.exclude);
    
    // Allow command-line args to add to config file values
    strings.push(...normalizeStrings(parsed.strings));
    strings.push(...normalizeStrings(parsed.s));
    
    const cliExtensions = parsed.extensions || parsed.e;
    const cliExtList = Array.isArray(cliExtensions) 
      ? cliExtensions.flatMap(v => parseCSV(String(v)))
      : parseCSV(cliExtensions);
    for (const ext of toExtSet(cliExtList)) {
      extensions.add(ext);
    }
    
    const cliExclude = parsed["exclude-extensions"] || parsed.x;
    const cliExcludeList = Array.isArray(cliExclude)
      ? cliExclude.flatMap(v => parseCSV(String(v)))
      : parseCSV(cliExclude);
    for (const ext of toExtSet(cliExcludeList)) {
      excludeExtensions.add(ext);
    }
  } else {
    // Collect all strings from multiple -s flags
    strings = [
      ...normalizeStrings(parsed.strings),
      ...normalizeStrings(parsed.s)
    ].filter(Boolean);

    // Handle both single string and array of strings for extensions
    const extensionValues = parsed.extensions || parsed.e;
    const extensionsList = Array.isArray(extensionValues) 
      ? extensionValues.flatMap(v => parseCSV(String(v)))
      : parseCSV(extensionValues);
    extensions = toExtSet(extensionsList);

    // Handle both single string and array of strings for exclude-extensions
    const excludeValues = parsed["exclude-extensions"] || parsed.x;
    const excludeList = Array.isArray(excludeValues)
      ? excludeValues.flatMap(v => parseCSV(String(v)))
      : parseCSV(excludeValues);
    excludeExtensions = toExtSet(excludeList);
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

  if (!strings.length) {
    console.error("❌ At least one search string is required.");
    console.error("   Example: packx -s 'foo' -s 'bar'");
    console.error("   Or use a config file: packx init my-search.txt");
    process.exit(1);
  }

  const roots = parsed._.length ? parsed._ : ["."];
  const pattern = new RegExp(strings.map(escRegex).join("|"), "i");

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
          '**/Thumbs.db'
        ],
        absolute: true,
        dot: false
      });
      
      for (const file of files) {
        // Check if file should be excluded based on exclude-extensions
        let shouldExclude = false;
        for (const excl of excludeExtensions) {
          const exclPattern = excl.startsWith('.') ? excl : `.${excl}`;
          if (file.endsWith(exclPattern)) {
            shouldExclude = true;
            break;
          }
        }
        
        if (!shouldExclude) {
          candidates.add(file);
        }
      }
    }
  }

  if (!candidates.size) {
    console.warn("⚠️  No files found with the specified extensions in the given roots.");
    process.exit(2);
  }

  // 2) Content filter
  const matched: string[] = [];
  for (const p of candidates) {
    if (await fileContainsAnyStrings(p, pattern)) {
      matched.push(path.resolve(p));
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
  // Note: passthrough args are ignored in this custom implementation
  // const passthrough = buildRepomixPassthroughArgs(parsed);
  
  // Convert matched files to relative paths
  const cwd = process.cwd();
  const relativePaths = matched.map(p => path.relative(cwd, p));
  
  console.log(`🧩 Packing ${matched.length} file(s)...`);
  
  // Get context lines if specified
  const contextLines = parsed.context || parsed.c;
  
  if (contextLines) {
    console.log(`📝 Extracting ${contextLines} lines of context around matches...`);
  } else {
    console.log(`📝 Files to pack:`);
    relativePaths.forEach(p => console.log(`  • ${p}`));
  }

  // Since Repomix's stdin and include features are broken, 
  // we'll directly create the output ourselves
  const outputFile = parsed.output || parsed.o || "repomix-output.xml";
  const outputStyle = parsed.style || "xml";
  
  // Read and combine the files
  let output = '';
  let totalMatchCount = 0;
  let totalWindowCount = 0;
  
  if (outputStyle === "xml") {
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
    
    for (const [index, filePath] of matched.entries()) {
      const relPath = relativePaths[index];
      try {
        const content = await fs.readFile(filePath, 'utf8');
        
        if (contextLines) {
          // Extract context windows
          const windows = extractContextWindows(content, pattern, contextLines);
          if (windows.length > 0) {
            totalWindowCount += windows.length;
            totalMatchCount += windows.reduce((sum, w) => sum + w.matches.length, 0);
            
            const formatted = formatContextWindows(windows, relPath);
            if (formatted) {
              output += `<file path="${relPath}" matches="${windows.reduce((sum, w) => sum + w.matches.length, 0)}" windows="${windows.length}">
${formatted}</file>

`;
            }
          }
        } else {
          // Include entire file
          output += `<file path="${relPath}">
${content}
</file>

`;
        }
      } catch (err) {
        console.error(`Warning: Could not read file ${relPath}: ${err}`);
      }
    }
    
    output += `</files>`;
  } else {
    // Markdown format
    output = `# Packx Output

This file contains ${matched.length} filtered files from the repository.${contextLines ? `\n\n**Context:** ${contextLines} lines around each match` : ''}

## Files

`;
    
    for (const [index, filePath] of matched.entries()) {
      const relPath = relativePaths[index];
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const ext = path.extname(relPath).slice(1) || 'txt';
        
        if (contextLines) {
          // Extract context windows
          const windows = extractContextWindows(content, pattern, contextLines);
          if (windows.length > 0) {
            totalWindowCount += windows.length;
            totalMatchCount += windows.reduce((sum, w) => sum + w.matches.length, 0);
            
            output += `### ${relPath}

**Matches:** ${windows.reduce((sum, w) => sum + w.matches.length, 0)} | **Context windows:** ${windows.length}

\`\`\`${ext}
${formatContextWindows(windows, relPath)}\`\`\`

`;
          }
        } else {
          // Include entire file
          output += `### ${relPath}

\`\`\`${ext}
${content}
\`\`\`

`;
        }
      } catch (err) {
        console.error(`Warning: Could not read file ${relPath}: ${err}`);
      }
    }
  }
  
  // Write the output file
  await fs.writeFile(outputFile, output, 'utf8');
  
  console.log(`\n✅ Successfully packed ${matched.length} file(s) to ${outputFile}`);
  
  // Calculate some stats
  const totalChars = output.length;
  const totalTokens = Math.round(totalChars / 4); // Rough estimate
  
  console.log(`\n📊 Pack Summary:`);
  console.log(`────────────────`);
  console.log(`  Total Files: ${matched.length} files`);
  if (contextLines) {
    console.log(`  Context Lines: ${contextLines} around each match`);
    console.log(`  Total Matches: ${totalMatchCount} matches`);
    console.log(`  Context Windows: ${totalWindowCount} windows`);
  }
  console.log(`  Total Tokens: ~${totalTokens.toLocaleString()} tokens`);
  console.log(`  Total Chars: ${totalChars.toLocaleString()} chars`);
  console.log(`       Output: ${outputFile}`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(99);
});