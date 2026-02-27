# Commands Reference

## Project Management

```bash
gh pr list                    # Open PRs
gh pr list --state merged     # Completed work
gh issue list                 # Open issues
```

## Git

```bash
git checkout -b feature/name  # Create feature branch
git push -u origin feature/   # Push new branch
gh pr create --title "..."    # Create PR
gh pr merge <N> --squash      # Merge PR
```

## Build & Dev

```bash
npm run dev                   # Start Vite frontend + Hono backend (dev mode)
npm run build                 # Production build
npm start                     # Start production server
```

## Testing

```bash
npx vitest run                # Run all tests (single run)
npm test                      # Run tests in watch mode
npx vitest run --coverage     # With coverage report
npx playwright test           # Run E2E tests
```

## Type Checking

```bash
npx vue-tsc --noEmit          # TypeScript type check (includes Vue SFCs)
```

## Docker (Design Stack)

```bash
docker compose up -d          # Start Penpot design stack
docker compose down            # Stop Penpot stack
docker compose down -v         # Stop and remove volumes
```

Penpot UI: http://localhost:9001 | Mail UI: http://localhost:1080
