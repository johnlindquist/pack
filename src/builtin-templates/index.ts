/**
 * Built-in templates for packx
 */

export interface BuiltinTemplate {
  name: string;
  description?: string;
  variables?: Record<string, string>;
  content: string;
}

export const BUILTIN_TEMPLATES: Record<string, BuiltinTemplate> = {
  review: {
    name: 'review',
    description: 'Code review prompt',
    content: `Review the following code for:

1. **Code Quality**
   - Readability and maintainability
   - Naming conventions
   - Code organization

2. **Potential Issues**
   - Bugs or logic errors
   - Edge cases not handled
   - Performance concerns

3. **Best Practices**
   - Design patterns usage
   - Error handling
   - Security considerations

4. **Suggestions**
   - Improvements to consider
   - Refactoring opportunities

{{#if language}}
Language context: {{language}}
{{/if}}

Please provide specific, actionable feedback with code examples where appropriate.`
  },

  tests: {
    name: 'tests',
    description: 'Generate unit tests for the code',
    variables: { framework: 'jest' },
    content: `Write comprehensive unit tests for the following code using {{framework}}.

Requirements:
- Test all public functions and methods
- Include edge cases and boundary conditions
- Mock external dependencies appropriately
- Aim for >80% code coverage
- Use descriptive test names that explain the expected behavior

{{#if language}}
Language: {{language}}
{{/if}}

Structure:
- Group related tests using describe blocks
- Use beforeEach/afterEach for setup/teardown where needed
- Include both positive and negative test cases`
  },

  refactor: {
    name: 'refactor',
    description: 'Refactoring suggestions prompt',
    content: `Analyze the following code and suggest refactoring improvements.

Focus areas:
1. **Code Smells** - Long methods, duplicated code, complex conditionals, deep nesting
2. **Design Improvements** - SRP, dependency injection, interface extraction
3. **Modernization** - Modern language features, deprecated patterns, performance

{{#if language}}
Language: {{language}}
{{/if}}

For each suggestion: explain WHY, show BEFORE/AFTER, note trade-offs.`
  },

  explain: {
    name: 'explain',
    description: 'Code explanation prompt',
    content: `Explain the following code in detail.

Please cover:
1. **Overview** - What does this code do? What problem does it solve?
2. **Key Components** - Main functions/classes, data structures, algorithms
3. **Flow** - How does data flow? What is the execution sequence?
4. **Dependencies** - External libraries used and why

{{#if language}}
Language: {{language}}
{{/if}}

Use clear, beginner-friendly language while being technically accurate.`
  },

  bugs: {
    name: 'bugs',
    description: 'Find potential bugs prompt',
    content: `Analyze the following code for potential bugs and issues.

Check for:
1. **Logic Errors** - Off-by-one, incorrect comparisons, infinite loops
2. **Null/Undefined Issues** - Null dereferences, uninitialized variables
3. **Resource Management** - Memory leaks, unclosed resources, race conditions
4. **Error Handling** - Unhandled exceptions, swallowed errors
5. **Security Vulnerabilities** - Injection risks, unsafe data handling

{{#if language}}
Language: {{language}}
{{/if}}

For each issue: describe the bug, show problematic code, provide a fix.`
  },

  security: {
    name: 'security',
    description: 'Security audit prompt',
    content: `Perform a security audit on the following code.

Check for:
1. **Injection Vulnerabilities** - SQL, command, XSS, template injection
2. **Authentication & Authorization** - Weak auth, missing checks, session issues
3. **Data Protection** - Sensitive data exposure, insecure storage
4. **Input Validation** - Missing sanitization, type confusion
5. **Configuration** - Hardcoded secrets, debug mode, insecure defaults

{{#if language}}
Language: {{language}}
{{/if}}

Rate findings by severity (Critical/High/Medium/Low) and provide remediation.`
  },

  document: {
    name: 'document',
    description: 'Generate documentation prompt',
    content: `Generate comprehensive documentation for the following code.

Include:
1. **Module Overview** - Purpose, responsibility, key concepts
2. **API Documentation** - Signatures, parameters, returns, exceptions
3. **Usage Examples** - Basic usage, common patterns, edge cases
4. **Dependencies** - Required imports, environment setup

{{#if language}}
Language: {{language}}
Format: Use {{language}}-appropriate doc comment style
{{/if}}

Follow documentation best practices for this language/framework.`
  },

  optimize: {
    name: 'optimize',
    description: 'Performance optimization prompt',
    content: `Analyze the following code for performance optimization opportunities.

Focus on:
1. **Time Complexity** - Algorithm efficiency, loop optimizations, caching
2. **Space Complexity** - Memory usage, data structure choices
3. **I/O Performance** - Database queries, network calls, file operations
4. **Concurrency** - Parallelization, async/await, thread safety

{{#if language}}
Language: {{language}}
{{/if}}

For each optimization: explain bottleneck, provide solution, estimate improvement.`
  }
};
