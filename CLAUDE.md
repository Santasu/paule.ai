# CLAUDE.md - AI Assistant Guide for Paule.AI

## Project Overview

**Paule.AI** is a premium multi-AI chat platform deployed on Vercel's serverless infrastructure. The platform provides a unified interface for interacting with 7+ AI providers (OpenAI, Anthropic, Google Gemini, xAI Grok, DeepSeek, Together AI, OpenRouter) plus creative services (Suno music generation, Runway video generation, FLUX image generation).

**Key Facts:**
- **Language:** JavaScript (CommonJS)
- **Runtime:** Node.js 22.x + Vercel Edge Runtime
- **Database:** PostgreSQL (Neon serverless)
- **Storage:** Vercel Blob
- **Auth:** Clerk OAuth
- **Primary UI Language:** Lithuanian (with international support)
- **License:** UNLICENSED (proprietary)

---

## Directory Structure

```
/home/user/paule.ai/
├── api/                          # Vercel serverless functions (35+ endpoints)
│   ├── _auth.js                  # Authentication utilities
│   ├── _utils.js                 # Common response helpers (Edge Runtime)
│   ├── stream.js                 # Multi-provider streaming LLM chat (MAIN ENTRY)
│   ├── complete.js               # Non-streaming multi-model responses
│   ├── models.js                 # Available models endpoint
│   ├── diagnostics.js            # Health checks for all providers
│   ├── flux/create.js            # FLUX image generation
│   ├── comic/create.js           # Comic/illustration generation
│   ├── music/                    # Suno AI music generation (9 endpoints)
│   │   ├── create.js             # Create music request
│   │   ├── status.js             # Poll generation status
│   │   ├── extend.js             # Extend existing songs
│   │   ├── add-vocals.js         # Add vocals to instrumental
│   │   ├── callback.js           # Webhook handler
│   │   └── credits.js            # User credits check
│   ├── runway/                   # Runway ML video generation
│   │   ├── image.js              # Image-to-video conversion
│   │   └── status.js             # Status polling
│   ├── assets/                   # Asset management
│   │   ├── index.js              # List/manage assets
│   │   └── upload.js             # Upload to Vercel Blob
│   ├── chats/                    # Chat history CRUD
│   └── admin/                    # Admin functions
│       └── set-secret.js         # Update Vercel env vars
│
├── lib/                          # Shared utility libraries
│   ├── ai.js                     # AI provider configuration & detection
│   ├── db.js                     # PostgreSQL connection pool
│   ├── env.js                    # Environment variable management
│   ├── http.js                   # HTTP response helpers
│   ├── cors.js                   # CORS utilities
│   ├── suno.js                   # Suno API wrapper
│   ├── runway.js                 # Runway ML API wrapper
│   └── flux.js                   # FLUX API wrapper
│
├── db/
│   └── schema.sql                # PostgreSQL schema (users, chats, messages, assets)
│
├── public/                       # Static frontend (SPA)
│   ├── index.html                # Main UI (1,421 lines)
│   ├── admin.html                # Admin panel
│   ├── assets/css/               # Styling
│   ├── assets/icon/              # Brand/model icons
│   └── spec/                     # Specialist templates
│       ├── finansai.html         # Finance specialist
│       ├── psihologas.html       # Psychology specialist
│       └── [4+ other specialists]
│
├── vercel.json                   # Deployment & routing (68 routes)
├── package.json                  # Dependencies (minimal: 2)
└── README.md                     # Lithuanian documentation
```

---

## Technology Stack

### Frontend
- **Static SPA:** HTML5 + vanilla JavaScript + CSS
- **Styling:** Custom CSS (`/assets/css/paule.css` v1.1.7)
- **Auth:** Clerk.com OAuth integration
- **Payment:** Stripe pricing table component
- **Theme:** Light/dark mode toggle
- **Language:** Lithuanian-first with international support

### Backend
- **Runtime:**
  - Vercel Edge Runtime (`/api/stream.js` - optimized for SSE streaming)
  - Node.js 22.x (all other endpoints)
- **Module System:** CommonJS (`"type": "commonjs"`)
- **No Build Step:** Pre-compiled, ready to deploy

### AI Providers (7)
1. **OpenAI** - GPT-4o-mini, GPT-5-mini
2. **Anthropic** - Claude-3.5-Sonnet, Claude-4-Sonnet
3. **Google Gemini** - Gemini-1.5-Flash, Gemini-2.0-Flash
4. **xAI Grok** - Grok-2, Grok-4
5. **DeepSeek** - DeepSeek-v3.1, DeepSeek-chat
6. **Together AI** - Meta Llama models, GPT-OSS models
7. **OpenRouter** - Universal fallback for any model

### Creative Services (3)
- **FLUX** (Black Forest Labs) - Image generation (flux-pro-1.1)
- **Suno AI** - Music generation (V3.5 model)
- **Runway ML** - Video generation (gen4_turbo)

### Data Layer
- **Database:** PostgreSQL via Neon serverless
- **Client:** `@neondatabase/serverless` v0.10.1
- **ORM:** None (raw SQL queries)
- **Storage:** Vercel Blob v0.23.2

---

## Key Architectural Patterns

### 1. Multi-Provider Adapter Pattern

The core architecture uses provider adapters with automatic fallback:

```javascript
// Provider detection (api/stream.js:25-30)
isOpenAI(model)     → /^gpt-/i
isAnthropic(model)  → /^claude|sonnet/i
isDeepSeek(model)   → /deepseek/i
isXAI(model)        → /grok/i
isGemini(model)     → /^(gemini|google\/)/i
isLlamaFamily(model)→ /meta-llama|llama/i
```

**Fallback chain:**
1. Vendor-specific handler (if API key available)
2. OpenRouter (universal fallback)
3. Error response

### 2. SSE Streaming (Server-Sent Events)

The `/api/stream.js` endpoint uses Edge Runtime for optimal streaming:

```javascript
// SSE format helpers (api/stream.js:18-23)
sse.delta(text)          // OpenAI-compatible delta
sse.event(name, payload) // Custom events (start, done, error)
sse.done()               // Stream terminator
```

**Event flow:**
```
Client → GET /api/stream?model=X&message=Y
  ↓
Server → event: start
  ↓
Server → data: {"choices":[{"delta":{"content":"..."}}]}  (multiple)
  ↓
Server → event: done
  ↓
Server → data: [DONE]
```

### 3. Async Polling Pattern (Creative Services)

Suno/Runway/FLUX use async task polling:

```
Client → POST /api/music/create → {task_id}
  ↓ (poll)
Client → GET /api/music/status?id={task_id} → {status: "Pending"}
  ↓ (repeat)
Client → GET /api/music/status?id={task_id} → {status: "Ready", url: "..."}
```

### 4. Model Fallback Strategy

**Anthropic (Claude) model cascade** (api/stream.js:115-126):
```javascript
// If user requests "claude-4-sonnet" but it's 404, try:
1. claude-4-sonnet
2. claude-3-7-sonnet-latest
3. claude-3-5-sonnet-20241022
4. claude-3-5-sonnet-latest
```

**Gemini model cascade** (api/stream.js:251-254):
```javascript
// Requested model → fallbacks
[requested_model, 'gemini-2.0-flash', 'gemini-1.5-flash']
```

---

## Development Workflows

### Local Development

```bash
# Install dependencies
npm install

# Run local dev server (Vercel CLI required)
npm run dev
# → Starts on http://localhost:3000

# No build step required
npm run build  # Outputs: "no build step"
```

### Environment Variables

**Required API Keys (stored in Vercel environment):**
```bash
# LLM Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...        # or GEMINI_API_KEY
XAI_API_KEY=xai-...
DEEPSEEK_API_KEY=sk-...
TOGETHER_API_KEY=...
OPENROUTER_API_KEY=sk-or-...

# Creative Services
SUNO_API_KEY=...
RUNWAY_API_KEY=...
FLUX_API_KEY=...

# Database & Storage
DATABASE_URL=postgresql://...  # Neon connection string
BLOB_READ_WRITE_TOKEN=vercel_blob_...

# Auth
CLERK_SECRET_KEY=sk_live_...

# Optional
DEEPSEEK_MODEL=deepseek-v3.1  # Override default model
SITE_URL=https://paule.app
```

**Admin Update:** Use `/api/admin/set-secret.js` to update env vars from UI without redeployment.

### Adding a New AI Provider

1. **Add to provider detection** (`api/stream.js`):
```javascript
function isNewProvider(m='') { return /new-provider/i.test(m); }
```

2. **Create pump function**:
```javascript
async function pumpNewProvider({ model, message, maxTokens, write }) {
  const resp = await fetch('https://api.newprovider.com/v1/chat', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getenv('NEWPROVIDER_API_KEY')}` },
    body: JSON.stringify({ model, messages: [{role:'user', content:message}] })
  });

  // Parse SSE stream and call write(sse.delta(text)) for each chunk
}
```

3. **Add to main handler** (`api/stream.js:464-498`):
```javascript
else if (isNewProvider(model) && HAS.NEWPROVIDER) {
  await pumpNewProvider({ model, message, maxTokens, write });
}
```

4. **Add env check**:
```javascript
const HAS = {
  // ...
  NEWPROVIDER: !!getenv('NEWPROVIDER_API_KEY')
};
```

### Adding a New Creative Service

1. **Create service directory**: `/api/newservice/`
2. **Implement endpoints**:
   - `create.js` - Initiate generation (returns task_id)
   - `status.js` - Poll status (returns {status, result})
3. **Add routes to `vercel.json`**:
```json
{ "src": "^/api/newservice/create$", "dest": "/api/newservice/create.js" }
```

### Database Migrations

**No automated migration system.** Manual schema updates:

1. Connect to Neon dashboard or use `psql`
2. Run SQL directly:
```sql
ALTER TABLE users ADD COLUMN new_field TEXT;
CREATE INDEX idx_new_field ON users(new_field);
```
3. Update queries in `/lib/` or `/api/` files

---

## Key Conventions

### Code Style

**Naming:**
- Files: `kebab-case.js`
- Functions: `camelCase` with descriptive prefixes (`pumpOpenAI`, `askAnthropic`)
- Variables: `camelCase`, abbreviated for brevity (`resp`, `j` for JSON)
- Environment: `SCREAMING_SNAKE_CASE` with provider prefix

**Comments:**
- Mixed Lithuanian/English
- Inline comments for complex logic
- Function headers for major sections

**Error Handling:**
```javascript
// Standard pattern
try {
  const resp = await fetch(...);
  if (!resp.ok) {
    const txt = await resp.text().catch(() => String(resp.status));
    throw new Error(`Provider HTTP ${resp.status}: ${txt.slice(0,300)}`);
  }
} catch (e) {
  write(sse.event('error', { message: String(e?.message || e) }));
}
```

### Response Patterns

**SSE Success:**
```javascript
write(sse.event('start', { model, chat_id }));
// ... stream content via write(sse.delta(text))
write(sse.event('done', { finish_reason: 'stop' }));
write(sse.done());
close();
```

**JSON Success:**
```javascript
return new Response(JSON.stringify({ ok: true, data: {...} }), {
  headers: { 'Content-Type': 'application/json', ...corsHdrs }
});
```

**Error Response:**
```javascript
return new Response(JSON.stringify({ ok: false, error: 'message' }), {
  status: 500,
  headers: { 'Content-Type': 'application/json', ...corsHdrs }
});
```

### CORS

All API endpoints must include CORS headers:
```javascript
const corsHdrs = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization'
};

// Handle preflight
if (req.method === 'OPTIONS') {
  return new Response(null, { status: 204, headers: corsHdrs });
}
```

### Database Queries

**Pattern** (using `lib/db.js`):
```javascript
const { q } = require('../lib/db');

// Parameterized queries (ALWAYS use params to prevent SQL injection)
const { rows } = await q(
  'SELECT * FROM users WHERE clerk_id = $1',
  [clerkId]
);

// Inserts with RETURNING
const { rows } = await q(
  'INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING id',
  [userId, title]
);
```

**NEVER concatenate user input into SQL strings.**

---

## Routing Architecture

### Multi-Namespace Support

The platform supports **4 URL namespaces** (all route to same handlers):

1. **Primary API:** `/api/stream`, `/api/models`, etc.
2. **Versioned:** `/api/paule/v1/stream`, `/api/paule/v1/models`
3. **WordPress REST (Brand 1):** `/wp-json/paule/v1/stream`
4. **WordPress REST (Brand 2):** `/wp-json/augam/v1/stream`

**Configuration:** `vercel.json:8-107` (68 route mappings)

### Key Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/stream` | GET | SSE streaming chat (all LLM providers) |
| `/api/complete` | POST | Non-streaming multi-model responses |
| `/api/models` | GET | List available models & services |
| `/api/diagnostics` | GET | Health check all providers |
| `/api/music/create` | POST | Create Suno music generation task |
| `/api/music/status` | GET | Poll music generation status |
| `/api/flux/create` | POST | FLUX image generation |
| `/api/runway/image` | POST | Runway image-to-video |
| `/api/chats` | GET/POST | Chat history CRUD |
| `/api/assets/upload` | POST | Upload to Vercel Blob |
| `/api/admin/set-secret` | POST | Update Vercel env vars |

---

## Testing Strategy

**No formal testing framework** (Jest, Mocha, etc.).

**Manual testing endpoints:**
- `/api/diagnostics` - Live provider health checks
- `/api/ping` - Basic connectivity
- `/api/sse-ping` - SSE protocol verification
- `/public/_sse_test.htm` - Manual SSE testing

**Before deployment:**
1. Test streaming: `curl "http://localhost:3000/api/stream?model=gpt-4o-mini&message=hello"`
2. Check diagnostics: `curl http://localhost:3000/api/diagnostics`
3. Verify CORS: Test from browser console

---

## Deployment

### Vercel Deployment

**Automatic deployment:**
- Push to `main` branch → Auto-deploy to production
- Push to feature branches → Preview deployments

**Manual deployment:**
```bash
vercel --prod  # Deploy to production
vercel         # Deploy preview
```

### Build Configuration

**No build step required.** Vercel configuration (`vercel.json`):
```json
{
  "version": 2,
  "framework": null,
  "builds": [
    { "src": "api/**/*.js", "use": "@vercel/node" },
    { "src": "public/**/*", "use": "@vercel/static" }
  ]
}
```

### Environment Setup

**Production:** Set environment variables in Vercel dashboard:
- Settings → Environment Variables
- OR use `/api/admin/set-secret.js` endpoint

**Local:** Create `.env.local` (gitignored):
```bash
DATABASE_URL=...
OPENAI_API_KEY=...
# etc.
```

---

## Security Considerations

### API Key Management

**NEVER commit API keys to git.**

- Store in Vercel environment variables
- Access via `process.env.KEY_NAME`
- Client-side: Feature flag approach (check availability, never expose keys)

### Authentication

**Clerk OAuth flow:**
1. Client redirects to Clerk
2. Clerk returns with session token
3. API validates token via `/api/_auth.js`
4. Queries use `clerk_id` as user identifier

### CORS Policy

**Open CORS** (`Access-Control-Allow-Origin: *`) for public API endpoints.

**Justification:** Platform designed for client-side SSE consumption. No sensitive data in responses without auth.

### SQL Injection Prevention

**ALWAYS use parameterized queries:**
```javascript
// ✅ CORRECT
const { rows } = await q('SELECT * FROM users WHERE id = $1', [userId]);

// ❌ WRONG (SQL injection vulnerability)
const { rows } = await q(`SELECT * FROM users WHERE id = ${userId}`);
```

### Data Protection

- HTTPS enforced (Vercel default)
- SSL for database connections
- `Cache-Control: no-store` for dynamic endpoints
- Sensitive data never stored in client state

---

## Common Tasks

### 1. Add a New Model to the UI

**Edit:** `public/index.html`

Find the model selector section (search for `<select id="modelSelect">`):
```html
<option value="new-model-id">New Model Name</option>
```

Add corresponding icon in `public/assets/icon/` if needed.

### 2. Update Provider API Key

**Option 1 - Vercel Dashboard:**
1. Go to Vercel project → Settings → Environment Variables
2. Edit key → Save
3. Redeploy (or wait for automatic redeploy)

**Option 2 - Admin UI:**
1. Navigate to `/admin.html`
2. Use "Set Secret" form
3. Enter key name and value
4. Submit (updates via `/api/admin/set-secret.js`)

### 3. Debug Streaming Issues

**Check provider availability:**
```bash
curl http://localhost:3000/api/diagnostics
```

**Test specific model:**
```bash
curl "http://localhost:3000/api/stream?model=gpt-4o-mini&message=test"
```

**Check logs:**
- Vercel dashboard → Deployments → [deployment] → Runtime Logs
- Look for provider-specific errors

### 4. Add Database Column

**Example - Add `premium` flag to users:**

```sql
-- In Neon SQL editor or psql
ALTER TABLE users ADD COLUMN premium BOOLEAN DEFAULT FALSE;
CREATE INDEX idx_users_premium ON users(premium) WHERE premium = TRUE;
```

Update queries:
```javascript
// api/chats/index.js
const { rows } = await q(
  'SELECT u.premium, c.* FROM chats c JOIN users u ON c.user_id = u.id WHERE u.clerk_id = $1',
  [clerkId]
);
```

### 5. Handle Provider Rate Limits

**Implement exponential backoff:**
```javascript
async function retryableFetch(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const resp = await fetch(url, options);
    if (resp.status !== 429) return resp;

    const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
    await new Promise(r => setTimeout(r, delay));
  }
  throw new Error('Max retries exceeded');
}
```

### 6. Create a New Specialist Template

1. **Copy existing template:** `public/spec/finansai.html` → `public/spec/newspec.html`
2. **Update system prompt:**
```html
<script>
const SPECIALIST_PROMPT = `You are a specialist in [domain]...`;
</script>
```
3. **Update metadata** (title, description)
4. **Add to main index:** Link from `public/index.html` specialists section

---

## Performance Optimization

### Edge Runtime for Streaming

**Critical:** `/api/stream.js` MUST use Edge Runtime:
```javascript
export const config = { runtime: 'edge' };
```

**Benefits:**
- Lower latency globally
- Optimized for long-lived SSE connections
- Reduced cold-start impact

### Connection Pooling

**Database connection reuse** (lib/db.js:4-11):
```javascript
let pool;
function getPool() {
  if (pool) return pool;
  pool = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  return pool;
}
```

**Pattern:** Singleton pool across Lambda executions in same container.

### Static Asset Caching

**Versioned CSS** prevents stale caches:
```html
<link rel="stylesheet" href="/assets/css/paule.css?v=1.1.7">
```

Increment version after CSS changes.

### Provider Fallback

**Minimize latency** by checking feature flags before API calls:
```javascript
const HAS = {
  OPENAI: !!getenv('OPENAI_API_KEY'),
  ANTHROPIC: !!getenv('ANTHROPIC_API_KEY'),
  // ...
};

// Fast fail if no key available
if (isOpenAI(model) && !HAS.OPENAI) {
  throw new Error('OpenAI API key not configured');
}
```

---

## Troubleshooting Guide

### "model and message required" error

**Cause:** Missing query parameters in SSE request

**Fix:**
```javascript
// Ensure both params are present
const url = `/api/stream?model=${encodeURIComponent(model)}&message=${encodeURIComponent(msg)}`;
```

### "403: credits" error (Grok)

**Cause:** xAI account out of credits

**Fix:**
1. Visit https://console.x.ai
2. Add credits or upgrade plan
3. Verify `XAI_API_KEY` is correct

### "404: model not found" error (Claude)

**Cause:** Requested Claude model doesn't exist (e.g., `claude-4-sonnet` not yet released)

**Solution:** Code includes automatic fallback cascade (see api/stream.js:115-126)

**Manual fix:** Update model candidates in `anthropicCandidates()` function

### Database connection timeout

**Symptoms:** `Error: Connection timeout`

**Causes:**
1. Invalid `DATABASE_URL`
2. Neon project suspended (free tier inactivity)
3. Connection pool exhausted

**Fix:**
1. Verify `DATABASE_URL` in Vercel env vars
2. Check Neon dashboard for project status
3. Add `pool.end()` in endpoints if needed (usually not required)

### CORS errors in browser

**Symptoms:** `Access to fetch... has been blocked by CORS policy`

**Fix:** Ensure all API responses include CORS headers:
```javascript
const corsHdrs = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization'
};

// In handler
if (req.method === 'OPTIONS') {
  return new Response(null, { status: 204, headers: corsHdrs });
}
```

### SSE stream cuts off mid-response

**Possible causes:**
1. Provider timeout
2. Vercel serverless function timeout (10min limit)
3. Network interruption

**Debugging:**
```javascript
// Add heartbeat to prevent timeout
setInterval(() => write(': heartbeat\n\n'), 15000);
```

---

## Git Workflow

### Branch Naming

**Convention:** `claude/claude-md-{session_id}`

**Example:** `claude/claude-md-mhz8h2rx37rtsrf9-01FmVgyVsuL44dEdvyZi1fVq`

### Commit Messages

**Format:**
```
<type>: <short description>

<optional detailed description>
```

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `chore:` Maintenance tasks

**Examples:**
```bash
git commit -m "feat: add Gemini 2.0 Flash model support"
git commit -m "fix: handle 404 errors in Claude model fallback"
git commit -m "docs: update CLAUDE.md with new provider instructions"
```

### Push to Remote

**IMPORTANT:** Always push to the designated branch:
```bash
git push -u origin claude/claude-md-{session_id}
```

**Retry logic:** If network errors occur, retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s).

---

## File References

### Critical Files

| File | Purpose | Line References |
|------|---------|-----------------|
| `api/stream.js` | Main SSE streaming endpoint | All provider logic |
| `lib/ai.js` | Provider detection | L11-20 (guessProvider) |
| `lib/db.js` | Database connection | L13-21 (query function) |
| `db/schema.sql` | Database schema | All tables |
| `vercel.json` | Routing configuration | L8-107 (routes) |
| `package.json` | Dependencies | L13-16 |
| `public/index.html` | Main UI | L1-1421 |

### Provider Implementations

| Provider | Function | File | Lines |
|----------|----------|------|-------|
| OpenAI | `pumpOpenAI` | `api/stream.js` | 61-112 |
| Anthropic | `pumpAnthropic` | `api/stream.js` | 127-177 |
| DeepSeek | `pumpDeepSeek` | `api/stream.js` | 181-211 |
| xAI Grok | `pumpGrok` | `api/stream.js` | 214-248 |
| Google Gemini | `pumpGemini` | `api/stream.js` | 256-345 |
| OpenRouter | `pumpOpenRouter` | `api/stream.js` | 348-383 |
| Together AI | `pumpTogether` | `api/stream.js` | 386-416 |

---

## Quick Reference

### Environment Variables Quick Check

```bash
# Verify required env vars are set
node -e "console.log({
  OPENAI: !!process.env.OPENAI_API_KEY,
  ANTHROPIC: !!process.env.ANTHROPIC_API_KEY,
  GOOGLE: !!process.env.GOOGLE_API_KEY,
  XAI: !!process.env.XAI_API_KEY,
  DEEPSEEK: !!process.env.DEEPSEEK_API_KEY,
  DATABASE: !!process.env.DATABASE_URL
})"
```

### Useful Commands

```bash
# Local dev
npm run dev

# Test streaming endpoint
curl "http://localhost:3000/api/stream?model=gpt-4o-mini&message=hello"

# Check provider health
curl http://localhost:3000/api/diagnostics

# Deploy to production
vercel --prod

# View logs
vercel logs [deployment-url]
```

### Common Gotchas

1. **Edge Runtime limitations:** No Node.js built-ins (fs, path, etc.) in `api/stream.js`
2. **CommonJS only:** Don't use `import/export` syntax outside Edge Runtime files
3. **CORS preflight:** Always handle OPTIONS method
4. **SQL injection:** Never concatenate user input in queries
5. **API keys in client:** NEVER send keys to frontend
6. **Model names:** Case-insensitive matching (see `isOpenAI`, `isAnthropic`, etc.)
7. **Vercel timeout:** 10-minute max for serverless functions

---

## Specialist Templates

The platform includes pre-configured specialist templates in `public/spec/`:

- **finansai.html** - Finance specialist
- **psihologas.html** - Psychology specialist
- **marketing.html** - Marketing specialist
- **verslas.html** - Business specialist
- **pardavimai.html** - Sales specialist
- **produktyvumas.html** - Productivity specialist
- **fotografija.html** - Photography specialist

**Template structure:**
```html
<!DOCTYPE html>
<html lang="lt">
<head>
  <title>Specialist Name - Paule.AI</title>
  <!-- Shared styles from /assets/css/ -->
</head>
<body>
  <script>
    // Specialist-specific system prompt
    const SPECIALIST_PROMPT = `You are an expert in...`;

    // Initialize with system message
    window.messages = [
      { role: 'system', content: SPECIALIST_PROMPT }
    ];
  </script>
  <!-- Shared UI components -->
</body>
</html>
```

---

## Summary

**Paule.AI** is a well-architected serverless AI platform with:
- **Provider-agnostic design** - Works with any LLM via fallback chain
- **Streaming-first** - Optimized Edge Runtime for SSE
- **Multi-brand support** - 4 URL namespaces
- **Creative services** - Music, video, image generation
- **Minimal dependencies** - Only 2 production packages
- **Zero build step** - Deploy-ready code

**Best practices for AI assistants:**
1. Use parameterized SQL queries
2. Include CORS headers in all responses
3. Handle OPTIONS preflight requests
4. Check feature flags before API calls
5. Implement proper error handling with descriptive messages
6. Test streaming endpoints manually before deployment
7. Never expose API keys to client-side code
8. Use Edge Runtime only for `/api/stream.js`
9. Follow CommonJS module syntax (except Edge Runtime)
10. Update `CLAUDE.md` when making architectural changes

**When in doubt, check:**
- `/api/stream.js` for provider implementation patterns
- `/lib/ai.js` for provider detection logic
- `/db/schema.sql` for data model
- `vercel.json` for routing configuration

---

**Last Updated:** 2025-11-14
**Version:** 1.0.0
**Maintained by:** Paule.AI Development Team
