# Contributing

Thanks for your interest in contributing to opencode-link!

## Development Setup

1. Fork and clone the repository
2. Install dependencies:

```bash
npm install
```

3. Set up local dev environment:

```bash
npm run setup:dev
```

## Development

```bash
npm run dev         # Watch mode (auto-rebuild on changes)
npm run build       # Build once
bun test            # Run tests
bun run lint        # Lint check
bun run fmt         # Auto-format code
bun run check       # Run all checks (test + lint + format + typecheck + build)
```

## Pull Request Process

1. Create a short-lived feature branch from `main` (e.g. `feature/add-slack`, `fix/queue-bug`)
2. Make your changes with tests if applicable
3. Run `bun run check` to verify all checks pass (test, lint, format, typecheck, build)
4. Open a pull request against `main` with a clear description of the change

CI will automatically run lint, format check, typecheck, test, and build on your PR. All checks must pass before merge.

## Code Style

- TypeScript with strict mode enabled
- Follow existing patterns in the codebase
- Keep the public API surface minimal — most logic lives in `src/providers/`

## Reporting Issues

Open a [GitHub issue](https://github.com/jin-chillo/opencode-link/issues) with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Provider (Discord / Slack / Telegram)
