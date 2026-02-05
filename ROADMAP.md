# InkSight Roadmap

Development plan for InkSight — AI-powered ink transformation for reMarkable Paper Pro.

## Current Status: 🚧 Pre-Alpha

Core architecture is being designed. Research phase complete.

---

## Phase 1: Foundation (Weeks 1-2)

**Goal**: Capture ink from the Paper Pro screen and display it back.

### Tasks

- [ ] **Project Setup**
  - [x] Create repository structure
  - [x] Document research findings
  - [ ] Set up development environment with Chiappa SDK
  - [ ] Create Qt Quick project skeleton
  - [ ] Test deployment to device

- [ ] **Ink Capture**
  - [ ] Read pen strokes from Wacom digitizer via evdev
  - [ ] Capture page as image (screenshot of e-ink framebuffer)
  - [ ] Store stroke data in memory for processing
  - [ ] Handle different pen types (fine, thick, highlighter, eraser)

- [ ] **Basic Display**
  - [ ] Create full-screen QML canvas
  - [ ] Render captured strokes back to screen
  - [ ] Test e-ink refresh behavior
  - [ ] Implement partial screen updates

- [ ] **Device Integration**
  - [ ] Detect Paper Pro hardware
  - [ ] Access Xochitl notebook data (if applicable)
  - [ ] Handle screen resolution and DPI
  - [ ] Basic touch gesture handling

### Deliverable
An application that captures what you write/draw and can replay it.

---

## Phase 2: AI Integration (Weeks 3-5)

**Goal**: Send captured ink to AI and display transformation results.

### Tasks

- [ ] **Page-to-Image Pipeline**
  - [ ] Capture current page as PNG/JPEG
  - [ ] Optimize image size for API upload (compression, cropping)
  - [ ] Handle multi-page captures
  - [ ] Region selection (transform part of a page)

- [ ] **AI Provider Client**
  - [ ] OpenAI Vision API integration (GPT-4o)
  - [ ] Anthropic Vision API integration (Claude)
  - [ ] Ollama local model support
  - [ ] Provider abstraction layer
  - [ ] API key secure storage

- [ ] **Transformation Engine**
  - [ ] Prompt template system for each transformation type
  - [ ] Handwriting-to-text (OCR via vision AI)
  - [ ] Sketch-to-diagram (Mermaid code generation)
  - [ ] Notes-to-summary
  - [ ] Custom prompt input
  - [ ] Result parsing and formatting

- [ ] **Result Display**
  - [ ] Text result rendering on e-ink
  - [ ] Mermaid diagram rendering (via mermaid.ink or local)
  - [ ] Image result display
  - [ ] Accept/reject/iterate workflow
  - [ ] Side-by-side comparison (original ink vs. result)

### Deliverable
Write something on the page, trigger a transform, see AI-generated results.

---

## Phase 3: Transformation Palette (Weeks 6-7)

**Goal**: Polish the transformation UX with a rich palette of options.

### Tasks

- [ ] **Palette UI**
  - [ ] Grid/list of available transformations
  - [ ] Icons and descriptions for each
  - [ ] Quick access via gesture or button
  - [ ] Custom prompt input field
  - [ ] Recent/favorite transforms

- [ ] **Built-in Transforms**
  - [ ] 📝 Transcribe (handwriting → text)
  - [ ] 🔄 Process Flow (sketch → flowchart)
  - [ ] 📊 Sequence Diagram
  - [ ] 🧠 Mind Map
  - [ ] 📋 Summarize
  - [ ] 📖 Expand
  - [ ] ✏️ Clean Up (refine drawings)
  - [ ] 🌐 Translate
  - [ ] • Bullet Points
  - [ ] ☑️ Extract Actions
  - [ ] ❓ Generate Questions

- [ ] **Region Selection**
  - [ ] Lasso tool to select ink region
  - [ ] Touch-based rectangular selection
  - [ ] Transform selected region only
  - [ ] Full-page transform option

- [ ] **History & Undo**
  - [ ] Transformation history log
  - [ ] Undo last transformation
  - [ ] Compare before/after
  - [ ] Re-run with different prompt

### Deliverable
Intuitive palette-driven transformation workflow with region selection.

---

## Phase 4: Output & Export (Weeks 8-9)

**Goal**: Make transformation results useful beyond the device.

### Tasks

- [ ] **Output Formats**
  - [ ] Save text results as .txt / .md files
  - [ ] Save diagrams as .svg / .png
  - [ ] Export to PDF
  - [ ] Combine into notebook-style documents

- [ ] **Integration**
  - [ ] Save results back into reMarkable notebooks (if possible)
  - [ ] WiFi transfer to computer
  - [ ] Optional cloud sync endpoint
  - [ ] Clipboard-style sharing

- [ ] **Batch Processing**
  - [ ] Transform entire notebooks
  - [ ] Queue multiple pages for transformation
  - [ ] Background processing with progress indicator

### Deliverable
Transformed content is exportable and integrable with other tools.

---

## Phase 5: Polish & UX (Weeks 10-11)

**Goal**: Make it feel native and reliable.

### Tasks

- [ ] **E-ink Optimization**
  - [ ] Minimize screen flicker during transforms
  - [ ] Progressive result rendering
  - [ ] Smart refresh strategies
  - [ ] Battery efficiency

- [ ] **Gesture & Touch**
  - [ ] Natural gesture triggers (e.g., draw a circle → transform contents)
  - [ ] Swipe to dismiss results
  - [ ] Pinch to zoom results
  - [ ] Long-press for context menu

- [ ] **Settings & Configuration**
  - [ ] Provider selection UI
  - [ ] API key management
  - [ ] Default transformation preferences
  - [ ] Network/WiFi status indicator

- [ ] **Error Handling**
  - [ ] Offline mode (queue transforms for when WiFi available)
  - [ ] API error recovery
  - [ ] Graceful degradation
  - [ ] User-friendly error messages

### Deliverable
A polished, reliable application that feels native to the Paper Pro.

---

## Phase 6: Distribution (Week 12+)

**Goal**: Get it into people's hands.

### Tasks

- [ ] **Release**
  - [ ] GitHub releases with pre-built binaries
  - [ ] Installation script
  - [ ] Version management and changelog
  - [ ] Toltec package (when Paper Pro supported)

- [ ] **Documentation**
  - [ ] User guide with screenshots
  - [ ] Video demo
  - [ ] Troubleshooting guide
  - [ ] Developer docs for contributors

- [ ] **Community**
  - [ ] Beta testing program
  - [ ] Feature request tracking
  - [ ] Community transform templates/prompts

### Deliverable
Easy-to-install app with active community.

---

## Future Ideas

- **Live Transform**: Real-time transformation as you write (streaming)
- **Pen Gestures**: Custom pen gestures to trigger specific transforms
- **Multi-page Context**: AI considers multiple pages for better context
- **Voice Annotations**: Combine voice + ink for richer transforms
- **Template Library**: Community-shared transformation prompts
- **Local AI**: On-device inference for basic OCR (no WiFi needed)
- **Collaboration**: Share transformed pages with others
- **Keyboard Input**: Optional USB keyboard support for text entry alongside ink

---

## Success Metrics

1. **Accuracy**: Handwriting-to-text works reliably for typical handwriting
2. **Speed**: Transform results appear within 5-10 seconds
3. **Usefulness**: Users prefer InkSight over manual transcription
4. **Reliability**: No crashes during typical use sessions
5. **Battery**: Minimal impact on battery life
