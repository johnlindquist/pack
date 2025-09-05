---
id: task-2
title: Fix packx globbing for paths with spaces
status: Done
assignee:
  - '@assistant'
created_date: '2025-09-05 16:18'
updated_date: '2025-09-05 16:24'
labels:
  - cli
  - bug
  - globbing
dependencies: []
priority: high
---

## Description

Running packx with a quoted glob that includes a directory with spaces fails to match files. Example:

packx '/Users/johnlindquist/Library/Application Support/VideoPrompting/prompts/prompt_*/*.md'

Observed: \u26a0\ufe0f  No files matched the given strings.
Expected: The CLI should correctly handle quoted/escaped globs where directories contain spaces, find matching files, and process them. This likely requires unquoting arguments or using a glob library configuration that supports such patterns. Focus on user-visible behavior; implementation can vary.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The example command resolves matches and does not print 'No files matched the given strings.'
- [x] #2 Globs with spaces work when passed quoted (single or double quotes) and when using escaped spaces (e.g., Application\ Support).
- [x] #3 When no files match, the CLI prints which patterns had zero matches to aid debugging.
- [x] #4 --preview shows the count and sample of matched files for the provided pattern.
<!-- AC:END -->


## Implementation Plan

1. Reproduce failing glob with spaces\n2. Inspect CLI arg parsing and glob expansion\n3. Fix matching: use robust glob library and handle quoted/escaped spaces\n4. Enhance 'no matches' message with pattern echo\n5. Add --preview matched count + sample output\n6. Validate on example path and plain paths

## Implementation Notes

Fix globbing for paths with spaces and improve diagnostics.\n\nChanges:\n- Correctly handle absolute include globs by splitting include patterns into absolute vs relative and matching against abs/rel paths respectively.\n- Preserve absolute glob discovery while preventing false negatives during include filtering.\n- Track per-include-pattern matches and show helpful diagnostics when zero files match.\n- In --preview, show a sample list, total count, and per-pattern counts/samples.\n- When the shell expands a glob to explicit files (e.g., escaped spaces without quotes), restrict filtering to those explicit files to avoid mismatched include patterns.\n\nFiles modified:\n- src/index.ts\n\nVerification:\n- Single quotes: bun run src/index.ts --preview '/Users/johnlindquist/Library/Application Support/VideoPrompting/prompts/prompt_*/*.md' -> matches listed.\n- Double quotes: bun run src/index.ts --preview "/Users/johnlindquist/Library/Application Support/VideoPrompting/prompts/prompt_*/*.md" -> matches listed.\n- Escaped spaces (shell-expanded): bun run src/index.ts --preview /Users/johnlindquist/Library/Application\ Support/VideoPrompting/prompts/prompt_*/*.md -> matches listed.\n- No matches example prints zero-match patterns.\n
