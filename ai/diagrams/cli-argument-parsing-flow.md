# CLI Argument Parsing Flow

## Description
Parses command line arguments using the `mri` library, handles aliases, validates options, and processes positional arguments. Supports both short and long flag formats with complex argument handling.

## Key Files and Functions
- **src/index.ts:747** - `mri()` argument parsing configuration
- **src/index.ts:531** - `buildRepomixPassthroughArgs()` function
- **src/index.ts:585** - `normalizeStrings()` helper
- **src/index.ts:787** - `toArray()` helper

## Trigger Points
- `process.argv.slice(2)` processing
- After initial command detection (init vs normal)
- Before configuration processing

## Flow Diagram

```mermaid
graph TD
    A[CLI Invocation] --> B[Extract process.argv.slice(2)]
    
    B --> C{Check argv[2]}
    C -->|'init'| D[Template Creation Mode]
    C -->|other| E[Parse with mri()]
    
    D --> D1[Extract filename from argv[3]]
    D1 --> D2[Skip normal parsing]
    D2 --> INIT[Template Creation Flow]
    
    E --> E1[Configure mri() options]
    E1 --> E2[Set up aliases]
    E2 --> E3[Define string parameters]
    E3 --> E4[Define boolean parameters]
    E4 --> E5[Execute mri() parsing]
    
    E5 --> F[Parse Result Analysis]
    F --> F1{Help requested?}
    F1 -->|--help or -h| F2[Display help and exit]
    F1 -->|no| F3{Version requested?}
    
    F3 -->|--version or -v| F4[Display version and exit]
    F3 -->|no| G[Process Parsed Arguments]
    
    G --> G1[Extract string arrays]
    G1 --> G2[Extract boolean flags]
    G2 --> G3[Process positional arguments]
    G3 --> G4[Handle aliases]
    
    G4 --> H[String Parameter Processing]
    H --> H1[strings/s → search strings]
    H1 --> H2[exclude-strings/S → exclude strings]
    H2 --> H3[extensions/e → file extensions]
    H3 --> H4[exclude-extensions/x → exclude patterns]
    H4 --> H5[file/f → config file path]
    
    H5 --> I[Boolean Flag Processing]
    I --> I1[case-sensitive/C → regex flags]
    I1 --> I2[preview → list files only]
    I2 --> I3[stdout → output to stdout]
    I3 --> I4[copy/c → copy to clipboard]
    
    I4 --> J[Positional Argument Classification]
    J --> J1[For each positional arg]
    J1 --> J2{Argument type?}
    
    J2 -->|has glob chars| J3[Add to glob patterns]
    J2 -->|is directory| J4[Add to root directories] 
    J2 -->|is file| J5[Add to explicit files]
    J2 -->|other/invalid| J6[Add to glob patterns]
    
    J3 --> J7{More positional args?}
    J4 --> J7
    J5 --> J7
    J6 --> J7
    
    J7 -->|yes| J1
    J7 -->|no| K[Array Normalization]
    
    K --> K1[normalizeStrings() for each parameter]
    K1 --> K2[Handle both single values and arrays]
    K2 --> K3[Filter out empty/undefined values]
    K3 --> K4[Apply CSV parsing where needed]
    
    K4 --> L[Include/Ignore Pattern Processing]
    L --> L1[Process --include patterns]
    L1 --> L2[Process --ignore/-i patterns] 
    L2 --> L3[Combine with positional patterns]
    L3 --> L4[Expand simple patterns to globs]
    
    L4 --> M[Repomix Passthrough Processing]
    M --> M1[buildRepomixPassthroughArgs()]
    M1 --> M2[Filter out packx-specific flags]
    M2 --> M3[Preserve repomix flags and values]
    M3 --> M4[Handle boolean flag formats]
    M4 --> M5[Handle array value formats]
    
    M5 --> RESULT[Parsed Arguments Object]
    
    RESULT --> R1[strings: string[]]
    RESULT --> R2[excludeStrings: string[]]
    RESULT --> R3[extensions: string[]]
    RESULT --> R4[excludePatterns: string[]]
    RESULT --> R5[configFile: string]
    RESULT --> R6[contextLines: number]
    RESULT --> R7[caseSensitive: boolean]
    RESULT --> R8[preview: boolean]
    RESULT --> R9[positionalRoots: string[]]
    RESULT --> R10[positionalFiles: string[]]
    RESULT --> R11[positionalGlobs: string[]]
    RESULT --> R12[repomixArgs: string[]]
    
    F2 --> EXIT0[process.exit(0)]
    F4 --> EXIT0
    
    classDef parseConfig fill:#ccffcc
    classDef stringProcess fill:#ffffcc
    classDef booleanProcess fill:#ffcccc  
    classDef positionalProcess fill:#ccccff
    classDef resultProcess fill:#ffaacc
    
    class E1,E2,E3,E4,E5 parseConfig
    class H,H1,H2,H3,H4,H5 stringProcess
    class I,I1,I2,I3,I4 booleanProcess
    class J,J1,J2,J3,J4,J5,J6,J7 positionalProcess
    class RESULT,R1,R2,R3,R4,R5,R6,R7,R8,R9,R10,R11,R12 resultProcess
```

## MRI Configuration

### Aliases
```javascript
alias: {
  s: "strings",           // Search strings
  S: "exclude-strings",   // Exclude strings  
  e: "extensions",        // File extensions
  x: "exclude-extensions", // Exclude patterns
  f: "file",             // Config file
  l: "lines",            // Context lines
  C: "case-sensitive",   // Case sensitive search
  h: "help",             // Help display
  v: "version"           // Version display
}
```

### String Parameters
- `strings`, `s` - Multiple search strings
- `exclude-strings`, `S` - Multiple exclude strings
- `extensions`, `e` - File extensions (CSV)
- `exclude-extensions`, `x` - Exclude patterns (CSV)
- `file`, `f` - Configuration file path
- `include` - Include patterns (Repomix compatibility)
- `ignore`, `i` - Ignore patterns (Repomix compatibility)

### Boolean Parameters  
- `case-sensitive`, `C` - Enable case-sensitive matching
- `preview` - Preview mode (list files only)
- `help`, `h` - Display help
- `version`, `v` - Display version
- `stdout` - Output to stdout instead of file

## Argument Processing Examples

### Multiple String Arguments
```bash
# These are equivalent:
packx -s "TODO" -s "FIXME" -s "console.log"
packx --strings "TODO" --strings "FIXME" --strings "console.log"

# CSV format:
packx -s "TODO,FIXME,console.log"
```

### Extension Handling
```bash
# These are equivalent:
packx -e "ts,tsx,js,jsx"  
packx -e ts -e tsx -e js -e jsx
packx --extensions "ts" --extensions "tsx"
```

### Positional Arguments
```bash
packx -s "TODO" src/          # Directory root
packx -s "TODO" src/file.ts   # Specific file
packx -s "TODO" "src/**/*.ts" # Glob pattern
```

## Error Handling
- **Invalid flags**: mri handles unknown flags gracefully
- **Missing values**: Empty arrays/strings used as defaults
- **Invalid paths**: Validation happens during file discovery
- **Conflicting options**: Last value wins (mri behavior)

## Passthrough to Repomix
Reserved flags are filtered out, all others pass through:
- `--compress` → passed to repomix
- `--style markdown` → passed to repomix  
- `-o output.md` → passed to repomix
- `--remove-comments` → passed to repomix