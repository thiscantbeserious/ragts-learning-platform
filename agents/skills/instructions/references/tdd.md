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

Tests are co-located with source code in `src/` and standalone tests live in `tests/` at the project root.

```text
src/
  server/processing/
    scrollback-dedup.test.ts    # Co-located unit tests
    session-pipeline.test.ts
  ...
tests/
  fixtures/                     # Test data files (.cast, etc.)
  ...
```

**Naming:** `<module>.test.ts` for test files, descriptive behavior names for test cases.

## Vitest Configuration

- **Default environment:** `happy-dom` (client-side tests, Vue components)
- **Server tests:** Use `// @vitest-environment node` pragma for backend code that needs Node APIs
- Run with `npx vitest run` (single run) or `npm test` (watch mode)

## Snapshot Testing

Snapshot tests lock expected output to catch regressions. **Never update snapshots without explicit user approval.**

```typescript
// Inline snapshot
expect(result).toMatchInlineSnapshot(`...`);

// File snapshot (creates .snap file)
expect(result).toMatchSnapshot();
```

If a snapshot test fails:
1. Investigate why — the failure likely means source code changed behavior
2. Report the diff (old vs new) to the user
3. Only run `--update` after user confirms the new output is correct
4. Commits with snapshot changes require `[snapshot-update]` in the commit message (enforced by git hook)
