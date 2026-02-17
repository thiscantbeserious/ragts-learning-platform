# Test-Driven Development (TDD)

## Red-Green-Refactor Cycle

1. Write failing test first (behavior-focused)
2. Run test - must fail
3. Write minimal code to pass
4. Run test - must pass
5. Refactor if needed
6. Format code
7. Lint
8. Commit

## Testing Requirements

- All unit tests must pass
- Coverage should be >=80%
- Integration/E2E tests must pass before PR

## Writing Good Tests

- Test behavior, not implementation
- One assertion per test when possible
- Use descriptive test names
- Test edge cases and error conditions

## Test Organization

Tests should be separate from source code when feasible. Prefer integration-style tests that exercise real behavior over heavily mocked unit tests.

```
tests/
  unit/           # Unit tests by module
  integration/    # Integration tests
  e2e/            # End-to-end tests
  fixtures/       # Test data files
```

**Naming:** `<module>.test.*` or `<module>_test.*` for files, descriptive behavior names for functions.

## Tech Stack Note

Specific test frameworks, snapshot testing, and commands will be defined once the tech stack is chosen.
