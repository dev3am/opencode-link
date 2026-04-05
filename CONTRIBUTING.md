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
npm run test        # Run tests with bun
```

## Pull Request Process

1. Create a feature branch from `dev`
2. Make your changes with tests if applicable
3. Ensure all tests pass (`npm run test`)
4. Ensure the build succeeds (`npm run build`)
5. Open a pull request with a clear description of the change

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
