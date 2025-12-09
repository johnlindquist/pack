# Packx E2E Test Suite

This directory contains end-to-end (E2E) tests for the packx CLI tool.

## Directory Structure

```
test/
├── fixtures/           # Test fixtures (mock projects)
│   ├── simple-project/ # Basic TypeScript project for general testing
│   └── git-project/    # Git-initialized project for git mode testing
└── e2e/               # E2E test suites
    ├── helpers.ts      # Shared test utilities
    ├── basic.test.ts   # Basic functionality tests
    ├── git-modes.test.ts # Git mode tests (--staged, --diff, --dirty)
    └── output.test.ts  # Output format and file generation tests
```

## Fixtures

### simple-project/
A basic TypeScript project containing:
- Multiple `.ts` files with TODO/FIXME comments
- `console.log` statements for search testing
- Nested directory structure (`src/`)
- README.md and package.json
- .gitignore file

Used for testing:
- String search functionality
- Extension filtering
- Context lines extraction
- Basic output generation

### git-project/
A git-initialized project for testing git-specific features:
- Initialized with git and initial commit
- Files suitable for modification and staging
- Supports testing --staged, --dirty, and --diff modes

## Test Suites

### basic.test.ts
Tests core packx functionality:
- Help and version commands
- String search with `-s` flag
- Extension filtering with `-e` flag
- Exclude patterns with `-x` flag
- Exclude strings with `-S` flag
- Context lines with `-l` flag
- Exit codes (0=success, 2=no files, 3=no matches)
- Preview mode
- Regex mode with `-R` flag

### git-modes.test.ts
Tests git integration features:
- `--staged`: Finding only staged files
- `--dirty`: Finding modified and untracked files
- `--diff`: Finding files changed vs main branch
- Combining git modes with search filters
- Handling deleted files
- Respecting .gitignore in git modes

### output.test.ts
Tests output generation and formats:
- XML format (default)
- Markdown format with `--style markdown`
- JSONL format with `--style jsonl`
- Plain text format with `--style plain`
- stdout output with `--stdout` flag
- File output with `-o` flag
- Compressed output with `--compress` flag
- Summary-only mode (no output destination)
- Token splitting with `--max-tokens`

## Test Helpers

### helpers.ts

#### `runCLI(args, options)`
Executes the packx CLI as a child process and captures output.

```typescript
const { stdout, stderr, code } = await runCLI(["-s", "TODO", "--preview"], {
  cwd: simplePath,
  timeout: 30000
});
```

**Parameters:**
- `args: string[]` - Command line arguments
- `options.cwd?: string` - Working directory
- `options.timeout?: number` - Timeout in ms (default: 30000)
- `options.env?: Record<string, string>` - Environment variables

**Returns:**
- `stdout: string` - Standard output
- `stderr: string` - Standard error
- `code: number` - Exit code

#### `getFixturePath(fixtureName)`
Returns the absolute path to a test fixture directory.

```typescript
const simplePath = getFixturePath("simple-project");
```

## Running Tests

Run all E2E tests:
```bash
bun test test/e2e/
```

Run specific test suite:
```bash
bun test test/e2e/basic.test.ts
bun test test/e2e/git-modes.test.ts
bun test test/e2e/output.test.ts
```

Run all tests (including unit tests):
```bash
bun test
```

Run with bail on first failure:
```bash
bun test --bail=1
```

## Adding New Tests

1. **Choose the appropriate test file** or create a new one in `test/e2e/`
2. **Import helpers**: `import { runCLI, getFixturePath } from "./helpers"`
3. **Use fixtures** for consistent test data
4. **Clean up** any files created during tests (use `afterEach` hooks)
5. **Test exit codes** as well as output content
6. **Consider edge cases** like empty results, errors, etc.

### Example Test

```typescript
import { describe, test, expect } from "bun:test";
import { runCLI, getFixturePath } from "./helpers";

describe("My feature", () => {
  test("does something useful", async () => {
    const path = getFixturePath("simple-project");
    const { stdout, code } = await runCLI(["-s", "TODO"], { cwd: path });

    expect(code).toBe(0);
    expect(stdout).toContain("expected output");
  });
});
```

## Test Coverage

The E2E test suite covers:
- ✅ Basic CLI functionality (help, version)
- ✅ String search with multiple patterns
- ✅ Extension filtering
- ✅ Exclude patterns and strings
- ✅ Context line extraction
- ✅ Git modes (staged, dirty, diff)
- ✅ Multiple output formats (XML, Markdown, JSONL, plain)
- ✅ File output and stdout
- ✅ Token splitting for large outputs
- ✅ Exit codes
- ✅ Error handling

## Notes

- Tests use `bun:test` framework
- All tests run the actual CLI binary (`src/index.ts`) via child process
- Tests are isolated and can run in parallel
- Fixtures are static and should not be modified by tests
- Git tests clean up branches and changes in hooks
- Temporary files should be tracked and cleaned up in `afterEach` hooks
