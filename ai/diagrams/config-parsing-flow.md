# Configuration Parsing Flow

## Description
Handles parsing of configuration files and merging with command-line arguments. Supports both file-based configuration and CLI-only configuration modes.

## Key Files and Functions
- **src/index.ts:592** - `parseConfigFile()` function
- **src/index.ts:585** - `normalizeStrings()` helper
- **src/index.ts:385** - `parseCSV()` helper
- **src/index.ts:393** - `toExtSet()` helper

## Trigger Points
- `--file` or `-f` CLI argument provided
- Config file path specified

## Flow Diagram

```mermaid
graph TD
    A[Configuration Request] --> B{Config file specified?}
    
    B -->|yes| C[Parse Config File Flow]
    B -->|no| D[CLI-Only Configuration]
    
    C --> C1[Read file content]
    C1 --> C2{File readable?}
    C2 -->|no| C3[Log error message]
    C3 --> C4[process.exit(1)]
    
    C2 -->|yes| C5[Split into lines]
    C5 --> C6[Initialize config sections]
    C6 --> C7[Process each line]
    
    C7 --> C8{Line type?}
    C8 -->|empty or #comment| C9[Skip line]
    C8 -->|[search] or [strings]| C10[Set section = search]
    C8 -->|[extensions] or [include]| C11[Set section = extensions] 
    C8 -->|[exclude] patterns| C12[Set section = exclude]
    C8 -->|content line| C13{Current section?}
    
    C13 -->|search| C14[Add to search strings]
    C13 -->|extensions| C15[Add to extensions list]
    C13 -->|exclude| C16[Add to exclude patterns]
    
    C9 --> C17[Next line]
    C10 --> C17
    C11 --> C17  
    C12 --> C17
    C14 --> C17
    C15 --> C17
    C16 --> C17
    
    C17 --> C18{More lines?}
    C18 -->|yes| C7
    C18 -->|no| C19[Merge with CLI args]
    
    D --> D1[Collect --strings/-s args]
    D1 --> D2[Collect --exclude-strings/-S args]
    D2 --> D3[Collect --extensions/-e args] 
    D3 --> D4[Collect --exclude-extensions/-x args]
    D4 --> D5[Parse CSV values]
    D5 --> D6[Convert to sets/arrays]
    D6 --> D7[Apply defaults if empty]
    
    C19 --> M1[Merge CLI strings with config]
    M1 --> M2[Merge CLI extensions with config]
    M2 --> M3[Merge CLI exclude patterns]
    M3 --> M4[Handle extension exclusions]
    
    D7 --> M5[Apply default extensions if empty]
    
    M4 --> RESULT[Final Configuration Object]
    M5 --> RESULT
    
    RESULT --> R1[strings: string array]
    RESULT --> R2[excludeStrings: string array]  
    RESULT --> R3[extensions: Set of extensions]
    RESULT --> R4[excludePatterns: gitignore patterns]
    
    C4 --> ERROR[Configuration Error]
    
    classDef errorPath fill:#ffcccc
    classDef configPath fill:#ccffcc
    classDef mergePath fill:#ffffcc
    classDef resultPath fill:#ccccff
    
    class C3,C4,ERROR errorPath
    class C1,C5,C6,C7,D1,D2,D3,D4 configPath
    class M1,M2,M3,M4,M5 mergePath
    class RESULT,R1,R2,R3,R4 resultPath
```

## Configuration File Format
```ini
[search]
# Search strings (one per line)
TODO
FIXME
console.log

[extensions] 
# File extensions without dots
ts
tsx
js

[exclude]
# Gitignore-style patterns
*.test.ts
**/node_modules/**
dist/
```

## Default Extensions Applied
When no extensions specified:
- Languages: js, jsx, ts, tsx, mjs, cjs, py, rb, go, java, cpp, c, h, rs, swift, kt, scala, php
- Frameworks: vue, svelte, astro  
- Styles: css, scss, less
- Config: json, yaml, yml, toml, xml
- Docs: md, mdx, txt
- Scripts: sh, bash, zsh, fish
- Data: sql, graphql, gql