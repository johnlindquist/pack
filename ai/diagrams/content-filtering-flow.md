# Content Filtering Flow

## Description
Filters discovered files based on string content matches. Supports both include and exclude string patterns with regex matching capabilities.

## Key Files and Functions
- **src/index.ts:511** - `fileContainsAnyStrings()` function
- **src/index.ts:402** - `escRegex()` helper
- **src/index.ts:421** - `findAllMatches()` for context extraction
- **src/index.ts:1052** - Main content filtering loop

## Trigger Points
- After file discovery
- Before output generation
- When search strings are provided

## Flow Diagram

```mermaid
graph TD
    A[Content Filtering Start] --> B[Build regex patterns]
    
    B --> B1{Include strings provided?}
    B1 -->|yes| B2[Create include pattern]
    B1 -->|no| B3[Set include pattern = null]
    
    B2 --> B4[Escape special regex chars]
    B4 --> B5[Join strings with OR operator]
    B5 --> B6[Create RegExp with flags]
    B6 --> C[Build exclude pattern]
    B3 --> C
    
    C --> C1{Exclude strings provided?}
    C1 -->|yes| C2[Create exclude pattern]
    C1 -->|no| C3[Set exclude pattern = null]
    
    C2 --> C4[Escape special regex chars]
    C4 --> C5[Join exclude strings with OR]
    C5 --> C6[Create RegExp with flags]
    C6 --> D[Process file candidates]
    C3 --> D
    
    D --> D1[Initialize matched files array]
    D1 --> D2{Include pattern exists?}
    
    D2 -->|no| E[Pass-through mode]
    D2 -->|yes| F[Content matching mode]
    
    E --> E1[For each candidate file]
    E1 --> E2{Exclude pattern exists?}
    E2 -->|no| E3[Add file to matched]
    E2 -->|yes| E4[Check file content for exclude]
    
    E4 --> E5[fileContainsAnyStrings(file, null, exclude)]
    E5 --> E6{File reading successful?}
    E6 -->|no| E7[Skip file]
    E6 -->|yes| E8{File size > 10MB?}
    E8 -->|yes| E7
    E8 -->|no| E9[Read file content]
    
    E9 --> E10{Matches exclude pattern?}
    E10 -->|yes| E7
    E10 -->|no| E3
    
    E3 --> E11[Track file extension]
    E11 --> E12{More candidates?}
    E7 --> E12
    E12 -->|yes| E1
    E12 -->|no| RESULT
    
    F --> F1[For each candidate file]
    F1 --> F2[fileContainsAnyStrings(file, include, exclude)]
    
    F2 --> F3{File reading successful?}
    F3 -->|no| F4[Skip file - log warning]
    F3 -->|yes| F5[Check file size safety]
    
    F5 --> F6{File size > 10MB?}
    F6 -->|yes| F4
    F6 -->|no| F7[Read file content as UTF-8]
    
    F7 --> F8{Exclude pattern exists?}
    F8 -->|yes| F9[Test exclude pattern first]
    F8 -->|no| F10[Test include pattern]
    
    F9 --> F11{Matches exclude pattern?}
    F11 -->|yes| F4
    F11 -->|no| F10
    
    F10 --> F12{Matches include pattern?}
    F12 -->|no| F4
    F12 -->|yes| F13[Add to matched files]
    
    F13 --> F14[Track file extension]
    F14 --> F15{More candidates?}
    F4 --> F15
    F15 -->|yes| F1
    F15 -->|no| RESULT
    
    RESULT --> R1{Any files matched?}
    R1 -->|no| R2[Warn: No files matched strings]
    R1 -->|yes| R3[Return matched file list]
    
    R2 --> ERROR[process.exit(3)]
    R3 --> SUCCESS[Matched files ready for processing]
    
    classDef patternPath fill:#ccffcc
    classDef contentPath fill:#ffffcc
    classDef errorPath fill:#ffcccc
    classDef successPath fill:#ccccff
    
    class B,C patternPath
    class E,F contentPath
    class ERROR,R2 errorPath
    class SUCCESS,R3 successPath
```

## String Pattern Processing
- **Regex escaping**: Special characters in search strings are escaped for literal matching
- **Case sensitivity**: Controlled by `--case-sensitive`/`-C` flag
- **OR logic**: Multiple include strings use OR logic (file matches if it contains ANY)
- **Exclude priority**: Exclude patterns are checked first and override includes

## File Safety Checks
- **Size limit**: Files larger than 10MB are automatically skipped
- **UTF-8 encoding**: Files must be readable as UTF-8 text
- **Error handling**: File read errors result in warnings, not failures

## Pattern Examples
```javascript
// Include strings: ["TODO", "FIXME", "console.log"]
// Becomes regex: /TODO|FIXME|console\.log/i

// Exclude strings: ["test", "spec"] 
// Becomes regex: /test|spec/i

// Special chars escaped: ["array[index]", "obj.prop"]
// Becomes regex: /array\[index\]|obj\.prop/i
```

## Performance Optimizations
- **Early exclude check**: Exclude patterns tested before include patterns
- **File size pre-check**: Large files skipped without reading content
- **Binary file detection**: Non-UTF-8 files automatically skipped
- **Parallel processing**: Multiple files can be processed concurrently