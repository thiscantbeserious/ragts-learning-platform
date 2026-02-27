# Verification

**MANDATORY: Run before every PR/commit**

## Quick Check

Run all applicable checks before committing:

```bash
npx vitest run                # Unit + integration tests
npx vue-tsc --noEmit          # Type check (TypeScript + Vue SFCs)
npx playwright test           # E2E tests (if applicable)
```

## Requirements

- All tests must pass
- No TypeScript type errors (`vue-tsc --noEmit` clean)
- Code formatted per project standards
- PR must pass CI before merge
