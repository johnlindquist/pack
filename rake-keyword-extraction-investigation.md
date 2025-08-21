# RAKE Keyword Extraction Investigation Report

## Issue Summary
The packx project attempted to integrate RAKE (Rapid Automatic Keyword Extraction) via the node-rake NPM package to enhance the "concept mode" feature with sophisticated keyword extraction from code files. However, RAKE consistently fails with "Maximum call stack size exceeded" errors when processing code content, forcing a fallback to basic frequency analysis.

## Investigation Findings

### Root Cause Analysis
1. **RAKE Algorithm Limitations with Code**: RAKE was designed for natural language text, not source code. Code has different characteristics:
   - High density of special characters and symbols
   - Nested structures and syntax patterns that may cause recursive processing issues
   - Programming keywords and identifiers that don't follow natural language patterns

2. **Stack Overflow Evidence**: Comments in `src/concept.ts` lines 47 and 64 explicitly mention:
   - "Limit content to prevent RAKE stack overflow" (maxContentLength = 50000)
   - "RAKE doesn't work well with code, so let's extract meaningful terms from the top files"
   - "Reduced from 20 to avoid stack overflow" (topResults slice)

3. **Current Workaround**: The implementation has fallen back to a custom frequency-based keyword extraction that:
   - Uses simple word frequency counting
   - Filters out code-specific stop words (const, let, var, function, etc.)
   - Looks for semantic relationships between search terms and discovered words
   - Limits content processing to prevent memory issues

### Affected Components
- **src/concept.ts**: Contains the disabled RAKE attempt and current workaround implementation
- **package.json**: Still has node-rake dependency but it's not actively used
- **package-lock.json**: Shows node-rake@1.0.1 is installed but marked as "extraneous"

### Current Implementation Limitations
The fallback approach has significant limitations:
- Basic frequency analysis misses semantic relationships
- Simple string matching for related terms (lines 106-114 in concept.ts)
- No understanding of code context or programming concepts
- Limited to exact matches and simple variations (removing 'ing', 'ed', 's')

## Relevant Files Included
- **src/concept.ts**: Core concept mode implementation with RAKE failure evidence and current workaround
- **src/index.ts**: Main entry point showing concept mode integration (lines 735-745)
- **package.json**: Dependencies showing node-rake inclusion
- **package-lock.json**: Dependency tree details
- **README.md**: Documentation explaining concept mode functionality and expectations

## Recommended Next Steps

### 1. Alternative Keyword Extraction Libraries
Investigate code-specific NLP libraries:
- **tree-sitter** + custom queries for semantic code analysis
- **@microsoft/tsdoc** for TypeScript-specific documentation parsing
- **esprima** or **@babel/parser** for JavaScript/TypeScript AST analysis
- **natural** library with custom preprocessing for code
- **compromise** NLP library with code-specific extensions

### 2. Custom Code-Aware Keyword Extraction
Develop a hybrid approach:
- AST parsing to identify meaningful identifiers, function names, class names
- Comment and docstring extraction for natural language processing
- Import/export analysis to find related modules
- Type annotation parsing for semantic understanding

### 3. Configuration and Performance Optimization
- Implement configurable content limits to prevent memory issues
- Add streaming/chunked processing for large codebases
- Create code-specific stop word lists and filters
- Add caching mechanisms for repeated concept searches

### 4. Validation and Testing
- Create test cases with known code patterns and expected keywords
- Benchmark different approaches against current frequency analysis
- Test with various programming languages and paradigms
- Measure performance impact and memory usage

### 5. Gradual Migration Strategy
- Keep current frequency analysis as fallback
- Implement new approach alongside existing one
- Add feature flags to switch between methods
- Compare results and gradually transition

## Token Optimization
- Original token count: 17,805
- Optimized token count: 5,053
- Reduction: 71.6%

---

This file is a merged representation of a subset of the codebase, containing specifically included files, combined into a single document by Repomix.
The content has been processed where comments have been removed, line numbers have been added, content has been compressed (code blocks are separated by ⋮---- delimiter).

# File Summary

## Purpose
This file contains a packed representation of a subset of the repository's contents that is considered the most important context.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Only files matching these patterns are included: src/concept.ts, src/index.ts, package.json, package-lock.json, README.md
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Code comments have been removed from supported file types
- Line numbers have been added to the beginning of each line
- Content has been compressed - code blocks are separated by ⋮---- delimiter
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
src/
  concept.ts
  index.ts
package.json
README.md
```

# Files

## File: src/concept.ts
````typescript
import MiniSearch from 'minisearch';
import { glob } from 'glob';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
⋮----
export async function runConceptMode(searchString: string)
⋮----
const maxContentLength = 50000; // Limit content to prevent RAKE stack overflow
⋮----
// Take only first part of each file to avoid too much content
⋮----
// Combine original search terms with discovered related words
⋮----
// Run packx with keywords
````

## File: README.md
````markdown
# Packx - Smart File Filter and Bundler

[![npm version](https://badge.fury.io/js/packx.svg)](https://www.npmjs.com/package/packx)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Packx is a powerful CLI tool that filters repository files by content and extension before bundling them for AI consumption. Search for specific strings in your codebase and bundle only the files that match - perfect for providing focused context to LLMs.

```bash
# Quick install
npm install -g packx

# Create a config template
packx init

# Search and bundle
packx -s "useState" -e "tsx" -o react-hooks.md
```

## Features

- 🔍 **Content-based filtering** - Only include files containing specific strings
- 📁 **Smart defaults** - Searches common code files automatically (no extension flag needed!)
- 🎨 **Flexible extensions** - Optionally filter by specific file types
- 🔧 **Config files** - Save and reuse search patterns
- ✂️ **Context lines** - Limit output to N lines around each match for focused results
- ⚡ **Fast** - Direct file processing without external dependencies
- 🎯 **Precise** - Search for multiple strings with special character support
- 📊 **Smart merging** - Overlapping context windows are automatically merged

## Installation

### Option 1: Install from npm (Recommended)

Works on Mac, Windows, and Linux with Node.js 18+:

```bash
# Install globally
npm install -g packx

# Or with yarn
yarn global add packx

# Or with pnpm
pnpm add -g packx

# Now use it anywhere
packx --help
pack --help  # Also available as 'pack'
```

### Option 2: Build from Source

Prerequisites:
- [Bun](https://bun.sh) (for building)
- [Repomix](https://github.com/yamadashy/repomix) (installed automatically)

```bash
# Clone the repository
git clone https://github.com/johnlindquist/pack.git
cd pack

# Install dependencies
bun install

# Build the executable
bun run compile

# Test it works
./bin/pack --help
```

### Local Installation Options (for source builds)

#### Option 1: Add the bin directory to PATH

```bash
# Add to ~/.zshrc or ~/.bashrc
echo 'export PATH="$HOME/dev/pack/bin:$PATH"' >> ~/.zshrc

# Reload shell configuration
source ~/.zshrc

# Now you can use pack from anywhere
pack --help
```

#### Option 2: Global link with Bun

```bash
# Create global link
bun link

# Use from anywhere
pack --help
```

#### Option 3: Copy to system bin

```bash
# Copy to local bin (create if doesn't exist)
mkdir -p ~/.local/bin
cp bin/pack ~/.local/bin/

# Make sure ~/.local/bin is in your PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

## Usage

### Quick Start

```bash
# Create a search config
packx init my-search.txt

# Edit it with your patterns
nano my-search.txt

# Run the search
packx -f my-search.txt -o results.md
```

### Basic Usage

Search for strings across all common code files (default):

```bash
packx -s "TODO" -s "FIXME"
```

Search in specific file types:

```bash
packx -s "useState" -s "useEffect" -e "ts,tsx"
```

### Concept Mode

Automatically discover and extract related concepts from your codebase:

```bash
# Find error handling patterns
packx concept "error handling"
# → Discovers: error, handling, handle, errors, handler

# Explore state management code
packx concept "state management"  
# → Discovers: state, management, setState, stateManager, kitstate

# Find all testing code
packx concept "testing"
# → Discovers: testing, test, tests, tested, tester
```

#### How Concept Mode Works

1. **Indexes your codebase** - Uses MiniSearch to build a full-text search index
2. **Ranks files by relevance** - Finds files most related to your search terms
3. **Extracts related keywords** - Analyzes top files to find frequently used related terms
4. **Runs intelligent search** - Automatically executes packx with discovered keywords

#### Real-World Use Cases

**🔍 Finding Error Handling Patterns**
```bash
packx concept "error handling"
```
This will find not just files with "error" and "handling", but also:
- Files with `handleError`, `errorHandler`, `handleException`
- Error boundary components
- Try-catch blocks and error logging utilities

**🏗️ Exploring Architecture Patterns**
```bash
packx concept "dependency injection"
```
Discovers related patterns like:
- `inject`, `injector`, `dependencies`, `provider`, `container`

**🧪 Gathering Test Files**
```bash
packx concept "unit test"
```
Finds all testing-related code:
- Files with `test`, `tests`, `testing`, `spec`, `describe`, `it`
- Test utilities and helpers
- Mock and stub implementations

#### When to Use Concept Mode

✅ **Use concept mode when:**
- You want to explore a topic but don't know all the exact terms
- You need to find related code patterns and implementations
- You're learning a new codebase and want to understand conventions
- You need comprehensive coverage of a concept

❌ **Use regular search when:**
- You know the exact strings you're looking for
- You need precise, targeted results
- You want to exclude certain variations

### Context Lines

Extract only the surrounding context instead of entire files:

```bash
# Show 10 lines around each TODO comment
packx -s "TODO" -l 10 -o todos.md

# Get focused context for debugging
packx -s "error" -s "exception" -l 50 --style markdown

# Minimal context for quick review
packx -s "FIXME" -l 3
```

### Preview Mode

See which files match before bundling:

```bash
pack -s "console.log" -e "js,ts" --preview
```

### Exclude Files

Exclude TypeScript declaration files:

```bash
pack -s "interface" -e "ts" -x "d.ts"
```

### With Repomix Options

All Repomix flags work seamlessly:

```bash
pack -s "TODO" -s "FIXME" -e "ts,tsx" \
  --compress \
  --style xml \
  -o todos.xml \
  --remove-comments
```

## Examples

### Find React Hooks

```bash
pack -s "useState" -s "useEffect" -s "useCallback" \
     -e "tsx,jsx" \
     -x "test.tsx,spec.tsx" \
     -o react-hooks.md
```

### Search with Special Characters

Strings can contain any characters including commas, brackets, and spaces:

```bash
pack -s "array[index]" -s "foo,bar" -s "hello world" -e "js"
```

### Multiple Extension Formats

Use multiple flags or comma-separated values:

```bash
# Multiple flags
pack -s "import" -e "ts" -e "tsx" -e "jsx"

# Comma-separated
pack -s "import" -e "ts,tsx,jsx"

# Mixed
pack -s "import" -e "ts,tsx" -e "jsx,js"
```

## Config Files

Save your search patterns in reusable config files.

### Quick Start with Config Files

```bash
# Create a config file template (creates pack-config.txt)
packx init

# Or specify a custom filename
packx init my-search.txt
packx init focused-flag.txt
packx init api-endpoints.config

# Edit the created file
nano pack-config.txt

# Use the config file
packx -f pack-config.txt
```

### Config File Format

The config file uses a simple INI-like format:

```ini
# Comments start with #

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
```

### Using Config Files

```bash
# Use config file
pack -f my-search.txt

# Combine with CLI arguments
pack -f my-search.txt -s "extraSearch" -o output.xml

# With Repomix options
pack -f my-search.txt --compress --style markdown
```

### Example Config Files

**console-logs.txt** - Find all console statements:
```ini
[search]
console.log
console.error
console.warn
console.debug

[extensions]
js
ts
jsx
tsx

[exclude]
node_modules
dist
build
```

**api-calls.txt** - Find API and network calls:
```ini
[search]
fetch(
axios
$.ajax
XMLHttpRequest
/api/
endpoint
apiKey

[extensions]
ts
tsx
js
jsx

[exclude]
test.
spec.
mock.
```

**react-hooks.txt** - Find React hooks:
```ini
[search]
useState
useEffect
useCallback
useMemo
useRef
useContext

[extensions]
tsx
jsx

[exclude]
d.ts
test.tsx
__tests__
```

## CLI Options

### Pack Options

| Option | Short | Description |
|--------|-------|-------------|
| `--strings` | `-s` | Search string (use multiple times) **[required]** |
| `--extensions` | `-e` | Extensions to include (optional, defaults to common code files) |
| `--exclude-extensions` | `-x` | Extensions to exclude (multiple or comma-separated) |
| `--file` | `-f` | Read configuration from file |
| `--lines` | `-l` | Number of lines around each match (default: entire file) |
| `--preview` | | Preview matched files without packing |
| `--help` | `-h` | Show help |
| `--version` | `-v` | Show version |

### Default Extensions

When no `-e` flag is specified, packx searches these file types:

- **Languages**: js, jsx, ts, tsx, mjs, cjs, py, rb, go, java, cpp, c, h, rs, swift, kt, scala, php
- **Web Frameworks**: vue, svelte, astro
- **Styles**: css, scss, less
- **Config**: json, yaml, yml, toml, xml
- **Documentation**: md, mdx, txt
- **Scripts**: sh, bash, zsh, fish
- **Data**: sql, graphql, gql

### Repomix Pass-through Options

All Repomix options work as normal:

- `--compress` - Compress output
- `--style <type>` - Output style (xml, markdown, plain)
- `-o <file>` - Output filename
- `--remove-comments` - Remove comments from code
- `--token-count-tree` - Show token counts
- And many more...

## Build from Source

```bash
# Clone repository
git clone https://github.com/johnlindquist/pack.git
cd pack

# Install dependencies
bun install

# Build for current platform
bun run compile

# Build for specific platforms
bun run compile:macos     # Intel Mac
bun run compile:macos-arm  # Apple Silicon
bun run compile:linux      # Linux x64
bun run compile:linux-arm  # Linux ARM64
bun run compile:windows    # Windows x64

# Build for all platforms
bun run compile:all
```

## Use Cases

### 1. Focused Debugging Context

Extract just the error handling code for AI analysis:

```bash
packx -s "catch" -s "error" -s "exception" \
      -l 20 \
      -o error-handling.md \
      --style markdown
```

### 2. Code Review Preparation

Bundle only files containing specific feature flags:

```bash
packx -s "FEATURE_FLAG_NEW_UI" -s "experimentalFeature" \
      -e "ts,tsx" \
      -o feature-review.md \
      --style markdown
```

### 3. Security Audit

Find all files with potential security concerns:

```bash
pack -s "apiKey" -s "secret" -s "password" -s "token" \
     -e "js,ts,env,json" \
     -x "test.js,spec.js" \
     -o security-audit.xml
```

### 4. Migration Planning

Identify files using deprecated APIs:

```bash
pack -s "componentWillMount" -s "componentWillReceiveProps" \
     -e "jsx,tsx" \
     -o deprecated-apis.md
```

### 5. Documentation Generation

Extract all files with TODO comments:

```bash
pack -s "TODO" -s "FIXME" -s "HACK" -s "XXX" \
     -e "ts,tsx,js,jsx" \
     --remove-comments false \
     -o todos.md
```

## Tips

1. **Use preview mode** (`--preview`) to verify matches before generating output
2. **Combine config files with CLI args** for maximum flexibility
3. **Store common patterns** in config files for team sharing
4. **Use exclude patterns** to skip test and build files
5. **Special characters** in search strings work perfectly (no escaping needed)

## Troubleshooting

### Command not found

Make sure the bin directory is in your PATH:

```bash
echo $PATH | grep -q "pack/bin" && echo "✓ In PATH" || echo "✗ Not in PATH"
```

### No files matched

- Check your search strings are exact (case-sensitive)
- Verify extensions don't have extra dots (use `ts` not `.ts`)
- Use `--preview` to debug which files are being checked

### Large repositories

For very large repos, narrow the search scope:

```bash
# Search only in specific directories
pack -s "useState" -e "tsx" src/components src/hooks
```

## Contributing

Pull requests are welcome! Feel free to:

- Add new features
- Improve documentation
- Report bugs
- Suggest enhancements

## License

MIT

## Credits

Built on top of the excellent [Repomix](https://github.com/yamadashy/repomix) by @yamadashy.
````

## File: src/index.ts
````typescript
import mri from "mri";
import { promises as fs } from "node:fs";
⋮----
import { glob } from "glob";
⋮----
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
⋮----
function printHelp()
⋮----
function parseCSV(input?: string): string[]
⋮----
function toExtSet(exts: string[]): Set<string>
⋮----
function escRegex(lit: string): string
⋮----
type MatchPosition = {
  line: number;
  column: number;
  match: string;
};
⋮----
type ContextWindow = {
  startLine: number;
  endLine: number;
  lines: string[];
  matches: MatchPosition[];
};
⋮----
function findAllMatches(content: string, pattern: RegExp): MatchPosition[]
⋮----
function extractContextWindows(
  content: string,
  pattern: RegExp,
  contextLines: number
): ContextWindow[]
⋮----
function formatContextWindows(windows: ContextWindow[], filePath: string): string
⋮----
// Add separator between windows
⋮----
async function fileContainsAnyStrings(absPath: string, pattern: RegExp, excludePattern?: RegExp | null): Promise<boolean>
⋮----
function buildRepomixPassthroughArgs(parsed: Argv): string[]
⋮----
function normalizeStrings(value: string | string[] | undefined): string[]
⋮----
async function parseConfigFile(filePath: string): Promise<
⋮----
async function createConfigTemplate(filename: string = 'pack-config.ini')
⋮----
// Directory doesn't exist, prompt user
⋮----
async function main()
⋮----
// Extract context windows
⋮----
// Include entire file
⋮----
// Track file size for summary
⋮----
// Markdown format
⋮----
// Extract context windows
⋮----
// Include entire file
⋮----
// Track file size for summary
⋮----
// Write the output file
````

## File: package.json
````json
{
  "name": "packx",
  "version": "3.0.0",
  "description": "Smart file filter for Repomix - search and bundle only files containing specific strings",
  "license": "MIT",
  "type": "module",
  "author": "John Lindquist",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/johnlindquist/pack.git"
  },
  "bugs": {
    "url": "https://github.com/johnlindquist/pack/issues"
  },
  "homepage": "https://github.com/johnlindquist/pack#readme",
  "keywords": [
    "repomix",
    "filter",
    "search",
    "bundle",
    "pack",
    "ai",
    "llm",
    "code"
  ],
  "bin": {
    "packx": "dist/index.js",
    "pack": "dist/index.js"
  },
  "scripts": {
    "build": "bun build ./src/index.ts --outdir dist --target node --format esm",
    "dev": "bun run ./src/index.ts --help",
    "dev:concept": "bun run ./src/index.ts concept",
    "prepublishOnly": "npm run build && npm run update-version-in-code",
    "update-version-in-code": "node scripts/update-version.js",
    "release:patch": "npm version patch && npm publish && git push && git push --tags",
    "release:minor": "npm version minor && npm publish && git push && git push --tags",
    "release:major": "npm version major && npm publish && git push && git push --tags",
    "compile": "bun build ./src/index.ts --compile --outfile bin/pack",
    "compile:all": "npm run compile:macos && npm run compile:linux && npm run compile:windows",
    "compile:macos": "bun build ./src/index.ts --compile --target bun-darwin-x64 --outfile bin/pack-macos-x64",
    "compile:macos-arm": "bun build ./src/index.ts --compile --target bun-darwin-arm64 --outfile bin/pack-macos-arm64",
    "compile:linux": "bun build ./src/index.ts --compile --target bun-linux-x64 --outfile bin/pack-linux-x64",
    "compile:linux-arm": "bun build ./src/index.ts --compile --target bun-linux-arm64 --outfile bin/pack-linux-arm64",
    "compile:windows": "bun build ./src/index.ts --compile --target bun-windows-x64 --outfile bin/pack-windows-x64.exe"
  },
  "dependencies": {
    "glob": "^10.3.10",
    "minisearch": "^7.1.2",
    "mri": "^1.2.0",
    "repomix": "^1.2.1"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0"
  },
  "engines": {
    "bun": ">=1.1.0"
  }
}
````
