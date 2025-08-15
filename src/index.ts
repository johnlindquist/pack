#!/usr/bin/env bun
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
  pack -s "string1" -s "string2" -e "ts,tsx" [repomix options...]
  pack -f config.txt [repomix options...]

EXAMPLES
  # Search for multiple strings
  pack -s "setFlags" -s "flaggedValue" -s "currentFlag" -e "ts,tsx"
  
  # Multiple extension flags or comma-separated
  pack -s "useState" -e "ts" -e "tsx" -e "jsx"
  pack -s "useState" -e "ts,tsx,jsx"
  
  # Exclude .d.ts files while searching .ts files
  pack -s "useState" -e "ts,tsx" -x "d.ts"
  
  # Using a config file
  pack -f my-search.txt --compress -o output.xml
  
  # With repomix passthrough flags
  pack -s "foo" -s "bar" -e "ts,tsx" --compress -o output.xml --style xml
  
  # Search for strings with special characters
  pack -s "array[index]" -s "foo,bar" -s "hello world" -e "js"

OPTIONS (wrapper)
  -s, --strings           Search string (can be used multiple times)
  -e, --extensions        Extensions to include (multiple flags or comma-separated)
  -x, --exclude-extensions  Extensions to exclude (multiple flags or comma-separated)
  -f, --file              Read configuration from a file
      --preview           Only list matched files (no packing)
  -h, --help             Show this help
  -v, --version          Show version

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

async function main() {
  // Parse with aliases properly configured
  const parsed = mri(process.argv.slice(2), {
    alias: {
      s: "strings",
      e: "extensions",
      x: "exclude-extensions",
      f: "file",
      h: "help",
      v: "version"
    },
    string: ["strings", "s", "extensions", "e", "exclude-extensions", "x", "file", "f"],
    boolean: ["preview", "help", "h", "version", "v"]
  }) as Argv;

  if (parsed.help || parsed.h) {
    printHelp();
    process.exit(0);
  }
  if (parsed.version || parsed.v) {
    console.log("repomix-filter-pack v0.1.0");
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

  if (!strings.length || !extensions.size) {
    console.error("❌ Both --strings (-s) and --extensions (-e) are required.");
    console.error("   Example: pack -s 'foo' -s 'bar' -e 'ts,tsx'");
    process.exit(1);
  }

  const roots = parsed._.length ? parsed._ : ["."];
  const pattern = new RegExp(strings.map(escRegex).join("|"));

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

  // 3) Run Repomix with --stdin and forward any extra flags
  const passthrough = buildRepomixPassthroughArgs(parsed);
  const repomixCmd = await (async () => {
    // Prefer a local `repomix` binary if available on PATH, otherwise use `bunx -y repomix`
    const found = Bun.which("repomix");
    if (found) return ["repomix", ...passthrough, "--stdin"];
    return ["bunx", "-y", "repomix", ...passthrough, "--stdin"];
  })();

  console.log(`🧩 Running: ${repomixCmd.join(" ")}`);
  console.log(`   feeding ${matched.length} file(s) via --stdin ...`);

  const proc = Bun.spawn({
    cmd: repomixCmd,
    stdin: "pipe",
    stdout: "inherit",
    stderr: "inherit",
    cwd: process.cwd()
  });

  // Write newline-separated absolute paths to stdin
  const payload = matched.join("\n") + "\n";
  await proc.stdin!.write(payload);
  proc.stdin!.end();

  const code = await proc.exited;
  process.exit(code);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(99);
});