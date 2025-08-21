This file is a merged representation of the entire codebase, combined into a single document by Repomix.

# File Summary

## Purpose
This file contains a packed representation of the entire repository's contents.
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
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
.claude/
  settings.local.json
scripts/
  update-version.js
src/
  concept.ts
  index.ts
.gitignore
.npmignore
api-calls.txt
example-search.txt
index.ts
package.json
PUBLISHING.md
react-hooks.txt
README.md
TESTING.md
tsconfig.json
```

# Files

## File: src/concept.ts
````typescript
#!/usr/bin/env node
import MiniSearch from 'minisearch';
import { glob } from 'glob';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

export async function runConceptMode(searchString: string) {
  console.log(`Extracting concepts related to: "${searchString}"`);
  
  // Discover files (common code extensions)
  const extensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'cpp', 'c', 'go', 'rs'];
  const pattern = `**/*.{${extensions.join(',')}}`;
  const files = await glob(pattern, {
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/build/**', '**/.next/**']
  });
  
  console.log(`Found ${files.length} files to index`);
  
  // Build lexical index
  const miniSearch = new MiniSearch({
    fields: ['content'],
    storeFields: ['path']
  });
  
  const documents = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    documents.push({
      id: file,
      path: file,
      content
    });
  }
  
  miniSearch.addAll(documents);
  
  // Search and rank
  const results = miniSearch.search(searchString, {
    boost: { content: 2 },
    fuzzy: 0.2
  });
  
  // Extract top content
  const topResults = results.slice(0, 10); // Reduced from 20 to avoid stack overflow
  let combinedContent = '';
  const maxContentLength = 50000; // Limit content to prevent RAKE stack overflow
  
  for (const result of topResults) {
    const doc = documents.find(d => d.id === result.id);
    if (doc) {
      // Take only first part of each file to avoid too much content
      const snippet = doc.content.slice(0, 5000);
      combinedContent += snippet + '\n';
      
      if (combinedContent.length > maxContentLength) {
        combinedContent = combinedContent.slice(0, maxContentLength);
        break;
      }
    }
  }
  
  // Extract keywords using a simpler approach
  // RAKE doesn't work well with code, so let's extract meaningful terms from the top files
  let topKeywords: string[] = [];
  
  // First, use the original search terms
  const searchTerms = searchString.toLowerCase().split(' ').filter(w => w.length > 2);
  
  // Extract frequently occurring words from top results
  const wordFrequency = new Map<string, number>();
  
  // Common code words to ignore
  const stopWords = new Set(['const', 'let', 'var', 'function', 'return', 'import', 
    'export', 'from', 'class', 'new', 'this', 'that', 'with', 'for', 'while', 
    'if', 'else', 'switch', 'case', 'break', 'continue', 'try', 'catch', 
    'finally', 'throw', 'async', 'await', 'typeof', 'instanceof', 'void',
    'null', 'undefined', 'true', 'false', 'and', 'or', 'not', 'the', 'is',
    'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall']);
  
  // Process content to find relevant keywords
  const words = combinedContent
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')  // Keep only alphanumeric
    .split(/\s+/)
    .filter(word => 
      word.length > 3 && 
      word.length < 20 && 
      !stopWords.has(word) &&
      !word.match(/^\d+$/)  // Not just numbers
    );
  
  // Count word frequency
  for (const word of words) {
    wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
  }
  
  // Get top frequent words that are semantically related to search terms
  const sortedWords = Array.from(wordFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)  // Top 50 most frequent
    .map(([word]) => word);
  
  // Find words related to search terms (contain or are contained by search terms)
  const relatedWords = sortedWords.filter(word => {
    return searchTerms.some(term => 
      word.includes(term) || term.includes(word) || 
      // Also check for common variations
      word.includes(term.replace('ing', '')) ||
      word.includes(term.replace('ed', '')) ||
      word.includes(term.replace('s', ''))
    );
  }).slice(0, 5);
  
  // Combine original search terms with discovered related words
  topKeywords = [...new Set([...searchTerms, ...relatedWords])].slice(0, 10);
  
  if (topKeywords.length === 0) {
    console.log('No keywords extracted. Using original search terms.');
    topKeywords = searchString.split(' ').filter(w => w.length > 0);
  }
  
  console.log('Extracted keywords:', topKeywords.join(', '));
  
  // Run packx with keywords
  const packxArgs = [
    ...topKeywords.flatMap(k => ['-s', k])
  ];
  
  console.log(`Running: packx ${packxArgs.join(' ')}`);
  
  const packx = spawn('packx', packxArgs, {
    stdio: 'inherit',
    shell: true
  });
  
  packx.on('close', (code) => {
    process.exit(code || 0);
  });
}
````

## File: TESTING.md
````markdown
# Testing Guide for Packx

## Manual Testing Checklist

### Basic Functionality
- [ ] `packx --help` displays help
- [ ] `packx --version` shows version
- [ ] `packx init` creates default config
- [ ] `packx init my-config` creates named config

### Search Modes
- [ ] `-s "string"` single search works
- [ ] `-s "string1" -s "string2"` multiple searches work
- [ ] `-f config.ini` config file works
- [ ] Case-insensitive search by default
- [ ] `-C` flag enables case-sensitive search

### Concept Mode
- [ ] `packx concept "search terms"` runs without error
- [ ] Concept mode finds relevant files
- [ ] Concept mode extracts keywords
- [ ] Concept mode runs packx with extracted keywords

### Context Lines
- [ ] `-l 10` limits to 10 lines around matches
- [ ] Context windows merge when overlapping
- [ ] Line numbers display correctly

### Extensions
- [ ] Default (no `-e`) searches common code files
- [ ] `-e "ts,tsx"` filters by extensions
- [ ] `-x "d.ts"` excludes extensions

### Exclude Patterns
- [ ] Config file `[exclude]` section works
- [ ] Gitignore-style patterns work
- [ ] Directory exclusions work (`docs/`)
- [ ] Glob patterns work (`**/*.test.ts`)

### Output
- [ ] Default output to `packx-output.md`
- [ ] `-o custom.md` custom output works
- [ ] `--copy` copies to clipboard
- [ ] Summary statistics display correctly
- [ ] Top 10 files by size display
- [ ] Extensions list displays

## Test Commands

```bash
# Basic search
packx -s "TODO"

# Multiple strings
packx -s "console" -s "log" -e "js,ts"

# Context lines
packx -s "error" -l 20

# Case sensitive
packx -s "API" -C

# Exclude strings
packx -s "function" -S "test" -S "spec"

# Config file
echo "[search]
TODO
FIXME
[extensions]
ts
tsx
[exclude]
*.test.ts
docs/" > test.ini
packx -f test.ini

# Concept mode
packx concept "authentication user login"

# Preview mode
packx -s "import" --preview

# Copy to clipboard
packx -s "export" --copy
```

## Edge Cases to Test

1. **Empty results** - Search with no matches
2. **Large files** - Files over 10MB are skipped
3. **Binary files** - Should be ignored
4. **Special characters** - Search for `[`, `]`, `(`, `)`, etc.
5. **Unicode** - Search for emoji or non-ASCII
6. **Symlinks** - Should follow or ignore?
7. **Hidden files** - `.gitignore`, `.env`, etc.
8. **No extension files** - `Makefile`, `Dockerfile`

## Performance Testing

```bash
# Time a search in a large repo
time packx -s "function" -e "js,ts,tsx,jsx"

# Memory usage (use system monitor)
packx -s "class" -s "interface" -s "type" -e "ts"
```

## Regression Tests

After changes, verify:
1. Existing config files still work
2. CLI flag compatibility maintained
3. Output format unchanged
4. Repomix passthrough still works (if applicable)
````

## File: .claude/settings.local.json
````json
{
  "permissions": {
    "additionalDirectories": [
      "/Users/johnlindquist/dev/kit-container"
    ]
  }
}
````

## File: scripts/update-version.js
````javascript
#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Read package.json to get current version
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;

// Update version in src/index.ts
const indexPath = join(rootDir, 'src', 'index.ts');
let indexContent = readFileSync(indexPath, 'utf8');

// Replace version in console.log statement
indexContent = indexContent.replace(
  /console\.log\("packx v[\d.]+"\);/,
  `console.log("packx v${version}");`
);

writeFileSync(indexPath, indexContent);

console.log(`✅ Updated version to ${version} in source code`);
````

## File: .npmignore
````
# Source files (we ship dist/)
src/
*.ts
!*.d.ts

# Config files
tsconfig.json
.gitignore

# Binary files (too large for npm)
bin/

# Example files
*.txt
!README.md

# Development files
node_modules/
bun.lock
bun.lockb
.git/
.github/

# Build files
*.log
.DS_Store

# Test files
test/
*.test.*
*.spec.*

# Editor
.vscode/
.idea/

# Temporary
tmp/
temp/
````

## File: api-calls.txt
````
# Find API calls and network requests

[search]
fetch(
axios
$.ajax
XMLHttpRequest
api/
/api/
graphql
REST
endpoint
apiKey
API_KEY
bearer
Authorization:

[extensions]
ts
tsx
js
jsx
vue
svelte

[exclude]
# Skip tests and mocks
test.
spec.
mock.
__mocks__
__tests__
.test.
.spec.
# Skip configs and docs
config.
.config.
README
.md
# Skip build artifacts
.min.
dist/
build/
````

## File: example-search.txt
````
# Example search configuration for pack
# This searches for console logging statements

[search]
console.log
console.error
console.warn
console.debug
console.info

[extensions]
ts
tsx
js
jsx

[exclude]
# Exclude type definition files
d.ts
# Exclude test files
test.ts
spec.ts
test.js
spec.js
````

## File: index.ts
````typescript
console.log("Hello via Bun!");
````

## File: PUBLISHING.md
````markdown
# Publishing Guide

## NPM Package (`packx`)

The package is published to npm as `packx` and can be installed globally:

```bash
npm install -g packx
```

## Automated Release Process

We use npm scripts to automate versioning, building, and publishing:

### Quick Release Commands

```bash
# For bug fixes (1.0.0 -> 1.0.1)
npm run release:patch

# For new features (1.0.0 -> 1.1.0)
npm run release:minor

# For breaking changes (1.0.0 -> 2.0.0)
npm run release:major
```

These commands will automatically:
1. Bump the version in `package.json`
2. Update the version in source code
3. Build the distribution files
4. Publish to npm
5. Push changes to GitHub
6. Create and push git tags

### Manual Process (if needed)

1. **Update version**
   ```bash
   npm version patch  # or minor/major
   ```

2. **Build and publish**
   ```bash
   npm publish
   ```

3. **Push to GitHub**
   ```bash
   git push && git push --tags
   ```

## Pre-release Checklist

- [ ] All tests pass
- [ ] README is up to date
- [ ] CHANGELOG is updated (if maintaining one)
- [ ] No sensitive information in code
- [ ] Version number makes sense

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.0.0 -> 2.0.0): Breaking changes
- **MINOR** (1.0.0 -> 1.1.0): New features, backwards compatible
- **PATCH** (1.0.0 -> 1.0.1): Bug fixes, backwards compatible

## What Gets Published

The `.npmignore` file controls what's included in the npm package:

### Included
- `dist/` - Compiled JavaScript
- `package.json` - Package metadata
- `README.md` - Documentation

### Excluded
- Source TypeScript files
- Config files
- Binary builds
- Example files
- Development dependencies

## Troubleshooting

### "Cannot publish over previously published version"

This means the version already exists on npm. Bump the version:

```bash
npm version patch
npm publish
```

### Build Issues

Make sure to build before publishing:

```bash
npm run build
npm publish
```

### Authentication Issues

Login to npm if needed:

```bash
npm login
```

## Platform Compatibility

The npm package works on:
- ✅ macOS (Intel & Apple Silicon)
- ✅ Linux (x64 & ARM)
- ✅ Windows (with Node.js)

Requirements:
- Node.js 18 or higher
- npm, yarn, or pnpm

## Binary Builds

For standalone executables (without Node.js), use:

```bash
# Current platform
npm run compile

# Specific platforms
npm run compile:macos
npm run compile:macos-arm
npm run compile:linux
npm run compile:windows

# All platforms
npm run compile:all
```

Binary files are in the `bin/` directory but are NOT published to npm (too large).
````

## File: react-hooks.txt
````
# Search for React hooks usage

[search]
useState
useEffect
useCallback
useMemo
useRef
useContext
useReducer
useLayoutEffect

[extensions]
tsx
jsx
ts
js

[exclude]
# Skip declaration files
d.ts
# Skip test files  
test.tsx
spec.tsx
test.jsx
spec.jsx
__tests__
# Skip build output
.min.js
````

## File: tsconfig.json
````json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node", "bun"],
    "outDir": "dist"
  },
  "include": ["src"]
}
````

## File: .gitignore
````
# Dependencies
node_modules/

# Build outputs
dist/
build/

# Bun
bun.lockb

# macOS
.DS_Store

# Editor directories and files
.idea
.vscode
*.swp
*.swo
*~

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.*.local

# Test coverage
coverage/
.nyc_output/

# Temporary files
tmp/
temp/
*.tmp

# Output files from pack (examples)
*.xml
output.*
repomix-output.*
# Keep documentation
!README.md
!PUBLISHING.md
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
  packx concept "search terms"                Discover related concepts and bundle
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

🧠 CONCEPT DISCOVERY
  packx concept "error handling"
  
  Discovers related terms like: error, handling, handle, handleError, errorHandler
  Perfect for exploring topics when you don't know all the exact terms.

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
  -s, --strings STRING        Search string (use multiple times) [required]
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

async function fileContainsAnyStrings(absPath: string, pattern: RegExp, excludePattern?: RegExp | null): Promise<boolean> {
  try {
    const stat = await fs.stat(absPath);
    // Skip extremely large files (> 10MB) as a guard (Repomix ignores most binaries anyway)
    if (stat.size > 10 * 1024 * 1024) return false;

    const buf = await fs.readFile(absPath, "utf8");
    
    // First check if file contains excluded strings
    if (excludePattern && excludePattern.test(buf)) {
      return false;
    }
    
    // Then check if file contains required strings
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
    "exclude-strings",
    "extensions",
    "exclude-extensions",
    "file",
    "lines",
    "case-sensitive",
    "s",
    "S",
    "e",
    "x",
    "f",
    "l",
    "C",
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
  // Check for concept command first
  if (process.argv[2] === 'concept') {
    const searchString = process.argv.slice(3).join(' ') || '';
    if (!searchString) {
      console.error('❌ Please provide a search string for concept mode');
      console.error('Usage: packx concept <search string>');
      process.exit(1);
    }
    const { runConceptMode } = await import('./concept.js');
    await runConceptMode(searchString);
    return; // Let concept mode handle exit
  }

  // Check for init command
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
    string: ["strings", "s", "exclude-strings", "S", "extensions", "e", "exclude-extensions", "x", "file", "f"],
    boolean: ["case-sensitive", "C", "preview", "help", "h", "version", "v"]
  }) as Argv;

  if (parsed.help || parsed.h) {
    printHelp();
    process.exit(0);
  }
  if (parsed.version || parsed.v) {
    console.log("packx v3.0.0");
    process.exit(0);
  }

  let strings: string[] = [];
  let excludeStrings: string[] = [];
  let extensions: Set<string>;
  let excludePatterns: string[] = [];
  const caseSensitive = parsed["case-sensitive"] || parsed.C || false;

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

  if (!strings.length) {
    console.error("❌ At least one search string is required.");
    console.error("   Example: packx -s 'foo' -s 'bar'");
    console.error("   Or use a config file: packx init my-search.txt");
    process.exit(1);
  }

  const roots = parsed._.length ? parsed._ : ["."];
  const regexFlags = caseSensitive ? "" : "i";
  const pattern = new RegExp(strings.map(escRegex).join("|"), regexFlags);
  const excludePattern = excludeStrings.length > 0 
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
        // All filtering is now done via glob ignore patterns
        candidates.add(file);
      }
    }
  }

  if (!candidates.size) {
    console.warn("⚠️  No files found with the specified extensions in the given roots.");
    process.exit(2);
  }

  // 2) Content filter
  const matched: string[] = [];
  const foundExtensions = new Set<string>();
  
  for (const p of candidates) {
    if (await fileContainsAnyStrings(p, pattern, excludePattern)) {
      const resolvedPath = path.resolve(p);
      matched.push(resolvedPath);
      
      // Track the extension
      const ext = path.extname(resolvedPath).toLowerCase();
      if (ext) {
        foundExtensions.add(ext);
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
  
  console.log(`🧩 Packing ${matched.length} file(s)...`);
  
  // Get context lines if specified
  const contextLines = parsed.lines || parsed.l;
  
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
  const fileSizes: { path: string; size: number; tokens: number }[] = [];
  
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
        
        let fileOutput = '';
        if (contextLines) {
          // Extract context windows
          const windows = extractContextWindows(content, pattern, contextLines);
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
          output += fileOutput;
          // Track file size for summary
          const fileSize = fileOutput.length;
          const fileTokens = Math.round(fileSize / 4);
          fileSizes.push({ path: relPath, size: fileSize, tokens: fileTokens });
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
        
        let fileOutput = '';
        if (contextLines) {
          // Extract context windows
          const windows = extractContextWindows(content, pattern, contextLines);
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
          output += fileOutput;
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
  
  // Write the output file
  await fs.writeFile(outputFile, output, 'utf8');
  
  console.log(`\n✅ Successfully packed ${matched.length} file(s) to ${outputFile}`);
  
  // Handle passthrough args like --copy
  if (parsed.copy || parsed.c) {
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
  
  // Show found extensions
  if (foundExtensions.size > 0) {
    const sortedExtensions = Array.from(foundExtensions).sort();
    console.log(`\n📁 Extensions Found:`);
    console.log(`────────────────────`);
    console.log(`  ${sortedExtensions.join(', ')}`);
  }
  
  // Show top files by size
  if (fileSizes.length > 0) {
    const topFiles = fileSizes
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 10);
    
    console.log(`\n📂 Top 10 Files (by tokens):`);
    console.log(`──────────────────────────`);
    for (const file of topFiles) {
      const fileName = path.basename(file.path);
      const dirName = path.dirname(file.path);
      const shortPath = dirName === '.' ? fileName : `${dirName}/${fileName}`;
      console.log(`  ${file.tokens.toLocaleString().padStart(8)} tokens - ${shortPath}`);
    }
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(99);
});
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
