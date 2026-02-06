# InkSight Architecture

## System Overview

InkSight is a TypeScript-based system that bridges reMarkable devices with AI services to transform handwritten ink data into enhanced digital content.

## Core Components

### 1. Ink Capture Layer

#### Cloud API Client (`src/cloud/`)
- **Authentication**: OAuth-style device registration using 8-character code
- **Service Discovery**: Dynamic endpoint resolution via discovery API
- **Document Sync**: Download/upload documents and metadata
- **Format**: Documents stored as UUID-based flat hierarchy

**Key Files**:
- `client.ts` - Main API client with authentication
- `types.ts` - TypeScript interfaces for API responses
- `sync.ts` - Document synchronization logic

#### Device Access (`src/device/`)
Direct SSH/USB access for real-time or offline scenarios:
- **SSH Connection**: Connect to reMarkable via WiFi/USB
- **File System Access**: Read from `/home/root/.local/share/remarkable/xochitl/`
- **Real-time Capture**: Monitor file changes for instant processing

**Key Files**:
- `ssh-client.ts` - SSH connection manager
- `file-watcher.ts` - Monitor filesystem changes
- `usb-client.ts` - USB connection (future)

### 2. Parser Layer (`src/parser/`)

Decodes reMarkable's binary `.rm` file format:

#### File Format Structure
```
- .metadata (JSON) - Document metadata
- .content (JSON) - Structure, pages, layers
- .rm files - Binary stroke data (one per page)
- .pdf/.epub - Original document (if applicable)
```

#### Binary Format (.rm files)
- **Header**: Version info (currently v6)
- **Layers**: Multiple layers per page
- **Lines**: Stroke data with tool type
- **Points**: X, Y, pressure, tilt, speed

**Key Files**:
- `rm-parser.ts` - Binary format decoder
- `metadata-parser.ts` - JSON metadata parser
- `stroke-extractor.ts` - Extract individual strokes
- `types.ts` - Data structure definitions

### 3. AI Transformation Layer (`src/ai/`)

#### AI Provider Abstraction
Unified interface supporting multiple AI providers:
- **OpenAI**: GPT-4 Vision for image-based recognition
- **Anthropic**: Claude for text analysis and summaries
- **Custom Models**: Pluggable architecture for specialized models

**Key Files**:
- `provider.ts` - Base provider interface
- `openai-provider.ts` - OpenAI implementation
- `anthropic-provider.ts` - Anthropic implementation
- `model-selector.ts` - Choose optimal model per task

### 4. Transformer Implementations (`src/transformers/`)

Specific transformation capabilities:

#### Text Recognition
- **Input**: Stroke data or rendered image
- **Process**: 
  1. Render strokes to image if needed
  2. Send to OCR/Vision AI
  3. Extract text with confidence scores
- **Output**: Plain text, markdown, or structured data

#### Diagram Cleanup
- **Input**: Hand-drawn diagrams
- **Process**:
  1. Identify shapes (boxes, arrows, circles)
  2. Straighten lines
  3. Snap to grid
  4. Vectorize output
- **Output**: SVG or cleaned bitmap

#### Content Summarization
- **Input**: Recognized text from multiple pages
- **Process**:
  1. Chunk long documents
  2. Extract key points
  3. Generate hierarchical summary
- **Output**: Markdown summary with sections

#### Smart Metadata Extraction
- **Input**: Note content
- **Process**:
  1. Identify dates, names, tasks
  2. Extract tags and categories
  3. Build knowledge graph
- **Output**: Structured metadata JSON

**Key Files**:
- `text-recognition.ts`
- `diagram-cleanup.ts`
- `summarizer.ts`
- `metadata-extractor.ts`
- `base-transformer.ts` - Abstract base class

### 5. Storage Layer (`src/storage/`)

Local caching and persistence:
- **Document Cache**: Avoid re-downloading
- **Processing Results**: Store AI outputs
- **User Preferences**: Settings per document
- **SQLite Database**: Metadata and search index

**Key Files**:
- `cache.ts` - Document caching
- `database.ts` - SQLite wrapper
- `index-builder.ts` - Full-text search index

## Data Flow

### Basic Flow: Cloud → AI → Export

```
1. User Request
   ↓
2. Cloud API Client fetches document
   ↓
3. Parser decodes .rm files
   ↓
4. Transformer processes data
   ↓
5. AI Provider analyzes content
   ↓
6. Results returned/stored
   ↓
7. Optional: Upload back to cloud
```

### Real-time Flow: Device → AI → Feedback

```
1. Device SSH connection
   ↓
2. File Watcher detects changes
   ↓
3. Parser decodes new strokes
   ↓
4. Transformer processes incrementally
   ↓
5. AI Provider analyzes
   ↓
6. Results pushed to user (webhook/notification)
```

## Tech Stack

### Core
- **TypeScript**: Type safety and modern JS features
- **Node.js**: Runtime environment (v18+)
- **ESM Modules**: Modern module system

### APIs & SDKs
- **axios**: HTTP client for reMarkable API
- **ssh2**: SSH connections to device
- **openai**: OpenAI SDK
- **@anthropic-ai/sdk**: Anthropic Claude SDK

### Data Processing
- **SQLite** (better-sqlite3): Local database
- **sharp**: Image processing/rendering
- **canvas**: Stroke rendering to images

### Development
- **Vitest**: Fast unit testing
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **TypeScript**: Static typing

## Security Considerations

1. **Credentials Storage**: Use environment variables, never commit
2. **Token Refresh**: Implement automatic token renewal
3. **SSH Keys**: Prefer SSH keys over passwords
4. **API Rate Limiting**: Respect reMarkable and AI provider limits
5. **Local Storage**: Encrypt cached documents with sensitive content
6. **Network Security**: Use HTTPS/TLS for all connections

## Scalability Considerations

1. **Batch Processing**: Process multiple documents in parallel
2. **Incremental Updates**: Only process changed pages
3. **Caching Strategy**: Cache parsed data and AI results
4. **Queue System**: Use job queue for long-running tasks (future)
5. **CDN/Edge**: Deploy parsing workers at edge (future)

## Extension Points

### Custom Transformers
Developers can add new transformers by:
1. Extending `BaseTransformer`
2. Implementing `transform()` method
3. Registering in transformer factory

### Custom AI Providers
Add new AI services by:
1. Implementing `AIProvider` interface
2. Handling authentication
3. Mapping requests/responses

### Export Formats
Support new export formats:
1. Implement `Exporter` interface
2. Define format-specific serialization
3. Register in export factory

## Future Enhancements

1. **Real-time Collaboration**: Multiple users on same document
2. **Mobile App**: iOS/Android companion apps
3. **Web Interface**: Browser-based document viewer
4. **Offline Mode**: Full functionality without internet
5. **Plugin System**: Community-contributed transformers
6. **reMarkable Integration**: Native tablet app
7. **Advanced AI**: Fine-tuned models for handwriting
8. **Multi-language**: Support for non-English handwriting

## Development Workflow

1. **Local Development**: Use SSH to test device
2. **Cloud Testing**: Test with cloud API in sandbox
3. **AI Iteration**: Start with simple prompts, refine
4. **Performance**: Profile parsing and AI calls
5. **Testing**: Unit tests for parsers, integration for full flow

## Error Handling

1. **Network Failures**: Retry with exponential backoff
2. **Parse Errors**: Log and skip corrupted documents
3. **AI Failures**: Fallback to simpler models
4. **Authentication**: Clear error messages for token issues
5. **Device Connection**: Detect and handle SSH drops

## Monitoring & Logging

1. **Structured Logging**: Use consistent log format
2. **Metrics**: Track processing times, success rates
3. **Error Reporting**: Aggregate errors for analysis
4. **Usage Analytics**: Document processing statistics
5. **Performance Traces**: Identify bottlenecks

## Configuration Management

All configuration via:
1. **Environment Variables**: Secrets and endpoints
2. **Config Files**: User preferences (`.inksightrc`)
3. **CLI Arguments**: Override defaults
4. **Interactive Setup**: First-run wizard

## Testing Strategy

1. **Unit Tests**: Individual components in isolation
2. **Integration Tests**: Full workflow end-to-end
3. **Fixtures**: Sample .rm files for testing
4. **Mocks**: Mock AI providers for fast tests
5. **Performance Tests**: Benchmark parsing speed
