# Contributing to InkSight

Thank you for your interest in contributing! InkSight is an open-source project and we welcome contributions of all kinds.

## Getting Started

1. **Fork and clone** the repository
2. **Install dependencies**: `npm install`
3. **Read the architecture**: See `ARCHITECTURE.md` to understand the system design
4. **Check the roadmap**: See `ROADMAP.md` for planned features

## Development Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm run test

# Watch mode for development
npm run dev

# Lint code
npm run lint

# Format code
npm run format
```

## Project Structure

```
inksight/
├── src/
│   ├── cloud/          # reMarkable Cloud API
│   ├── device/         # SSH/USB device access
│   ├── parser/         # Binary format parser
│   ├── ai/             # AI provider abstraction
│   ├── transformers/   # Transformation implementations
│   └── storage/        # Caching and persistence
├── tests/              # Unit and integration tests
├── examples/           # Usage examples
└── docs/               # Documentation
```

## How to Contribute

### Reporting Bugs

- Use GitHub Issues
- Include reMarkable device model and software version
- Provide reproduction steps
- Include error messages and logs

### Suggesting Features

- Check the roadmap first
- Open a GitHub Issue with `[Feature]` prefix
- Describe the use case and expected behavior
- Consider implementation details

### Code Contributions

1. **Pick an issue** or create one
2. **Create a branch**: `git checkout -b feature/your-feature`
3. **Write code** following our style guide
4. **Add tests** for new functionality
5. **Update documentation** if needed
6. **Run tests**: `npm run test`
7. **Lint code**: `npm run lint`
8. **Commit**: Use clear, descriptive commit messages
9. **Push** and create a Pull Request

### Code Style

- Use TypeScript strict mode
- Follow the existing code style
- Use meaningful variable names
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Prefer composition over inheritance

### Testing

- Write unit tests for new functions
- Add integration tests for workflows
- Aim for >80% code coverage
- Use fixtures for parser tests
- Mock AI providers for fast tests

### Documentation

- Update README.md for user-facing changes
- Update ARCHITECTURE.md for design changes
- Add JSDoc comments for APIs
- Include examples for new features
- Keep docs in sync with code

## Pull Request Process

1. Update CHANGELOG.md with your changes
2. Ensure all tests pass
3. Update documentation
4. Request review from maintainers
5. Address review feedback
6. Maintainer will merge when approved

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Assume good intentions
- Follow the project's goals

## Questions?

- Open a GitHub Discussion
- Check existing issues and docs first
- Be specific and provide context

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
