# Error Handling Flow

## Description
Comprehensive error handling throughout the packx application, including graceful degradation, user-friendly error messages, and appropriate exit codes for different failure scenarios.

## Key Files and Functions
- **src/index.ts:1371** - Global error handler with `main().catch()`
- **src/index.ts:635** - Config file error handling
- **src/index.ts:526** - File reading error handling in `fileContainsAnyStrings()`
- **src/index.ts:1209** - Individual file processing error handling

## Trigger Points
- File system access failures
- Configuration parsing errors
- Invalid command line arguments
- Child process failures
- Network/clipboard operation failures

## Flow Diagram

```mermaid
graph TD
    A[Error Occurrence] --> B{Error Type?}
    
    B -->|Configuration Error| C[Config Error Handling]
    B -->|File System Error| D[File System Error Handling]
    B -->|Validation Error| E[Validation Error Handling]
    B -->|Process Error| F[Process Error Handling]
    B -->|Unexpected Error| G[Global Error Handling]
    
    C --> C1{Config file error?}
    C1 -->|File not found| C2[Log: Error reading config file]
    C1 -->|Parse error| C3[Log: Config syntax error]
    C1 -->|Permission error| C4[Log: Config access denied]
    
    C2 --> C5[console.error(filepath)]
    C3 --> C5
    C4 --> C5
    C5 --> C6[console.error(error.message)]
    C6 --> C7[process.exit(1)]
    
    D --> D1{File operation type?}
    D1 -->|Template creation| D2[Template Error Flow]
    D1 -->|File reading| D3[File Reading Error Flow]
    D1 -->|File writing| D4[File Writing Error Flow]
    D1 -->|Directory operations| D5[Directory Error Flow]
    
    D2 --> D6{Template error cause?}
    D6 -->|File exists| D7[❌ File 'filename' already exists]
    D6 -->|Directory missing| D8[📁 Directory 'dir' does not exist]
    D6 -->|Write failure| D9[❌ Failed to create config file]
    
    D7 --> D10[Suggest different name or delete existing]
    D8 --> D11[Prompt user to create directory]
    D9 --> D12[Show error details]
    
    D10 --> EXIT1[process.exit(1)]
    D11 --> D13{User confirms directory creation?}
    D13 -->|no| D14[Directory creation cancelled]
    D13 -->|yes| D15[Attempt directory creation]
    
    D15 --> D16{Creation successful?}
    D16 -->|no| D12
    D16 -->|yes| CONTINUE[Continue with template creation]
    
    D14 --> EXIT1
    D12 --> EXIT1
    
    D3 --> D17{File read error cause?}
    D17 -->|File too large| D18[Skip file silently (>10MB)]
    D17 -->|Permission denied| D19[Skip file with warning]
    D17 -->|Binary/encoding| D20[Skip file silently]
    D17 -->|File not found| D21[Skip file with warning]
    
    D18 --> CONTINUE_FILE[Continue with next file]
    D19 --> D22[Log: Could not read file {path}]
    D20 --> CONTINUE_FILE
    D21 --> D22
    D22 --> CONTINUE_FILE
    
    D4 --> D23{File write error cause?}
    D23 -->|Permission denied| D24[❌ Permission denied writing to {path}]
    D23 -->|Disk full| D25[❌ Not enough disk space]
    D23 -->|Invalid path| D26[❌ Invalid output path]
    
    D24 --> EXIT1
    D25 --> EXIT1  
    D26 --> EXIT1
    
    D5 --> D27{Directory error cause?}
    D27 -->|Creation failed| D28[❌ Could not create directory]
    D27 -->|Access denied| D29[❌ Directory access denied]
    
    D28 --> EXIT1
    D29 --> EXIT1
    
    E --> E1{Validation type?}
    E1 -->|No files found| E2[No Files Found Flow]
    E1 -->|No matches| E3[No Matches Found Flow]
    E1 -->|Invalid arguments| E4[Invalid Arguments Flow]
    
    E2 --> E5[⚠️ No files found with specified extensions]
    E5 --> E6[Check extension filters and root directories]
    E6 --> EXIT2[process.exit(2)]
    
    E3 --> E7[⚠️ No files matched the given strings]
    E7 --> E8[Check search patterns and file content]
    E8 --> EXIT3[process.exit(3)]
    
    E4 --> E9[Display help message]
    E9 --> E10[Suggest correct usage]
    E10 --> EXIT1
    
    F --> F1{Process type?}
    F1 -->|Clipboard process| F2[Clipboard Error Flow]
    F1 -->|Child process| F3[Child Process Error Flow]
    
    F2 --> F4{Clipboard error cause?}
    F4 -->|Tool not found| F5[⚠️ Clipboard tool not found]
    F4 -->|Process failed| F6[⚠️ Could not copy to clipboard]
    F4 -->|Platform unsupported| F7[⚠️ Clipboard not supported on platform]
    
    F5 --> F8[Silent failure - continue]
    F6 --> F8
    F7 --> F8
    F8 --> CONTINUE_APP[Continue application]
    
    F3 --> F9[Log child process error]
    F9 --> F10[Graceful degradation]
    F10 --> CONTINUE_APP
    
    G --> G1[main().catch() handler]
    G1 --> G2[console.error("Unexpected error:", err)]
    G2 --> G3[Log full stack trace]
    G3 --> EXIT99[process.exit(99)]
    
    CONTINUE --> SUCCESS[Continue Normal Flow]
    CONTINUE_FILE --> SUCCESS
    CONTINUE_APP --> SUCCESS
    
    classDef configError fill:#ffcccc
    classDef fileError fill:#ffffcc
    classDef validationError fill:#ffccff
    classDef processError fill:#ccffcc
    classDef globalError fill:#cccccc
    classDef exitError fill:#ff9999
    classDef continueFlow fill:#99ff99
    
    class C,C1,C2,C3,C4,C5,C6,C7 configError
    class D,D1,D2,D3,D4,D5,D17,D18,D19,D20,D21,D22,D23,D24,D25,D26,D27,D28,D29 fileError
    class E,E1,E2,E3,E4,E5,E6,E7,E8,E9,E10 validationError
    class F,F1,F2,F3,F4,F5,F6,F7,F8,F9,F10 processError
    class G,G1,G2,G3 globalError
    class EXIT1,EXIT2,EXIT3,EXIT99 exitError
    class CONTINUE,CONTINUE_FILE,CONTINUE_APP,SUCCESS continueFlow
```

## Error Categories and Exit Codes

### Configuration Errors (Exit Code 1)
- **Config file not found**: Clear message with file path
- **Config syntax errors**: Line number and description
- **Permission denied**: Suggest running with appropriate permissions
- **Template creation failures**: Specific guidance on resolution

### File Discovery Errors (Exit Code 2)  
- **No files found**: Check extension filters and root directories
- **Invalid root directories**: Verify paths exist and are accessible
- **Glob pattern errors**: Suggest valid pattern syntax

### Content Filtering Errors (Exit Code 3)
- **No content matches**: Check search strings and file content
- **All files excluded**: Review exclude patterns
- **Empty result set**: Suggest broader search criteria

### Unexpected Errors (Exit Code 99)
- **Unhandled exceptions**: Full stack trace logged
- **Programming errors**: Bug report guidance
- **System-level failures**: Generic error message

## Error Recovery Strategies

### Graceful Degradation
```javascript
// File reading errors don't stop processing
try {
  const content = await fs.readFile(filePath, 'utf8');
  // Process content
} catch (err) {
  console.error(`Warning: Could not read file ${relPath}: ${err}`);
  continue; // Skip this file, continue with others
}
```

### User Interaction on Errors
```javascript
// Directory creation with user confirmation
if (!directoryExists) {
  const answer = await promptUser('Create directory? (y/n): ');
  if (answer.toLowerCase() === 'y') {
    await fs.mkdir(dir, { recursive: true });
  } else {
    console.log('❌ Directory creation cancelled.');
    process.exit(1);
  }
}
```

### Silent Failure with Logging
```javascript
// Clipboard operations fail silently
try {
  await copyToClipboard(output);
  console.log('📋 Copied to clipboard!');
} catch (err) {
  // Silent failure - clipboard is convenience feature
  console.log('⚠️  Could not copy to clipboard');
}
```

## Error Message Design Principles

### User-Friendly Messages
- **Emoji indicators**: ❌ for errors, ⚠️ for warnings, ✅ for success
- **Clear descriptions**: Avoid technical jargon
- **Actionable guidance**: Suggest specific remediation steps
- **Context preservation**: Include relevant file paths and parameters

### Consistent Formatting
```
❌ Error: [Brief description]
   Suggestion: [What the user should do]
   
⚠️  Warning: [Issue description]
   Impact: [What this means for the operation]
   
✅ Success: [Confirmation of completed action]
```

## Logging Strategy
- **Errors**: Always logged to stderr with full context
- **Warnings**: Logged to stderr but don't stop execution  
- **Info**: Logged to stderr when stdout is used for output
- **Debug**: No debug logging implemented (opportunity for enhancement)

## Recovery and Continuation
- **Individual file failures**: Log warning, continue processing other files
- **Non-critical feature failures**: Log message, continue main operation
- **Configuration issues**: Immediate exit with clear guidance
- **System resource issues**: Immediate exit with error code