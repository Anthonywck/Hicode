# Testing Guide

## Overview

This project uses a comprehensive testing strategy combining unit tests and property-based tests to ensure code correctness.

## Testing Stack

### Jest
- **Purpose**: Primary testing framework
- **Configuration**: `jest.config.js`
- **Features**:
  - TypeScript support via ts-jest
  - Code coverage reporting
  - Watch mode for development
  - Timeout configuration for long-running tests

### fast-check
- **Purpose**: Property-based testing
- **Use Cases**:
  - Testing universal properties across many inputs
  - Validating correctness properties from design document
  - Finding edge cases automatically
- **Configuration**: Minimum 100 iterations per property test

### axios
- **Purpose**: HTTP client for API requests
- **Use Cases**:
  - Making requests to AI model APIs
  - Testing API client adapters
  - Integration testing with external services

### eventsource
- **Purpose**: Server-Sent Events (SSE) client
- **Use Cases**:
  - Handling streaming responses from AI models
  - Testing real-time data flows
  - Implementing chat streaming functionality

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Writing Tests

### Unit Tests

```typescript
describe('MyComponent', () => {
  it('should do something specific', () => {
    const result = myFunction(input);
    expect(result).toBe(expected);
  });
});
```

### Property-Based Tests

```typescript
import * as fc from 'fast-check';

describe('MyComponent Properties', () => {
  it('Property 1: Universal behavior', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer(), (str, num) => {
        // Test that holds for ALL inputs
        const result = myFunction(str, num);
        return result.isValid();
      }),
      { numRuns: 100 } // Minimum 100 iterations
    );
  });
});
```

## Test Organization

```
src/
├── api/
│   ├── client.ts
│   └── client.test.ts          # Unit tests
├── context/
│   ├── manager.ts
│   └── manager.test.ts         # Unit + property tests
└── test-setup.test.ts          # Framework verification
```

## Coverage Requirements

- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

## Best Practices

1. **Test Naming**: Use descriptive names that explain what is being tested
2. **Property Tests**: Always include "Property N:" prefix and reference design document
3. **Isolation**: Each test should be independent and not rely on others
4. **Mocking**: Avoid mocks when possible; test real functionality
5. **Timeout**: Property tests may need longer timeouts (configured to 10s)

## Troubleshooting

### Tests Timeout
- Increase `testTimeout` in jest.config.js
- Check for infinite loops or blocking operations

### TypeScript Errors
- Ensure tsconfig.json includes test files
- Check that @types packages are installed

### Coverage Issues
- Review `collectCoverageFrom` patterns in jest.config.js
- Exclude test files and type definitions
