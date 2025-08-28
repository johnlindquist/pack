# Async Operations Flow

## Description
Handles all asynchronous operations in the packx CLI tool, including file system operations, child process spawning, and user input handling. The application is entirely async-based with comprehensive error handling.

## Key Files and Functions
- **src/index.ts:732** - `main()` async function entry point
- **src/index.ts:511** - `fileContainsAnyStrings()` async function
- **src/index.ts:592** - `parseConfigFile()` async function
- **src/index.ts:644** - `createConfigTemplate()` async function
- **src/index.ts:1287** - Child process spawning for clipboard

## Trigger Points
- All file system operations
- User input during template creation
- Clipboard copy operations
- Configuration file processing

## Flow Diagram

```mermaid
graph TD
    A[Application Start] --> B[main() async function]
    
    B --> C{Command type?}
    C -->|init| D[Template Creation Flow]
    C -->|other| E[CLI Processing Flow]
    
    D --> D1[createConfigTemplate() async]
    D1 --> D2[await fs.access() - check file exists]
    D2 --> D3{File exists?}
    D3 -->|yes| D4[Exit with error]
    D3 -->|no| D5[Check directory path]
    
    D5 --> D6[await fs.access() - check dir exists]
    D6 --> D7{Directory exists?}
    D7 -->|yes| D12[Write template file]
    D7 -->|no| D8[User Input Flow]
    
    D8 --> D9[Create readline interface]
    D9 --> D10[await Promise<string> - user response]
    D10 --> D11{User confirms?}
    D11 -->|yes| D13[await fs.mkdir() - create directory]
    D11 -->|no| D4
    
    D13 --> D12
    D12 --> D14[await fs.writeFile() - write template]
    D14 --> D15[Success message and exit]
    
    E --> E1{Config file provided?}
    E1 -->|yes| E2[parseConfigFile() async]
    E1 -->|no| E3[CLI-only processing]
    
    E2 --> E4[await fs.readFile() - read config]
    E4 --> E5{Read successful?}
    E5 -->|no| E6[Error handling and exit]
    E5 -->|yes| E7[Parse content]
    E7 --> F[File Discovery Flow]
    E3 --> F
    
    F --> F1[Process each root directory]
    F1 --> F2[await glob() - discover files]
    F2 --> F3{Glob successful?}
    F3 -->|no| F4[Continue with empty results]
    F3 -->|yes| F5[Collect file paths]
    
    F5 --> F6{More roots?}
    F6 -->|yes| F1
    F6 -->|no| G[Content Filtering Flow]
    
    G --> G1[Process each candidate file]
    G1 --> G2[fileContainsAnyStrings() async]
    
    G2 --> G3[await fs.stat() - check file size]
    G3 --> G4{File too large?}
    G4 -->|yes| G5[Skip file]
    G4 -->|no| G6[await fs.readFile() - read content]
    
    G6 --> G7{Read successful?}
    G7 -->|no| G5
    G7 -->|yes| G8[Test regex patterns]
    G8 --> G9[Return match result]
    
    G9 --> G10{More files?}
    G5 --> G10
    G10 -->|yes| G1
    G10 -->|no| H[Output Processing Flow]
    
    H --> H1[Process each matched file]
    H1 --> H2[await fs.readFile() - read for output]
    H2 --> H3{Read successful?}
    H3 -->|no| H4[Log warning, continue]
    H3 -->|yes| H5[Process content]
    
    H5 --> H6{More files?}
    H4 --> H6
    H6 -->|yes| H1
    H6 -->|no| I[Output Writing Flow]
    
    I --> I1{Output to file?}
    I1 -->|yes| I2[await fs.writeFile() - write output]
    I1 -->|no| I3[Output to stdout or summary]
    
    I2 --> J[Clipboard Flow]
    I3 --> J
    
    J --> J1{Copy flag enabled?}
    J1 -->|no| SUCCESS
    J1 -->|yes| J2[Clipboard Process Flow]
    
    J2 --> J3[Detect platform]
    J3 --> J4[spawn() - create child process]
    J4 --> J5[Write to process.stdin]
    J5 --> J6[process.stdin.end()]
    J6 --> J7[await Promise - wait for exit]
    
    J7 --> J8{Copy successful?}
    J8 -->|yes| J9[Log success]
    J8 -->|no| J10[Log failure]
    
    J9 --> SUCCESS[Application Complete]
    J10 --> SUCCESS
    
    D4 --> ERROR[Application Error]
    E6 --> ERROR
    
    SUCCESS --> END[Process Exit 0]
    ERROR --> END2[Process Exit 1]
    
    classDef asyncPath fill:#ccffcc
    classDef fsPath fill:#ffffcc
    classDef processPath fill:#ffcccc
    classDef errorPath fill:#ffaaaa
    classDef successPath fill:#ccccff
    
    class B,D1,E2,F2,G2,H2,I2 asyncPath
    class D2,D6,D13,D14,E4,G3,G6 fsPath
    class J2,J4,J5,J6,J7 processPath
    class D4,E6,ERROR,END2 errorPath
    class D15,J9,SUCCESS,END successPath
```

## Async Patterns Used

### File System Operations
```typescript
// Pattern: async/await with error handling
try {
  const content = await fs.readFile(filePath, 'utf8');
  // Process content
} catch (error) {
  console.error(`Error reading file: ${error}`);
  return false;
}
```

### User Input Handling  
```typescript
// Pattern: Promise wrapper for readline
const answer = await new Promise<string>((resolve) => {
  rl.question('Would you like to create it? (y/n): ', resolve);
});
```

### Child Process Management
```typescript
// Pattern: Promise wrapper for spawn events
await new Promise((resolve, reject) => {
  copyProc.on('exit', (code) => {
    if (code === 0) resolve(code);
    else reject(new Error(`Process exited with code ${code}`));
  });
  copyProc.on('error', reject);
});
```

### Glob Operations
```typescript
// Pattern: await glob with configuration
const files = await glob(pattern, {
  cwd: absRoot,
  ignore: [...ignorePatterns],
  absolute: true,
  nodir: true
});
```

## Error Handling Strategies

### File System Errors
- **Missing files**: Graceful skip with warning
- **Permission errors**: Skip file and continue  
- **Large files**: Size check before reading
- **Binary files**: UTF-8 decode error handling

### Process Errors
- **Missing clipboard tools**: Silent failure with message
- **Child process failures**: Graceful degradation
- **User cancellation**: Clean exit

### Configuration Errors
- **Invalid config files**: Error message and exit
- **Missing directories**: User prompt for creation
- **Invalid arguments**: Help display

## Concurrency Characteristics
- **Sequential file processing**: Files processed one at a time for memory efficiency
- **Async I/O**: All I/O operations are non-blocking
- **Error isolation**: Individual file errors don't stop processing
- **Resource cleanup**: Proper cleanup of file handles and processes

## Performance Considerations
- **Memory management**: Large files (>10MB) automatically skipped
- **Stream processing**: Files read entirely into memory (optimization opportunity)
- **Parallel potential**: File processing could be parallelized in future
- **Caching**: No caching implemented (files read multiple times)