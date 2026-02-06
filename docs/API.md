# InkSight API Documentation

## Cloud Client

### RemarkableCloudClient

Connect to the reMarkable Cloud API.

```typescript
import { RemarkableCloudClient } from 'inksight';

const client = new RemarkableCloudClient({
  deviceToken: 'your-device-token',
  userToken: 'your-user-token',
});

// List all documents
const documents = await client.listDocuments();

// Download a document
const doc = await client.downloadDocument(documentId);
```

## Device Client

### RemarkableSSHClient

Connect directly to your reMarkable device via SSH.

```typescript
import { RemarkableSSHClient } from 'inksight';

const client = new RemarkableSSHClient({
  host: '10.11.99.1', // USB or WiFi IP
  password: 'your-ssh-password',
});

await client.connect();
const documents = await client.listDocuments();
```

## AI Providers

### OpenAIProvider

Use OpenAI's GPT-4 Vision for text recognition.

```typescript
import { OpenAIProvider } from 'inksight';

const provider = new OpenAIProvider({
  apiKey: 'your-openai-api-key',
  model: 'gpt-4-vision-preview',
});
```

## Transformers

### TextRecognitionTransformer

Convert handwriting to text.

```typescript
import { TextRecognitionTransformer } from 'inksight';

const transformer = new TextRecognitionTransformer({
  aiProvider: provider,
  options: {
    language: 'en',
    outputFormat: 'markdown',
  },
});

const result = await transformer.transform(document);
console.log(result.data);
```

## More documentation coming in later phases!
