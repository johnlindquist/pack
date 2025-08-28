# CLI Main Application Flow

## Description
The main entry point and control flow for the packx CLI application. This diagram shows the complete execution path from command line invocation to final output.

## Key Files and Functions
- **src/index.ts:732** - `main()` function
- **src/index.ts:40** - `printHelp()` function  
- **src/index.ts:644** - `createConfigTemplate()` function
- **src/index.ts:747** - Command line argument parsing with `mri`

## Trigger Points
- Command line invocation: `packx [command] [options]`
- Direct node execution: `node dist/index.js`

## Flow Diagram

```mermaid
graph TD
    A[CLI Invocation] --> B{Check argv[2]}
    
    B -->|init| C[Create Config Template Flow]
    B -->|other| D[Parse CLI Arguments]
    
    C --> C1[Get filename from argv[3]]
    C1 --> C2[Add .ini extension if needed]
    C2 --> C3[Call createConfigTemplate]
    C3 --> C4[Check file exists]
    C4 -->|exists| C5[Error: File already exists]
    C4 -->|not exists| C6[Check directory exists]
    C6 -->|missing| C7[Prompt user to create dir]
    C7 -->|yes| C8[Create directory recursively]
    C7 -->|no| C9[Exit with error]
    C6 -->|exists| C10[Write template file]
    C8 --> C10
    C10 --> C11[Success message]
    C5 --> EXIT1[process.exit(1)]
    C9 --> EXIT1
    C11 --> EXIT0[process.exit(0)]
    
    D --> E{Check flags}
    E -->|--help or -h| F[Print Help]
    E -->|--version or -v| G[Print Version]
    E -->|other| H[Process Configuration]
    
    F --> F1[Display comprehensive help text]
    F1 --> EXIT0
    G --> G1[Display version: packx v3.0.8]
    G1 --> EXIT0
    
    H --> I{Config file provided?}
    I -->|yes| J[Parse Config File Flow]
    I -->|no| K[Parse CLI Options Flow]
    
    J --> L[Merge config with CLI args]
    K --> L
    L --> M[File Discovery Flow]
    M --> N[Content Filtering Flow] 
    N --> O{Preview mode?}
    O -->|yes| P[List matched files and exit]
    O -->|no| Q[File Processing Flow]
    
    P --> EXIT0
    Q --> R[Output Generation Flow]
    R --> S[Statistics and Summary]
    S --> EXIT0
    
    EXIT1 --> END[Application End]
    EXIT0 --> END
    
    classDef errorPath fill:#ffcccc
    classDef successPath fill:#ccffcc
    classDef processPath fill:#ccccff
    
    class C5,C9,EXIT1 errorPath
    class C11,F1,G1,P,S,EXIT0 successPath
    class D,H,L,M,N,Q,R processPath
```

## Error Handling
- File already exists during template creation
- Directory creation failures  
- Invalid command line arguments
- Config file parsing errors
- File system access errors

## Exit Codes
- **0**: Success
- **1**: Configuration/setup errors
- **2**: No files found with specified extensions
- **3**: No files matched search strings
- **99**: Unexpected errors