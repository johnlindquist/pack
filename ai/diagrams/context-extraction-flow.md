# Context Extraction Flow

## Description
Extracts specific lines of context around pattern matches instead of including entire files. This is activated when the `--lines`/`-l` option is used and provides focused content for AI analysis.

## Key Files and Functions
- **src/index.ts:421** - `findAllMatches()` function
- **src/index.ts:440** - `extractContextWindows()` function  
- **src/index.ts:491** - `formatContextWindows()` function
- **src/index.ts:407** - `MatchPosition` type definition
- **src/index.ts:414** - `ContextWindow` type definition

## Trigger Points
- When `--lines N` or `-l N` option is provided
- After content filtering, during file processing
- Only when search strings are provided (ignored if no search patterns)

## Flow Diagram

```mermaid
graph TD
    A[Context Extraction Request] --> B{Lines option provided?}
    B -->|no| C[Include entire file content]
    B -->|yes| D{Search strings exist?}
    
    D -->|no| C
    D -->|yes| E[Extract context windows]
    
    C --> END1[Full file content]
    
    E --> E1[For each matched file]
    E1 --> E2[Read file content]
    E2 --> E3[Split content into lines]
    E3 --> E4[Find all pattern matches]
    
    E4 --> F[findAllMatches process]
    F --> F1[Create line-based regex]
    F1 --> F2[For each line in file]
    F2 --> F3[Execute regex with global flag]
    F3 --> F4{Match found?}
    
    F4 -->|yes| F5[Record match position]
    F5 --> F6[Store line number (1-based)]
    F6 --> F7[Store column index]
    F7 --> F8[Store match text]
    F8 --> F9{More matches in line?}
    
    F9 -->|yes| F3
    F9 -->|no| F10{More lines?}
    F4 -->|no| F10
    
    F10 -->|yes| F2
    F10 -->|no| G[Create context windows]
    
    G --> G1[For each match position]
    G1 --> G2[Calculate window boundaries]
    G2 --> G3[startLine = max(1, matchLine - contextLines)]
    G3 --> G4[endLine = min(totalLines, matchLine + contextLines)]
    G4 --> G5[Extract lines slice]
    G5 --> G6[Create ContextWindow object]
    G6 --> G7{More matches?}
    
    G7 -->|yes| G1
    G7 -->|no| H[Merge overlapping windows]
    
    H --> H1[Sort windows by startLine]
    H1 --> H2[Initialize merged array]
    H2 --> H3[For each window]
    H3 --> H4{Current window exists?}
    
    H4 -->|no| H5[Set as current window]
    H4 -->|yes| H6{Windows overlap?}
    
    H6 -->|yes| H7[Merge windows]
    H6 -->|no| H8[Add current to merged]
    
    H7 --> H9[Extend endLine to max]
    H9 --> H10[Re-extract lines for merged range]
    H10 --> H11[Combine match arrays]
    H11 --> H12{More windows?}
    
    H8 --> H13[Set new window as current]
    H13 --> H12
    H5 --> H12
    
    H12 -->|yes| H3
    H12 -->|no| H14[Add final current window]
    H14 --> I[Format context windows]
    
    I --> I1[For each merged window]
    I1 --> I2{First window?}
    I2 -->|no| I3[Add separator: ...] 
    I2 -->|yes| I4[Format lines with numbers]
    I3 --> I4
    
    I4 --> I5[For each line in window]
    I5 --> I6[Calculate actual line number]
    I6 --> I7[Format: lineNum│ content]
    I7 --> I8{More lines in window?}
    
    I8 -->|yes| I5
    I8 -->|no| I9{More windows?}
    I9 -->|yes| I1
    I9 -->|no| END2[Formatted context output]
    
    classDef extractionPath fill:#ccffcc
    classDef matchingPath fill:#ffffcc
    classDef mergingPath fill:#ffcccc
    classDef formattingPath fill:#ccccff
    
    class E,E1,E2,E3,E4 extractionPath
    class F,F1,F2,F3,F4,F5,F6,F7,F8,F9,F10 matchingPath
    class G,H,H1,H2,H3,H4,H5,H6,H7,H8,H9,H10,H11,H12,H13,H14 mergingPath
    class I,I1,I2,I3,I4,I5,I6,I7,I8,I9 formattingPath
```

## Context Window Merging Logic

When two matches are close together, their context windows can overlap. The merging algorithm:

1. **Overlap detection**: `window2.startLine <= window1.endLine + 1`
2. **Boundary extension**: `endLine = max(window1.endLine, window2.endLine)`
3. **Content re-extraction**: Lines re-sliced for the merged range
4. **Match consolidation**: All matches from both windows preserved

## Example Output Format

```
    156│ function calculateTotal() {
    157│   // TODO: Add tax calculation
    158│   let total = 0;
    159│   for (const item of items) {
    160│     total += item.price;
    161│   }
    162│   // FIXME: Handle discount logic
    163│   return total;
    164│ }
  ...
    201│ export function processOrder() {
    202│   // TODO: Validate order items
    203│   const total = calculateTotal();
    204│   return { total, status: 'processed' };
    205│ }
```

## Performance Characteristics
- **Memory efficient**: Only extracts needed context, not full files
- **Token optimized**: Reduces token count for AI processing
- **Pattern aware**: Preserves all matches within context windows
- **Merge smart**: Automatically combines overlapping contexts

## Configuration Options
- **Context size**: `--lines N` sets lines before/after each match
- **Pattern matching**: Uses same regex as content filtering
- **Window merging**: Automatic to avoid duplicate context
- **Line numbering**: Preserves original file line numbers