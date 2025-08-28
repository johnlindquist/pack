# File Discovery Flow

## Description
Discovers files in the filesystem using glob patterns, respects .gitignore patterns, and applies include/exclude filters. This is the core file collection mechanism before content filtering.

## Key Files and Functions
- **src/index.ts:960** - Main file discovery loop
- **src/index.ts:974** - `glob()` calls with ignore patterns
- **src/index.ts:796** - `hasGlobChars()` helper
- **src/index.ts:799** - `expandPattern()` helper
- **src/index.ts:1044** - Include/ignore matcher application

## Trigger Points
- After configuration parsing
- Before content filtering

## Flow Diagram

```mermaid
graph TD
    A[File Discovery Start] --> B[Initialize candidates Set]
    B --> C[Determine root directories]
    
    C --> C1{Positional directories provided?}
    C1 -->|yes| C2[Use provided roots]
    C1 -->|no| C3[Use current directory '.']
    
    C2 --> D[Process each root directory]
    C3 --> D
    
    D --> E[Build extension glob patterns]
    E --> E1[For each extension in Set]
    E1 --> E2[Create **/*.ext pattern]
    E2 --> E3[Execute glob with ignore patterns]
    
    E3 --> F[Apply built-in ignore patterns]
    F --> F1[**/node_modules/**]
    F1 --> F2[**/.git/**]  
    F2 --> F3[**/dist/**]
    F3 --> F4[**/build/**]
    F4 --> F5[**/.next/**]
    F5 --> F6[**/coverage/**]
    F6 --> F7[**/.cache/**]
    F7 --> F8[**/tmp/** & **/temp/**]
    F8 --> F9[**/*.log]
    F9 --> F10[**/.DS_Store & **/Thumbs.db]
    F10 --> F11[User exclude patterns from config]
    
    F11 --> G[Collect discovered files]
    G --> G1[Add to candidates Set]
    
    E3 --> H{More extensions?}
    H -->|yes| E1
    H -->|no| I[Process include patterns]
    
    I --> I1{Include patterns exist?}
    I1 -->|no| J[Process positional files]
    I1 -->|yes| I2[Expand include patterns]
    
    I2 --> I3[For each include pattern]
    I3 --> I4{Pattern has glob chars?}
    I4 -->|yes| I5[Use pattern as-is]
    I4 -->|no| I6[Generate multiple patterns]
    
    I6 --> I7[norm - exact relative path]
    I7 --> I8[**/norm - file anywhere]
    I8 --> I9[norm/** - directory at root]
    I9 --> I10[**/norm/** - directory anywhere]
    
    I5 --> I11[Execute glob for pattern]
    I10 --> I11
    I11 --> I12[Add results to candidates]
    
    I3 --> I13{More include patterns?}
    I13 -->|yes| I3
    I13 -->|no| J
    
    J --> J1[Process positional file arguments]
    J1 --> J2{Positional args exist?}
    J2 -->|no| K[Apply include/ignore matchers]
    J2 -->|yes| J3[Classify positional args]
    
    J3 --> J4[Check if file/directory/glob]
    J4 --> J5{Arg type?}
    J5 -->|directory| J6[Add to roots]
    J5 -->|file| J7[Add to explicit files]
    J5 -->|glob or invalid| J8[Add to glob includes]
    
    J6 --> J9{More positional args?}
    J7 --> J9
    J8 --> J9
    J9 -->|yes| J3
    J9 -->|no| J10[Add explicit files to candidates]
    J10 --> K
    
    K --> K1[Create Minimatch objects]
    K1 --> K2[For each candidate file]
    K2 --> K3[Get relative path from cwd]
    K3 --> K4{Include matchers exist?}
    K4 -->|yes| K5[Check include match]
    K4 -->|no| K7[Check ignore matchers]
    
    K5 --> K6{Matches include pattern?}
    K6 -->|no| K11[Skip file]
    K6 -->|yes| K7
    
    K7 --> K8{Ignore matchers exist?}
    K8 -->|yes| K9{Matches ignore pattern?}
    K8 -->|no| K10[Add to filtered candidates]
    
    K9 -->|yes| K11
    K9 -->|no| K10
    
    K11 --> K12{More candidates?}
    K10 --> K12
    K12 -->|yes| K2
    K12 -->|no| L[Check results]
    
    L --> L1{Any files discovered?}
    L1 -->|no| L2[Warn: No files found]
    L1 -->|yes| L3[Return filtered candidates]
    
    L2 --> ERROR[process.exit(2)]
    L3 --> SUCCESS[File list ready for content filtering]
    
    classDef discoveryPath fill:#ccffcc
    classDef filterPath fill:#ffffcc  
    classDef errorPath fill:#ffcccc
    classDef successPath fill:#ccccff
    
    class E,F,G discoveryPath
    class I,J,K filterPath
    class ERROR errorPath
    class SUCCESS successPath
```

## Include/Ignore Pattern Matching
- **Include patterns**: If specified, files must match at least one pattern
- **Ignore patterns**: Files matching any ignore pattern are excluded
- **Pattern expansion**: Simple strings become multiple glob patterns:
  - `foo` → `foo`, `**/foo`, `foo/**`, `**/foo/**`
- **Case sensitivity**: Controlled by `--case-sensitive` flag

## Built-in Ignore Patterns
Always excluded regardless of user settings:
- `**/node_modules/**` - Dependencies
- `**/.git/**` - Git metadata  
- `**/dist/**`, `**/build/**` - Build outputs
- `**/.next/**` - Next.js cache
- `**/coverage/**` - Test coverage
- `**/.cache/**`, `**/tmp/**`, `**/temp/**` - Temporary files
- `**/*.log` - Log files
- `**/.DS_Store`, `**/Thumbs.db` - OS files