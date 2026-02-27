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
docker compose up -d          # Start Penpot + MCP server (7 services)
docker compose up -d --build  # Rebuild MCP server image (after upstream updates)
docker compose down            # Stop all services
docker compose down -v         # Stop and remove volumes
```

Penpot UI: http://localhost:9001 | MCP: http://localhost:4401/mcp | Plugin: http://localhost:4400/manifest.json | Mail: http://localhost:1080

Note: First `docker compose up -d` builds the MCP server from source (may take a few minutes). Subsequent starts use the cached image.

## MCP Servers

```bash
claude mcp add penpot -t http http://localhost:4401/mcp   # Register Penpot MCP (requires Penpot running)
```
