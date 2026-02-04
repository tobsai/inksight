# Contributing to Ghostwriter Pro

Thank you for your interest in contributing to Ghostwriter Pro! This document provides guidelines for contributing to the project.

## Ways to Contribute

### 🐛 Report Bugs

If you find a bug:

1. Check if it's already reported in [Issues](https://github.com/tobsai/ghostwriter-pro/issues)
2. If not, create a new issue with:
   - Device: reMarkable Paper Pro (firmware version)
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots if applicable

### 💡 Suggest Features

Have an idea? Open an issue with:

- Clear description of the feature
- Use case / why it would be helpful
- Any implementation ideas you have

### 📖 Improve Documentation

Documentation improvements are always welcome:

- Fix typos or unclear explanations
- Add examples
- Improve build instructions
- Translate to other languages

### 💻 Submit Code

#### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ghostwriter-pro.git
   ```
3. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

#### Development Setup

See [BUILDING.md](BUILDING.md) for detailed build instructions.

For quick development without the SDK:
```bash
mkdir build && cd build
qmake .. CONFIG+=dev
make
```

#### Code Style

- Follow existing code style
- Use meaningful variable/function names
- Add comments for complex logic
- Keep functions focused and small

**C++ Guidelines:**
- Use C++17 features where appropriate
- Prefer Qt containers over STL where interacting with Qt
- Use `const` and references appropriately
- Document public API with Doxygen-style comments

**QML Guidelines:**
- Keep components modular
- Use property bindings over imperative code where possible
- Follow Qt Quick best practices

#### Testing

Before submitting:

1. Build successfully with no warnings
2. Test on actual Paper Pro if possible
3. Test keyboard input with USB keyboard
4. Verify basic functionality:
   - Type text
   - Save/load documents
   - Use keyboard shortcuts
   - Switch between modes

#### Commit Messages

Follow conventional commits format:
```
type(scope): description

[optional body]
[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style (no functional change)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Build/tooling changes

Examples:
```
feat(editor): add word count display
fix(input): handle keyboard disconnect gracefully
docs(readme): clarify SDK installation steps
```

#### Pull Requests

1. Update your branch with latest main:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

3. Open a PR with:
   - Clear title and description
   - Reference any related issues
   - Screenshots/videos if UI changes

4. Respond to review feedback

## Code of Conduct

### Be Respectful
- Treat everyone with respect
- No harassment, discrimination, or personal attacks
- Constructive criticism only

### Be Collaborative
- Work together towards the project's goals
- Help newcomers get started
- Share knowledge and explain decisions

### Be Patient
- This is a volunteer project
- Reviews and responses take time
- Ask questions if something is unclear

## Recognition

Contributors will be recognized in:
- README.md Contributors section
- Release notes for significant contributions
- Project documentation

## Questions?

- Open an issue for project-related questions
- Check existing issues and documentation first
- Be specific about what you need help with

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Ghostwriter Pro! Your help makes this project better for everyone in the reMarkable community.
