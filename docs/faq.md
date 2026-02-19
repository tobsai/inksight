# InkSight FAQ

---

### 1. What reMarkable devices does InkSight support?

InkSight is designed for **reMarkable Paper Pro** and works with the **reMarkable 2** as well. Both devices share the same `.rm` file format and support SSH access.

The reMarkable 1 may work but has not been tested.

---

### 2. Do I need to jailbreak my reMarkable device?

No. InkSight connects to your device using the standard SSH access that reMarkable officially supports. Enable it in **Settings → Security → SSH** on the device. No modifications to firmware are required.

For cloud-only mode, SSH access is not needed at all.

---

### 3. How much does it cost to use InkSight?

InkSight itself is free and open source. However, it uses paid AI APIs:

| Operation | Approximate cost |
|-----------|------------------|
| Text extraction (1 page) | $0.004–0.012 |
| Text extraction (10 pages) | $0.04–0.12 |
| Summary | $0.005–0.015 |
| Diagram | $0.005–0.015 |
| Metadata | $0.003–0.010 |
| Full analysis | $0.015–0.05 |

You can cap spending with `maxCostPerDocument` in your config. Both OpenAI and Anthropic offer generous free trial credits when you first sign up.

---

### 4. Is my handwriting data sent to AI providers?

Yes, **page images are sent to your configured AI provider** (OpenAI or Anthropic) for analysis. Your data is processed under each provider's privacy policy:

- [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy)
- [Anthropic Privacy Policy](https://www.anthropic.com/privacy)

Both providers offer API data controls. By default, API usage data is **not used to train models**.

If privacy is a concern, consider running a self-hosted model in the future (Phase 11 of the roadmap).

---

### 5. Which AI provider gives the best results?

**OpenAI (GPT-4o)** generally gives the highest accuracy for complex handwriting and mixed text/diagram pages.

**Anthropic (Claude Sonnet)** is faster and more affordable, with excellent results on clean handwriting.

Use `provider: "auto"` to try both with automatic fallback.

---

### 6. Can InkSight work offline?

Partially. InkSight can:

- ✅ Read from local cache (documents already downloaded)
- ✅ Search the local SQLite database
- ✅ Render pages from cached `.rm` files
- ❌ Download new documents from the cloud
- ❌ Run AI transforms (requires API access)

The `OfflineDetector` module automatically detects network availability and routes requests accordingly in hybrid mode.

---

### 7. Why is my device not showing as connected?

Common causes:

1. **Wrong IP address** — The default is `10.11.99.1` when connected via USB-C. Check your network settings if on Wi-Fi.
2. **SSH not enabled** — Go to **Settings → Security → SSH** on the device.
3. **Firewall** — Ensure your computer's firewall allows outbound connections to port 22.
4. **USB-C not connected** — USB networking is required unless you know the device's Wi-Fi IP.

Run `inksight status` to see the current connection state.

---

### 8. How is the config file stored securely?

The config file at `~/.inksight/config.json` is stored as **plaintext**. Your API keys and passwords are readable by anyone with access to your home directory.

**Recommended approach:** Use environment variables for sensitive values:

```bash
export INKSIGHT_OPENAI_KEY="sk-..."
export INKSIGHT_CLOUD_PASSWORD="my-password"
```

These override the config file without storing secrets on disk.

---

### 9. Can I use InkSight as a library in my own app?

Yes. InkSight is published as an npm package:

```bash
npm install inksight
```

All modules are exported from the top-level `inksight` package:

```typescript
import { HybridClient, TextTransformer, ConfigManager } from 'inksight';
```

See the [API documentation](./api.md) for full details.

---

### 10. The transform output looks wrong or garbled. What should I try?

1. **Check the page index** — Use `--page <n>` to specify which page to process (0-based).
2. **Try a different AI provider** — Switch between OpenAI and Anthropic for comparison.
3. **Check confidence score** — A confidence below 0.7 means the handwriting was hard to read. Consider re-writing more legibly.
4. **Use `diagram` type** — If the page is mostly a sketch, use `--type diagram` instead of `--type text`.
5. **Multi-page documents** — For long documents, use `--type summary` to get an aggregated result.

For persistent issues, check the [Troubleshooting guide](./troubleshooting.md).
