# Output Generation Flow

## Description
Generates the final output in various formats (XML, Markdown, Plain) with options for file output, stdout, or clipboard. Handles both full file content and context-extracted content.

## Key Files and Functions
- **src/index.ts:1133** - Main output generation loop
- **src/index.ts:1276** - Output writing logic
- **src/index.ts:1284** - Clipboard copying logic
- **src/index.ts:1327** - Statistics calculation

## Trigger Points
- After content filtering (or context extraction)
- When not in preview mode
- Before final statistics display

## Flow Diagram

```mermaid
graph TD
    A[Output Generation Start] --> B[Determine output destination]
    
    B --> B1{Output argument analysis}
    B1 --> B2{--stdout flag or output='-'?}
    B2 -->|yes| B3[Set toStdout = true]
    B2 -->|no| B4{-o filename provided?}
    
    B4 -->|yes| B5[Set outputFile = filename]
    B4 -->|no| B6[Set summaryOnly = true]
    
    B3 --> C[Initialize output variables]
    B5 --> C
    B6 --> C
    
    C --> C1[output = '', totalMatchCount = 0]
    C1 --> C2[totalWindowCount = 0, fileSizes = []]
    C2 --> D{Output style?}
    
    D -->|xml| E[XML Format Generation]
    D -->|markdown| F[Markdown Format Generation] 
    D -->|plain| G[Plain Format Generation]
    
    E --> E1{Summary only mode?}
    E1 -->|yes| E2[Skip content generation]
    E1 -->|no| E3[Generate XML header]
    
    E3 --> E4[Create file_summary section]
    E4 --> E5[Add purpose and usage guidelines]
    E5 --> E6[Add notes with file count]
    E6 --> E7[Create directory_structure section]
    E7 --> E8[List all relative file paths]
    E8 --> E9[Start files section]
    E9 --> E10[Process each matched file]
    
    E10 --> H[File Processing Loop]
    E2 --> STATS
    
    F --> F1{Summary only mode?}
    F1 -->|yes| F2[Skip content generation]
    F1 -->|no| F3[Generate Markdown header]
    
    F3 --> F4[Add title and file count]
    F4 --> F5[Add context information if applicable]
    F5 --> F6[Start files section]
    F6 --> F7[Process each matched file]
    
    F7 --> H
    F2 --> STATS
    G --> H
    
    H --> H1[For each matched file]
    H1 --> H2[Read file content]
    H2 --> H3{Read successful?}
    H3 -->|no| H4[Log warning, skip file]
    H3 -->|yes| H5{Context lines specified?}
    
    H5 -->|yes| I[Context Extraction Mode]
    H5 -->|no| J[Full File Mode]
    
    I --> I1[Extract context windows]
    I1 --> I2{Windows found?}
    I2 -->|no| I3[Skip file - no matches]
    I2 -->|yes| I4[Count matches and windows]
    I4 --> I5[Format context windows]
    I5 --> I6[Wrap in file tags/sections]
    I6 --> I7[Add to output if not summary]
    I7 --> I8[Calculate file statistics]
    I8 --> K[Update counters]
    
    J --> J1[Get file extension for syntax]
    J1 --> J2[Wrap content in file tags/sections]
    J2 --> J3[Add to output if not summary]
    J3 --> J4[Calculate file statistics]
    J4 --> K
    
    I3 --> L[Next file]
    H4 --> L
    K --> L
    L --> H9{More files?}
    H9 -->|yes| H1
    H9 -->|no| M[Finalize output format]
    
    M --> M1{Output style?}
    M1 -->|xml| M2[Close </files> tag]
    M1 -->|markdown| M3[Complete markdown]
    M1 -->|plain| M4[Plain text complete]
    
    M2 --> N[Write Output]
    M3 --> N
    M4 --> N
    
    N --> N1{Output destination?}
    N1 -->|stdout| N2[process.stdout.write(output)]
    N1 -->|file| N3[fs.writeFile(outputFile, output)]
    N1 -->|summary| N4[Skip content write]
    
    N2 --> O[Handle Copy Flag]
    N3 --> N5[Log success message]
    N5 --> O
    N4 --> O
    
    O --> O1{--copy or -c flag?}
    O1 -->|no| STATS
    O1 -->|yes| O2[Detect platform]
    
    O2 --> O3{Platform?}
    O3 -->|darwin| O4[spawn('pbcopy')]
    O3 -->|win32| O5[spawn('clip')]
    O3 -->|linux| O6[spawn('xclip', ['-selection', 'clipboard'])]
    
    O4 --> O7[Write output to stdin]
    O5 --> O7
    O6 --> O7
    O7 --> O8[Close stdin and wait]
    O8 --> O9{Copy successful?}
    
    O9 -->|yes| O10[Log: Copied to clipboard!]
    O9 -->|no| O11[Log: Could not copy to clipboard]
    
    O10 --> STATS
    O11 --> STATS
    
    STATS[Generate Statistics] --> S1[Calculate total characters]
    S1 --> S2[Estimate tokens (~chars/4)]
    S2 --> S3[Display pack summary]
    S3 --> S4[Show file count and context info]
    S4 --> S5[Show token/character counts]
    S5 --> S6[Show output destination]
    S6 --> S7[Show found extensions]
    S7 --> S8[Show top 10 files by token count]
    S8 --> SUCCESS[Output Generation Complete]
    
    classDef outputPath fill:#ccffcc
    classDef formatPath fill:#ffffcc
    classDef filePath fill:#ffcccc
    classDef statsPath fill:#ccccff
    
    class B,C,N outputPath
    class E,F,G,M formatPath
    class H,I,J filePath
    class O,STATS,S1,S2,S3,S4,S5,S6,S7,S8 statsPath
```

## Output Format Examples

### XML Format
```xml
<file_summary>
This section contains a summary of this file.

<purpose>
This file contains a packed representation of filtered repository contents.
</purpose>

<usage_guidelines>
- Treat this file as a snapshot of the repository's state
- Be aware that this file may contain sensitive information
</usage_guidelines>
</file_summary>

<directory_structure>
src/utils.ts
src/main.ts
</directory_structure>

<files>
<file path="src/utils.ts" matches="3" windows="2">
    42│ export function helper() {
    43│   // TODO: Implement this
    44│   return null;
    45│ }
</file>
</files>
```

### Markdown Format
```markdown
# Packx Output

This file contains 15 filtered files from the repository.

**Context:** 10 lines around each match

## Files

### src/utils.ts

**Matches:** 3 | **Context windows:** 2

```ts
    42│ export function helper() {
    43│   // TODO: Implement this  
    44│   return null;
    45│ }
```
```

## Clipboard Integration
- **macOS**: Uses `pbcopy` command
- **Windows**: Uses `clip` command  
- **Linux**: Uses `xclip` with clipboard selection
- **Error handling**: Silently fails if clipboard tool unavailable

## Statistics Display
- Total files processed
- Context lines (if applicable)
- Total matches and context windows
- Token count estimation (characters ÷ 4)
- Character count
- Output destination
- Extensions found
- Top 10 largest files by token count