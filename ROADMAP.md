# Ghostwriter Pro Roadmap

This document outlines the development plan for Ghostwriter Pro.

## Current Status: 🚧 Pre-Alpha

The project is in early development. Core architecture is being designed.

---

## Phase 1: Foundation (Weeks 1-2)

**Goal**: Get a working application that displays typed text on the Paper Pro screen.

### Tasks

- [ ] **Project Setup**
  - [x] Create repository structure
  - [x] Document research findings
  - [ ] Set up development environment with Chiappa SDK
  - [ ] Create Qt Quick project skeleton
  - [ ] Test deployment to device

- [ ] **Basic Display**
  - [ ] Create full-screen QML window
  - [ ] Display static text on e-ink screen
  - [ ] Test screen refresh behavior
  - [ ] Choose appropriate fonts for e-ink

- [ ] **Keyboard Input**
  - [ ] Detect connected USB keyboards
  - [ ] Capture keyboard events via evdev
  - [ ] Map key codes to characters
  - [ ] Display typed characters on screen

- [ ] **Basic File I/O**
  - [ ] Create default document directory
  - [ ] Save text to file on Ctrl+S
  - [ ] Load text from file on startup
  - [ ] Handle file errors gracefully

### Deliverable
A minimal application that lets you type text and saves it to a file.

---

## Phase 2: Editor Core (Weeks 3-4)

**Goal**: Implement a proper text editor with cursor and editing capabilities.

### Tasks

- [ ] **Cursor Management**
  - [ ] Implement cursor position tracking
  - [ ] Display cursor (blinking or static)
  - [ ] Arrow key navigation
  - [ ] Handle line boundaries

- [ ] **Text Editing**
  - [ ] Insert text at cursor
  - [ ] Delete (backspace and delete keys)
  - [ ] Line breaks (Enter key)
  - [ ] Word-level navigation (Ctrl+Arrow)

- [ ] **Undo/Redo System**
  - [ ] Implement edit history stack
  - [ ] Ctrl+Z for undo
  - [ ] Ctrl+Y for redo
  - [ ] Reasonable history limit

- [ ] **Word Wrapping**
  - [ ] Calculate text width
  - [ ] Implement soft wrapping
  - [ ] Handle window resize
  - [ ] Maintain cursor position through reflow

### Deliverable
A functional text editor with full cursor control and undo support.

---

## Phase 3: Features (Weeks 5-6)

**Goal**: Add the features that make Ghostwriter Pro useful.

### Tasks

- [ ] **Markdown Support**
  - [ ] Integrate markdown parser (e.g., sundown, cmark)
  - [ ] Create preview renderer
  - [ ] Toggle between edit/preview modes
  - [ ] Syntax highlighting (basic)

- [ ] **Document Management**
  - [ ] List documents in directory
  - [ ] Document picker UI
  - [ ] Create new documents
  - [ ] Delete documents (with confirmation)

- [ ] **Quick Switcher**
  - [ ] Ctrl+K opens switcher
  - [ ] Fuzzy search document names
  - [ ] Create new document from switcher
  - [ ] Recent documents priority

- [ ] **Font Controls**
  - [ ] Ctrl++ increase font size
  - [ ] Ctrl+- decrease font size
  - [ ] Persist font preference
  - [ ] Multiple font options

- [ ] **Settings**
  - [ ] Settings persistence
  - [ ] Default document directory
  - [ ] Auto-save interval
  - [ ] Font preferences

### Deliverable
A feature-complete writing application with markdown and file management.

---

## Phase 4: Polish (Weeks 7-8)

**Goal**: Optimize for real-world use on e-ink.

### Tasks

- [ ] **E-ink Optimization**
  - [ ] Minimize unnecessary refreshes
  - [ ] Implement partial updates where possible
  - [ ] Ghost reduction strategies
  - [ ] Test with extended use

- [ ] **Performance**
  - [ ] Profile application
  - [ ] Optimize text rendering
  - [ ] Reduce memory footprint
  - [ ] Battery usage testing

- [ ] **Error Handling**
  - [ ] Graceful failure modes
  - [ ] User-friendly error messages
  - [ ] Crash recovery (auto-save)
  - [ ] Logging for debugging

- [ ] **Documentation**
  - [ ] User manual
  - [ ] Installation guide
  - [ ] Troubleshooting guide
  - [ ] Developer documentation

### Deliverable
A polished, reliable application ready for wider testing.

---

## Phase 5: Distribution (Week 9+)

**Goal**: Make the application available to the community.

### Tasks

- [ ] **Release Management**
  - [ ] Create release binaries
  - [ ] GitHub releases with assets
  - [ ] Version numbering scheme
  - [ ] Changelog maintenance

- [ ] **Installation**
  - [ ] Installation script
  - [ ] Update mechanism
  - [ ] Systemd service file (optional)
  - [ ] Integration with launchers (when available)

- [ ] **Community**
  - [ ] Toltec package (when Paper Pro supported)
  - [ ] Community testing program
  - [ ] Issue tracking and response
  - [ ] Feature request tracking

### Deliverable
Easy-to-install application with community support infrastructure.

---

## Future Ideas

Features to consider after the initial release:

- **Cloud Sync**: Optional sync to reMarkable cloud or other services
- **Export**: PDF, DOCX, HTML export
- **Themes**: Multiple color schemes for different lighting
- **Folio Support**: Type Folio keyboard support (if different from USB)
- **Touch Integration**: Touch-based scrolling and selection
- **Pen Annotations**: Allow pen markup on typed documents
- **Search**: Find and replace functionality
- **Split View**: Edit and preview side by side
- **Git Integration**: Version control for documents
- **Plugins**: Extensibility system for community features

---

## Success Metrics

The project will be considered successful when:

1. **Usability**: Users can write a 1000+ word document comfortably
2. **Reliability**: No crashes during typical use sessions
3. **Performance**: Typing feels responsive (<100ms latency)
4. **Battery**: Does not noticeably impact battery life
5. **Community**: Active users providing feedback and contributions

---

## Contributing

Want to help? Check the current phase and pick up an unchecked task. See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.
