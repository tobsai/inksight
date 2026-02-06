/**
 * Basic Usage Example
 * 
 * Demonstrates how to connect to reMarkable Cloud, download a document,
 * and run text recognition on it.
 */

import { RemarkableCloudClient, OpenAIProvider, TextRecognitionTransformer } from '../src/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  // 1. Create cloud client
  const client = new RemarkableCloudClient({
    deviceToken: process.env.REMARKABLE_DEVICE_TOKEN!,
    userToken: process.env.REMARKABLE_USER_TOKEN!,
  });

  console.log('Connecting to reMarkable Cloud...');

  // 2. List documents
  const documents = await client.listDocuments();
  console.log(`Found ${documents.length} documents`);

  // 3. Download first document
  if (documents.length > 0) {
    const doc = documents[0];
    console.log(`Downloading: ${doc.visibleName}...`);
    const downloaded = await client.downloadDocument(doc.id);

    // 4. Set up AI provider
    const aiProvider = new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    // 5. Create text recognition transformer
    const transformer = new TextRecognitionTransformer({
      aiProvider,
    });

    // 6. Transform document
    console.log('Running text recognition...');
    // const result = await transformer.transform(parsed);
    // console.log('Result:', result);
  }
}

main().catch(console.error);
