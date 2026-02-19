# InkSight Troubleshooting Guide

---

## Connection Issues

### Cloud authentication fails

**Symptom:** `Authentication failed: 401` or `Invalid credentials`

**Steps:**
1. Verify your email and password at [my.remarkable.com](https://my.remarkable.com).
2. Re-run `inksight setup` to re-enter credentials.
3. Check if your account uses two-factor authentication — InkSight requires an app password if 2FA is enabled.
4. Try setting credentials via environment variables:
   ```bash
   export INKSIGHT_CLOUD_EMAIL="your@email.com"
   export INKSIGHT_CLOUD_PASSWORD="yourpassword"
   ```

---

### SSH connection refused

**Symptom:** `ECONNREFUSED 10.11.99.1:22` or `Connection timed out`

**Steps:**
1. Check that SSH is enabled on the device: **Settings → Security → SSH → Enabled**
2. Confirm the IP address:
   - USB-C connection: `10.11.99.1` (default)
   - Wi-Fi connection: check **Settings → About** on the device
3. Verify the USB-C cable is connected to your computer
4. Test the connection manually: `ssh root@10.11.99.1`
5. Check your firewall isn't blocking port 22

---

### SSH key authentication fails

**Symptom:** `Permission denied (publickey)` or `Authentication failed`

**Steps:**
1. Verify the key path in your config: `~/.inksight/config.json` → `connection.ssh.keyPath`
2. Ensure the key has correct permissions: `chmod 600 ~/.ssh/id_rsa`
3. Check the public key is in the device's `authorized_keys`:
   ```bash
   ssh root@10.11.99.1 "cat ~/.ssh/authorized_keys"
   ```
4. Try password authentication (remove `keyPath` from config)

---

### Hybrid mode always uses cloud

**Symptom:** Documents load slowly; SSH not being used

**Steps:**
1. Verify SSH is working: `ssh root@10.11.99.1 "echo connected"`
2. Check that `connection.mode` is `hybrid` in config
3. Set `INKSIGHT_CONNECTION_MODE=hybrid` explicitly
4. Run `inksight status` — look for `SSH: ✓ connected`

---

## AI Provider Errors

### Rate limit hit

**Symptom:** `Error 429: Too many requests` or `Rate limit exceeded`

**Steps:**
1. Wait 30–60 seconds and retry
2. Switch to the other provider temporarily:
   ```bash
   INKSIGHT_AI_PROVIDER=anthropic inksight transform <id>
   ```
3. Set a cost cap to slow down batch operations:
   ```bash
   INKSIGHT_MAX_COST=0.02 inksight batch "*.rm"
   ```

---

### Invalid API key

**Symptom:** `Error 401: Invalid API key` or `API key not found`

**Steps:**
1. Re-run `inksight setup` and re-enter your key
2. Verify the key starts with `sk-` (OpenAI) or `sk-ant-` (Anthropic)
3. Check for accidental whitespace:
   ```bash
   export INKSIGHT_OPENAI_KEY="sk-yourkey"  # no quotes around the key itself
   ```
4. Generate a new key at [platform.openai.com](https://platform.openai.com/api-keys) or [console.anthropic.com](https://console.anthropic.com/)

---

### AI response is empty or malformed

**Symptom:** Empty `text` field or `confidence: 0`

**Steps:**
1. Check the page isn't blank — use `--page 0` to confirm you're targeting the right page
2. Try rendering the page first to inspect it visually (see [Performance Tips](#performance-tips))
3. Switch AI providers — some models handle certain handwriting styles better
4. Use `--type diagram` if the page has more sketches than text
5. Check document has content: `inksight get <id>` downloads it; verify page count

---

## Storage & Cache

### Database locked or corrupted

**Symptom:** `SQLITE_BUSY: database is locked` or `Error: database disk image is malformed`

**Steps:**
1. Close any other InkSight processes
2. If corrupted, remove the database:
   ```bash
   rm ~/.inksight/inksight.db
   ```
   InkSight will re-create it on next run (note: stored results will be lost)

---

### Cache using too much disk space

**Symptom:** Slow disk, `ENOSPC: no space left on device`

**Steps:**
1. Check cache size: `du -sh ~/.inksight/cache/`
2. Clear the cache: `rm -rf ~/.inksight/cache/*`
3. Reduce cache limit in config:
   ```json
   { "storage": { "maxCacheMb": 100 } }
   ```

---

## Performance Tips

### Processing is slow

1. **Use SSH over Cloud** for downloads — SSH transfers are direct and much faster
2. **Use `--page <n>`** — process only the page you need instead of all pages
3. **Choose the right transform type** — `text` is fastest, `summary` is slower but handles multiple pages
4. **Cache repeat requests** — InkSight caches rendered pages in memory; re-running the same document is instant after the first pass
5. **Batch during off-hours** — AI API rate limits reset every minute; large batches work best run incrementally

### Reduce costs

1. Set `maxCostPerDocument: 0.05` to cap per-document spending
2. Use `quick-text` preset for speed runs instead of `full-analysis`
3. Use Anthropic (Claude Sonnet) — approximately 3× cheaper than OpenAI for equivalent tasks
4. Process only relevant pages with `--page` flag

---

## Common Error Messages

| Error | Cause | Fix |
|-------|-------|-----|
| `Failed to read config at ~/.inksight/config.json` | Malformed JSON | Run `inksight setup` to recreate |
| `connection.mode is required` | Config missing mode | Add `connection.mode` or run `inksight setup` |
| `ENOENT: no such file or directory` | Path doesn't exist | Check file paths in config |
| `EACCES: permission denied` | File permissions | `chmod 600 ~/.inksight/config.json` |
| `ECONNREFUSED` | SSH port not open | See [SSH connection refused](#ssh-connection-refused) |
| `429 Too Many Requests` | Rate limit | See [Rate limit hit](#rate-limit-hit) |
| `401 Unauthorized` | Invalid API key | See [Invalid API key](#invalid-api-key) |
| `SQLITE_BUSY` | DB locked | See [Database locked](#database-locked-or-corrupted) |
| `No documents found` | Empty cloud or SSH path | Verify device has synced documents |

---

## Getting Help

If the issue isn't covered here:

1. Check the [FAQ](./faq.md) for general questions
2. Open an issue on [GitHub](https://github.com/tobsai/inksight/issues)
3. Include:
   - InkSight version (`inksight --version`)
   - Node.js version (`node --version`)
   - OS and architecture (`uname -a`)
   - The full error message
   - Whether you're using cloud, SSH, or hybrid mode
