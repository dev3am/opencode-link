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

Open a [GitHub issue](https://github.com/dev3am/opencode-link/issues) with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Provider (Discord / Slack / Telegram)

## Release Process (Maintainers Only)

### Prerequisites

- GitHub repo Settings → Secrets → `NPM_TOKEN` (npm Automation token)
- GitHub repo Settings → Rules → Ruleset with CI status checks required
- GitHub repo Settings → Environments → `Release`

### Deploy

```bash
npm version patch        # Bumps version, creates commit + tag
git push && git push --tags   # Push triggers CD → npm publish
```

The CD workflow (`.github/workflows/deploy.yml`) automatically:
1. Checks out the code at the tagged version
2. Installs dependencies and builds
3. Publishes to npm with provenance

### Version Policy

- **Contributors**: Do not modify `package.json` version. Focus on code and tests.
- **Maintainers**: Run `npm version patch` (or `minor`, `major`) on `main` after merge to trigger deployment.
