# InkSight API Documentation

> TypeScript API for embedding InkSight in your own applications.

---

## Modules

| Module | Path | Description |
|--------|------|-------------|
| [cloud](#cloud) | `src/cloud/` | reMarkable Cloud API client |
| [device](#device) | `src/device/` | SSH access + file monitoring |
| [hybrid](#hybrid) | `src/hybrid/` | Hybrid client + offline detection |
| [ai](#ai) | `src/ai/` | AI providers + cost tracking |
| [renderer](#renderer) | `src/renderer/` | .rm stroke → PNG renderer |
| [recognition](#recognition) | `src/recognition/` | Text recognition pipeline |
| [transformers](#transformers) | `src/transformers/` | Text, diagram, summary, metadata |
| [storage](#storage) | `src/storage/` | SQLite, FTS5, LRU cache |
| [config](#config) | `src/config/` | Configuration, presets, templates |
| [cli](#cli) | `src/cli/` | CLI commands, formatter, setup wizard |

---

## cloud

### `RemarkableCloudClient`

```typescript
import { RemarkableCloudClient } from 'inksight';

const client = new RemarkableCloudClient({ inksightApiKey: '...' });

// Authenticate
const tokens = await client.authenticate(email, password);

// List documents
const docs = await client.listDocuments();

// Download a document
const downloaded = await client.downloadDocument(documentId);

// Transform via cloud API
const job = await client.submitTransform(rmBuffer, 'text');
const result = await client.waitForTransform(job.jobId);
```

**Key types:**

```typescript
interface DocumentMetadata {
  visibleName: string;
  type: 'DocumentType' | 'CollectionType';
  lastModified: string;
  version: number;
  pinned: boolean;
  // ...
}

interface DownloadedDocument {
  metadata: DocumentMetadata;
  content: DocumentContent;
  pages: Uint8Array[];  // binary .rm page files
  pdfData?: Uint8Array;
}
```

---

## device

### `RemarkableSSHClient`

```typescript
import { RemarkableSSHClient } from 'inksight';

const ssh = new RemarkableSSHClient({
  host: '10.11.99.1',
  username: 'root',
  keyPath: '~/.ssh/id_rsa',
});

await ssh.connect();
const files = await ssh.listFiles('/home/root/.local/share/remarkable/xochitl/');
const doc = await ssh.downloadDocument(documentId);
```

### `FileMonitor`

```typescript
import { FileMonitor } from 'inksight';

const monitor = new FileMonitor(ssh, { watchInterval: 5000 });
monitor.on('change', (changes) => {
  console.log('New/modified documents:', changes.map(c => c.id));
});
await monitor.start();
```

### `IncrementalSyncManager`

```typescript
import { IncrementalSyncManager } from 'inksight';

const sync = new IncrementalSyncManager(ssh, localDir);
const result = await sync.sync();
// result.added, result.modified, result.deleted
```

---

## hybrid

### `HybridClient`

```typescript
import { HybridClient } from 'inksight';

const hybrid = new HybridClient({
  ssh: { host: '10.11.99.1', username: 'root' },
  cloud: { /* tokens */ },
  preferSSH: true,
});

const docs = await hybrid.listDocuments();    // SSH first, falls back to cloud
const doc = await hybrid.downloadDocument(id); // same smart routing
```

### `OfflineDetector`

```typescript
import { OfflineDetector } from 'inksight';

const detector = new OfflineDetector();
const isOnline = await detector.isOnline();
```

---

## ai

### `AIProviderRegistry`

```typescript
import { AIProviderRegistry, OpenAIProvider, AnthropicProvider } from 'inksight';

const registry = new AIProviderRegistry();
registry.register(new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }));
registry.register(new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY! }));

// Auto-select provider and run a request
const result = await registry.transform({
  imageBuffer: pageImage,
  prompt: 'Extract all handwritten text.',
});
```

### `CostTracker`

```typescript
import { CostTracker } from 'inksight';

const tracker = new CostTracker('./costs.json');
tracker.record({ provider: 'openai', costUsd: 0.012, tokens: 1000 });
const total = tracker.totalCostUsd;
```

---

## renderer

### `DocumentRenderer`

```typescript
import { DocumentRenderer } from 'inksight';

const renderer = new DocumentRenderer();
const buffer = await renderer.renderPage(rmFileBytes, { scale: 1.5 });
// buffer is a PNG Buffer
```

### `PageRenderer`

```typescript
import { PageRenderer, parseRMFile } from 'inksight';

const parsed = parseRMFile(rmBuffer);
const renderer = new PageRenderer({ width: 1404, height: 1872 });
const png = await renderer.render(parsed.pages[0]);
```

### `RenderCache`

```typescript
import { RenderCache } from 'inksight';

const cache = new RenderCache({ maxEntries: 50, ttlMs: 60000 });
const cached = cache.get(documentId, pageIndex);
if (!cached) {
  const rendered = await renderer.renderPage(bytes);
  cache.set(documentId, pageIndex, rendered);
}
```

---

## recognition

### `RecognitionPipeline`

```typescript
import { RecognitionPipeline } from 'inksight';

const pipeline = new RecognitionPipeline(renderer, aiRegistry);
const result = await pipeline.recognizeDocument(downloadedDoc);
// result.pages[0].text — recognized text
// result.language     — detected language
```

### `OutputFormatter` (recognition)

```typescript
import { OutputFormatter as RecognitionFormatter } from 'inksight';

const fmt = new RecognitionFormatter();
const markdown = fmt.toMarkdown(recognitionResult);
const plain = fmt.toPlain(recognitionResult);
```

---

## transformers

### `TextTransformer`

```typescript
import { TextTransformer } from 'inksight';

const transformer = new TextTransformer(renderer, aiRegistry, {
  detectParagraphs: true,
  detectLists: true,
  outputFormat: 'markdown',
});

const result = await transformer.transform(downloadedDoc, pageIndex: 0);
// result.text, result.wordCount, result.lists, result.paragraphs
```

### `DiagramTransformer`

```typescript
import { DiagramTransformer } from 'inksight';

const transformer = new DiagramTransformer(renderer, aiRegistry, {
  outputFormat: 'mermaid',
  diagramType: 'auto',
});

const result = await transformer.transform(downloadedDoc, 0);
// result.output — Mermaid syntax
```

### `SummarizationTransformer`

```typescript
import { SummarizationTransformer } from 'inksight';

const transformer = new SummarizationTransformer(renderer, aiRegistry, {
  style: 'bullets',
  maxLength: 200,
  includeActionItems: true,
});

const result = await transformer.transform(downloadedDoc);
// result.summary, result.keyPoints, result.actionItems
```

### `MetadataTransformer`

```typescript
import { MetadataTransformer } from 'inksight';

const transformer = new MetadataTransformer(renderer, aiRegistry);
const metadata = await transformer.transform(downloadedDoc);
// metadata.dates, metadata.people, metadata.tags, metadata.actionItems
```

### `TransformerRegistry`

```typescript
import { TransformerRegistry } from 'inksight';

const registry = new TransformerRegistry();
registry.registerText(textTransformer);
registry.registerDiagram(diagramTransformer);
registry.registerSummarization(summaryTransformer);
registry.registerMetadata(metadataTransformer);

const result = await registry.runAll(downloadedDoc, ['text', 'summary']);
// result.text, result.summary, result.totalCostUsd, result.totalDurationMs
```

---

## storage

### `InkSightDatabase`

```typescript
import { InkSightDatabase } from 'inksight';

const db = new InkSightDatabase('~/.inksight/inksight.db');

// Store a document
db.upsertDocument({
  id: 'doc-1',
  name: 'Meeting Notes',
  type: 'document',
  createdAt: new Date().toISOString(),
  // ...
});

// Store a transform result
db.saveTransformResult({
  documentId: 'doc-1',
  pageIndex: 0,
  transformType: 'text',
  output: JSON.stringify(result),
  costUsd: 0.012,
  durationMs: 800,
  // ...
});

// Retrieve
const doc = db.getDocument('doc-1');
const results = db.getTransformResults('doc-1');
```

### `SearchIndex`

```typescript
import { SearchIndex } from 'inksight';

const index = new SearchIndex(db);

index.indexDocument({
  documentId: 'doc-1',
  pageIndex: 0,
  transformType: 'text',
  text: 'The quick brown fox...',
  tags: ['meeting', 'q4'],
});

const results = index.search('brown fox', { limit: 5 });
const byTag = index.searchByTag('meeting');
```

### `CacheManager`

```typescript
import { CacheManager } from 'inksight';

const cache = new CacheManager<Buffer>({
  maxEntries: 100,
  maxSizeBytes: 50 * 1024 * 1024,  // 50 MB
  ttlMs: 10 * 60 * 1000,           // 10 min
});

cache.set('key', buffer);
const hit = cache.get('key');  // Buffer or undefined
const stats = cache.stats();   // hitRate, entryCount, totalSizeBytes
```

### `DocumentCache`

```typescript
import { DocumentCache } from 'inksight';

const docCache = new DocumentCache({ maxEntries: 200 });
docCache.setPage('doc-1', 0, pngBuffer);
const page = docCache.getPage('doc-1', 0);
console.log(`Cache: ${docCache.getUsageMb().toFixed(1)} MB`);
```

---

## config

### `ConfigManager`

```typescript
import { ConfigManager } from 'inksight';

const mgr = new ConfigManager('~/.inksight/config.json');

// Load from file (returns defaults if file doesn't exist)
const config = mgr.load();

// Load with env overrides
const config = mgr.loadWithEnvOverrides();

// Validate
const { valid, errors } = mgr.validate(config);

// Save
mgr.save(config);

// Defaults
const defaults = ConfigManager.defaults();
```

**`InkSightConfig` interface:**

```typescript
interface InkSightConfig {
  connection: {
    mode: 'cloud' | 'ssh' | 'hybrid';
    cloud?: { email: string; password: string };
    ssh?: { host: string; username: string; keyPath?: string; port?: number };
  };
  ai: {
    provider: 'openai' | 'anthropic' | 'auto';
    openaiApiKey?: string;
    anthropicApiKey?: string;
    defaultModel?: string;
    maxCostPerDocument?: number;
  };
  transforms: {
    defaultType: 'text' | 'diagram' | 'summary' | 'metadata';
    outputDir: string;
    outputFormat: 'plain' | 'markdown' | 'structured';
  };
  storage: {
    dbPath: string;
    cacheDir: string;
    maxCacheMb: number;
  };
}
```

### `PRESETS`

```typescript
import { PRESETS, getPreset, listPresets } from 'inksight';

const preset = getPreset('full-analysis');
// preset.transforms → ['text', 'summary', 'metadata']
// preset.options → { outputFormat: 'markdown', ... }

for (const name of listPresets()) {
  console.log(name, PRESETS[name].description);
}
```

### `EXPORT_TEMPLATES`

```typescript
import { EXPORT_TEMPLATES, getExportTemplate } from 'inksight';

const tpl = getExportTemplate('obsidian-note');
const markdown = tpl.template(transformResult, extractedMetadata);
// Produces Obsidian-compatible Markdown with YAML frontmatter
```

---

## cli

### `InkSightCLI`

```typescript
import { InkSightCLI } from 'inksight';

const cli = new InkSightCLI();
await cli.run(process.argv);
```

**Subclassing for custom service wiring:**

```typescript
class MyCLI extends InkSightCLI {
  protected override async fetchDocumentList(config, limit) {
    return myHybridClient.listDocuments({ limit });
  }

  protected override async transformDocument(config, docId, type, page) {
    const doc = await myClient.downloadDocument(docId);
    return await myTransformerRegistry.run(doc, type, page);
  }
}
```

### `SetupWizard`

```typescript
import { SetupWizard, ConfigManager } from 'inksight';

const wizard = new SetupWizard(new ConfigManager());
const config = await wizard.run();
// Runs interactive prompts, saves config, returns InkSightConfig
```

### `OutputFormatter` (cli)

```typescript
import { OutputFormatter } from 'inksight';

const fmt = new OutputFormatter();

console.log(fmt.formatDocumentList(docs));
console.log(fmt.formatTransformResult(result));
console.log(fmt.formatSearchResults(searchResults));
console.log(fmt.formatStatus({ mode: 'hybrid', cloudConnected: true }));
console.log(fmt.formatError(new Error('Connection refused')));
```
