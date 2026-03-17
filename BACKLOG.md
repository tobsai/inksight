# InkSight — Product Backlog
Last updated: 2026-03-15
Product Owner: Marty

---

## Product Outcomes
*(What success looks like — measurable, not features)*

1. **Validation**: 100+ reMarkable users express genuine interest (waitlist, Reddit upvotes, GitHub stars) before major cloud investment
2. **On-device utility**: Users who install the daemon keep it running for 30+ days (core value is real)
3. **Pro conversion**: 5% of free users convert to Pro within 90 days of cloud tier launch
4. **Quality bar**: Users describe output as "noticeably better than my original" — not just "slightly smoother"
5. **Community moat**: Open-source daemon is forked/starred enough to create developer community defensibility

---

## Current Sprint / Focus

**Sprint goal: Validate before building**

InkSight is early stage. The on-device daemon has some foundation (file watcher, .rm parser, basic smoothing). But **the riskiest assumption hasn't been tested**: do reMarkable users care enough about handwriting quality improvement to pay for it?

Before writing one more line of cloud infrastructure, we need to know if the product has legs. The go-to-market is clear (r/RemarkableTablet, GitHub, YouTube). The question is: will the market respond?

Sprint focus:
1. **Polish the on-device demo** to a shareable state
2. **Produce a before/after visual** (the entire pitch in one image)
3. **Launch on Reddit + GitHub** and measure response
4. **Build the waitlist** for cloud Pro tier

Do not build cloud API until waitlist hits 50+ genuine signups.

---

## Backlog

### P1 — Must Have Next

| ID | User Story | Outcome | Acceptance Criteria | Status |
|----|------------|---------|---------------------|--------|
| INK-001 | As a reMarkable user, I want to see a compelling before/after comparison of InkSight's stroke processing, so I can decide if it's worth trying | Validation | Produce 3 before/after image pairs: messy handwriting → cleaned, rough sketch → polished diagram, handwritten notes → consistent spacing. Post-ready (1200x630px, shareable). | 🔲 Todo |
| INK-002 | As a developer/power user, I want a clean GitHub README with install instructions for the on-device daemon, so I can try it without friction | Validation | README has: 1-command install, system requirements (reMarkable Paper Pro, SSH access), before/after screenshot, what it does/doesn't do. ≤5 minutes from README to running. | 🔲 Todo |
| INK-003 | As the product team, we want to post to r/RemarkableTablet and r/eink with a demo post/video, so we can measure genuine market interest | Validation | Post published to r/RemarkableTablet. Track: upvotes, comments, DMs, GitHub stars within 7 days. Success threshold: ≥50 upvotes or ≥10 comments expressing interest in Pro tier. | 🔲 Todo |
| INK-004 | As a potential Pro user, I want to join a waitlist for InkSight Cloud so I'm notified when the cloud tier launches | Validation | Simple waitlist page (can be a Tally form or simple landing page). Linked from GitHub README and Reddit post. Goal: 50 signups before cloud dev begins. | 🔲 Todo |
| INK-005 | As a reMarkable user, I want the on-device daemon to reliably process my handwritten notes without corrupting files, so I can trust it with my data | On-device utility | Daemon runs for 7+ days without crash on Toby's device. File backups work correctly. No data loss incidents. Processed files readable by reMarkable firmware. | 🔲 Todo |

---

### P2 — Should Have Soon

| ID | User Story | Outcome | Acceptance Criteria | Status |
|----|------------|---------|---------------------|--------|
| INK-006 | As a reMarkable user, I want a simple web dashboard to manage my InkSight settings and see processing history, so I don't need to SSH into my device | On-device utility | Web dashboard at inksight.pro shows: daemon status, last processed file, processing stats, toggle settings. Accessible without SSH. | 🔲 Todo |
| INK-007 | As a reMarkable user, I want to upload a notebook page and preview how InkSight will process it (before committing), so I can tune settings without risk | Quality bar | Cloud preview endpoint (can be free tier limited): upload .rm file, returns before/after comparison image. No billing required for preview. | 🔲 Todo |
| INK-008 | As a Pro subscriber, I want AI-powered handwriting beautification that improves consistency across a full notebook, so my notes look professional | Pro conversion | AI processing produces visibly improved output on 80%+ of submitted pages. Style is preserved (not homogenized). Processed file is valid .rm format and renders correctly on device. | 🔲 Todo |
| INK-009 | As a Pro subscriber, I want shape recognition that cleans up my rough diagrams and flowcharts, so my sketches look intentional | Pro conversion | Shape detection identifies: rectangles, circles, arrows, lines. Snap-to-shape produces clean geometry. User can undo (original preserved). | 🔲 Todo |
| INK-010 | As the product, we need Stripe billing integrated with the cloud API, so Pro users can subscribe and we can generate revenue | Pro conversion | Stripe checkout flow for $4.99/mo plan. Subscription status gates cloud processing. Webhook handles cancellations. Monthly processing quota enforced (100 pages). | 🔲 Todo |

---

### P3 — Could Have Later

| ID | User Story | Outcome | Acceptance Criteria | Status |
|----|------------|---------|---------------------|--------|
| INK-011 | As a Pro user, I want to batch-process an entire notebook at once, so I don't have to submit pages individually | Quality bar | Batch processing endpoint accepts multi-page .rm files. Processes all pages in sequence. Status polling shows progress. Quota deducted per page. | 🔲 Todo |
| INK-012 | As a power user, I want OCR + full-text search across all my processed notebooks, so I can find anything I've ever written by hand | Pro conversion | OCR runs post-processing. Text indexed and searchable. Search results show page thumbnail + highlight. (Team tier feature.) | 🔲 Todo |
| INK-013 | As a Pro user, I want style presets ("minimal cleanup" vs "calligraphy polish"), so I can control the transformation intensity | Quality bar | At least 3 presets available: Light (smoothing only), Standard (consistency + shapes), Full (calligraphy-style transformation). Previews show difference. | 🔲 Todo |
| INK-014 | As an API customer, I want access to the InkSight processing API with documented endpoints, so I can integrate it into my own workflow | Pro conversion | API docs published (OpenAPI). Auth via API key. Rate limits documented. Pricing: Team tier or per-call. | 🔲 Todo |
| INK-015 | As a Rust developer, I want an open-source Rust port of the on-device daemon, so InkSight is more stable and accessible to contributors | Community moat | Rust daemon at feature parity with Python version. Published to crates.io. README updated with Rust install path. | 🔲 Todo |

---

## Opportunity Space

### Key Opportunities
1. **The gap nobody fills** — Every competitor (reMarkable Connect, Nebo, Supernote) focuses on recognition (reading your handwriting). Nobody works on *improving* your handwriting. This is a genuinely novel wedge.
2. **reMarkable community is vocal and tight-knit** — r/RemarkableTablet (62K members), active Discord, Toltec package manager community. A genuine product with a great demo can go viral in this space. GoHenry-style word-of-mouth is possible.
3. **GitHub as distribution** — Open-sourcing the on-device daemon is both ethical (it lives on user hardware) and strategic. Stars = credibility. Forks = moat. Contributors = free QA.
4. **97% gross margin potential** — At $5/month with Modal serverless GPU at ~$0.001/page, InkSight Pro is extraordinarily high-margin if the conversion funnel works.

### Risks
- **Market size uncertainty** — reMarkable has sold ~1M+ devices. But what % want handwriting improvement vs. just digital-to-text? Unknown. This is why validation comes first.
- **reMarkable blocks SSH** — Medium probability. If they lock the device, the on-device daemon dies. Mitigation: web upload alternative (cloud-only mode). Don't build everything on SSH.
- **AI model quality** — The "wow" moment depends on outputs actually looking better. Rule-based smoothing is provably useful. AI beautification is uncertain. Ship rule-based first, validate quality bar.
- **Competition from reMarkable** — Low but non-zero. If this gets traction, they could ship it themselves. Move fast, build community before they notice.

### Assumptions to Test
- **Test 1 (value)**: Will reMarkable users upvote/engage with a before/after demo? (Reddit post — binary result in 7 days)
- **Test 2 (willingness to pay)**: Will 50 users sign up for a Pro waitlist before it exists? (Waitlist page — success in 30 days)
- **Test 3 (quality)**: Does AI-processed output look "noticeably better" to 8/10 users in a blind comparison? (User test with 10 reMarkable owners before shipping Pro)
- **Test 4 (retention)**: Do users who install the daemon still have it running 30 days later? (Telemetry opt-in after launch)

### Strategic Bet
InkSight's moat is not the AI model — models are commoditized. The moat is: open-source daemon community + quality reputation + being first. Win the reMarkable community before a well-funded startup notices the gap.
