# Packx - Smart File Filter and Bundler

[![npm version](https://badge.fury.io/js/packx.svg)](https://www.npmjs.com/package/packx)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Packx is a powerful CLI tool that filters repository files by content and extension before bundling them for AI consumption. Search for specific strings in your codebase and bundle only the files that match - perfect for providing focused context to LLMs.

```bash
# Quick install
npm install -g packx

# Search and bundle
packx -s "useState" -e "tsx" -o react-hooks.md

# Interactive mode with file selection
packx -s "error" -I
```

## Features

- 🔍 **Content-based filtering** - Only include files containing specific strings
- 📁 **Smart defaults** - Searches common code files automatically (no extension flag needed!)
- 🎨 **Flexible extensions** - Optionally filter by specific file types
- 🚫 **Packignore support** - Use `.packignore` to exclude files (gitignore syntax)
- ✂️ **Context lines** - Limit output to N lines around each match for focused results
- ⚡ **High-performance** - Optional ripgrep integration for blazing fast searches
- 🎯 **Precise** - Search for multiple strings with special character support
- 📊 **Smart merging** - Overlapping context windows are automatically merged
- 🧠 **AST-aware** - Accurate comment stripping using tree-sitter parsing
- 💾 **Caching** - SHA-256 based file caching for faster iterative runs
- 📦 **Token splitting** - Automatically split large outputs into chunks
- 👁️ **Interactive mode** - File selection with live preview pane
- 👀 **Watch mode** - Auto-update output when files change
- 🔗 **Import following** - Automatically include imported dependencies

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
# Search for strings and output to file
packx -s "useState" -s "useEffect" -e "tsx" -o hooks.md

# Interactive mode - select files visually
packx -s "error" -I

# Copy output to clipboard
packx -s "TODO" -c
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

## .packignore

Exclude files from being included using `.packignore` (uses gitignore syntax).

### Creating a .packignore

Create a `.packignore` file in your project root:

```gitignore
# Exclude test files
*.test.ts
*.spec.ts
**/__tests__/**

# Exclude generated files
dist/
build/
*.generated.ts

# Exclude specific files
src/legacy/**
```

### Using .packignore

The `.packignore` file is automatically loaded and applied:

```bash
# Files matching .packignore patterns are excluded
packx -s "useState" -e "tsx"
```

### Ignoring .packignore

Use `--no-packignore` to disable the `.packignore` file:

```bash
# Include all files, ignoring .packignore
packx -s "error" --no-packignore
```

### Interactive Mode and .packignore

In interactive mode (`-I`), files matching `.packignore` are shown but start unselected. You can manually select them if needed:

```bash
# Files matching .packignore appear unselected
packx -s "TODO" -I
```

After selection, you can save your unselected files to `.packignore`.

### Output to stdout

Use `--stdout` to write the packed content to stdout (useful for piping). Summaries are written to stderr:

```bash
packx -s "error" -l 2 --format markdown --stdout | tee errors.md
```

Note: By default, Packx runs in summary-only mode and does not write content to a file. Use `-o <file>` to write to a file or `--stdout` to stream content.

### Path Globs and Files

You can pass directories, files, or globs as positional args:

```bash
# Only shell scripts in scripts/
packx scripts/*.sh --preview

# All Markdown anywhere
packx "**/*.md" -s "TODO" --format markdown

# Single file
packx README.md -s "Features"
```

## CLI Options

### Search & Filter

| Option | Short | Description |
|--------|-------|-------------|
| `--strings` | `-s` | Search string (use multiple times) |
| `--exclude-strings` | `-S` | Exclude files containing these strings |
| `--include` | `-i` | Include filenames/extensions (e.g. `*.ts`, `src/`) |
| `--exclude` | `-x` | Exclude filenames/extensions |
| `--regex` | `-R` | Treat search strings as regex patterns |
| `--case-sensitive` | `-C` | Enable case-sensitive search |
| `--staged` | | Include only git staged files |
| `--diff` | | Include only files changed from main branch |
| `--dirty` | | Include only modified/untracked files |
| `--no-packignore` | | Ignore .packignore file |

### Processing

| Option | Short | Description |
|--------|-------|-------------|
| `--strip-comments` | | Strip comments from code (AST-aware) |
| `--no-comments` | | Alias for `--strip-comments` |
| `--minify` | | Remove empty lines and whitespace |
| `--lines` | `-l` | Extract N lines of context around matches |
| `--related` | `-r` | Include related files (tests, stories) |
| `--follow-imports` | | Include files imported by matched files |

### Output

| Option | Short | Description |
|--------|-------|-------------|
| `--output` | `-o` | Write output to file |
| `--format` | `-f` | Output format: `xml`, `markdown`, `plain`, `jsonl` |
| `--copy` | `-c` | Copy output to clipboard |
| `--stdout` | | Write to stdout |
| `--preview` | | Show matching files without packing |
| `--max-tokens` | `-M` | Split output into chunks of max N tokens each |

### Performance

| Option | Short | Description |
|--------|-------|-------------|
| `--rg` | | Force ripgrep for file search (auto-detected by default) |
| `--no-rg` | | Disable ripgrep, use Node.js glob instead |
| `--no-cache` | | Disable caching (force fresh analysis) |

### Interactive & Watch Mode

| Option | Short | Description |
|--------|-------|-------------|
| `--interactive` | `-I` | Select files interactively with preview pane |
| `--watch` | `-w` | Watch for file changes and auto-update output |

### Other

| Option | Short | Description |
|--------|-------|-------------|
| `--explain` | | Dry run with detailed logging (no output generated) |
| `--verbose` | | Enable verbose error logging for debugging |
| `--prompt` | `-p` | Append text to the end of output |
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

## Advanced Features

### Interactive Mode

Select files interactively with a live preview pane:

```bash
# Launch interactive file selector
packx -s "useState" -I

# With context lines shown in preview
packx -s "TODO" -l 5 -I
```

Interactive mode features:
- Tree-based file browser with token counts
- Live preview pane showing file contents
- Context window highlighting when using `-l`
- Tab to toggle focus between file list and preview
- PgUp/PgDn to scroll preview content
- Files matching `.packignore` start unselected (can be manually selected)
- Save unselected files to `.packignore` after selection
- Choose output destination: clipboard, file, or stdout

### Watch Mode

Automatically regenerate output when source files change:

```bash
# Watch and update output file
packx -s "error" -o errors.xml --watch

# Watch and copy to clipboard
packx -s "TODO" --copy --watch
```

Press Ctrl+C to stop watching.

### Token-Based Output Splitting

Split large outputs into manageable chunks for LLM context windows:

```bash
# Split into 50k token chunks
packx -s "function" --max-tokens 50000 -o output.xml

# Creates: output-1.xml, output-2.xml, etc.
```

Each chunk includes:
- Chunk info header with part number and total
- Complete file contents (files are never split mid-file)
- Proper XML/Markdown structure

### JSONL Output Format

Generate structured output for programmatic processing:

```bash
packx -s "API" -f jsonl -o api-files.jsonl
```

Each line is a JSON object with:
```json
{"path": "src/api.ts", "content": "...", "tokens": 150, "matches": [{"line": 10, "column": 5, "match": "API"}]}
```

### Import Following

Automatically include files imported by matched files:

```bash
# Include all dependencies of matched files
packx -s "useAuth" --follow-imports -o auth-system.xml
```

Supports:
- ES6 imports (`import ... from`)
- CommonJS requires (`require(...)`)
- TypeScript path aliases

### Explain Mode

Debug your configuration with a detailed dry run:

```bash
packx -s "error" -e ts --explain
```

Shows:
- Resolved configuration options
- File discovery process
- Pattern matching details
- What would be included (without generating output)

### High-Performance Search with Ripgrep

Packx automatically uses ripgrep when available for faster searches:

```bash
# Force ripgrep (error if not installed)
packx -s "TODO" --rg

# Disable ripgrep (use Node.js glob)
packx -s "TODO" --no-rg
```

Install ripgrep: `brew install ripgrep` or `apt install ripgrep`

### Caching

File analysis results are cached for faster subsequent runs:

```bash
# First run: analyzes all files
packx -s "useState" -o hooks.xml

# Second run: uses cache (much faster)
packx -s "useState" -o hooks.xml

# Force fresh analysis
packx -s "useState" --no-cache -o hooks.xml
```

Cache is stored in `.packx-cache/` and uses SHA-256 content hashing.

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
     --remove-comments \
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

- Use `-C` for case-sensitive matches when needed
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
