import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ModelClient, { isUnexpected } from '@azure-rest/ai-inference';
import { AzureKeyCredential } from '@azure/core-auth';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: [
  'http://localhost:5173', // Vite dev
  'http://localhost:5174', // Vite dev (fallback port)
  'http://localhost:3000'  // if serving static
], credentials: false }));

const PORT = process.env.PORT || 3000;
const ENDPOINT = (process.env.GITHUB_MODELS_ENDPOINT || 'https://models.github.ai/inference').trim();
const API_KEY = process.env.GITHUB_TOKEN || '';
const MODEL = (process.env.GITHUB_MODEL || 'openai/gpt-4.1').trim();
// Add caps to avoid long hangs
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15000);
const MAX_WAIT_MS_PER_ATTEMPT = Number(process.env.RETRY_MAX_WAIT_MS || 5000);

let client;
function getClient() {
  if (!API_KEY) return null;
  if (!client) client = ModelClient(ENDPOINT, new AzureKeyCredential(API_KEY));
  return client;
}

// --- Simple in-memory rate limiter (per IP) ---
const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_RPM = Number(process.env.RPM_LIMIT || 20); // requests per minute per IP
const buckets = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'local';
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket || (now - bucket.resetAt) >= WINDOW_MS) {
    bucket = { resetAt: now, count: 0 };
  }
  bucket.count += 1;
  buckets.set(ip, bucket);
  if (bucket.count > MAX_RPM) {
    const secs = Math.ceil((WINDOW_MS - (now - bucket.resetAt)) / 1000);
    res.set('Retry-After', String(secs));
    return res.status(429).json({ error: 'Too many requests. Please wait ~1 minute and retry.' });
  }
  next();
}

// --- Retry helper with exponential backoff for 429s ---
async function callWithRetry(fn, attempts = 3) {
  let delay = 1000; // start with 1s
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status || err?.response?.status;
      // Prefer upstream Retry-After header if present
      const retryAfterHeader = err?.response?.headers?.['retry-after'] || err?.headers?.['retry-after'];
      const retryAfterMsRaw = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
      if (status === 429 && i < attempts - 1) {
        const waitBase = retryAfterMsRaw ?? (delay + Math.floor(Math.random() * 250));
        const waitMs = Math.min(waitBase, MAX_WAIT_MS_PER_ATTEMPT);
        await new Promise(r => setTimeout(r, waitMs));
        delay = Math.min(delay * 2, 8000); // cap base at 8s
        continue;
      }
      throw err;
    }
  }
}

// Add overall request timeout wrapper
async function withTimeout(promise, ms) {
  return await Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('Upstream timeout'), { status: 504 })), ms)
    )
  ]);
}

// Azure wrapper: throws when response is unexpected
async function createCompletion(c, payload) {
  const response = await c.path('/chat/completions').post({ body: payload });
  if (isUnexpected(response)) {
    const err = new Error(response?.body?.error?.message || 'Upstream error');
    err.status = response?.status;
    err.headers = response?.headers;
    throw err;
  }
  return response;
}

app.post('/api/generate', rateLimit, async (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
  if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });
  if (!API_KEY) return res.status(400).json({ error: 'GITHUB_TOKEN missing in backend/.env' });

  try {
    const c = getClient();
    const response = await withTimeout(
      callWithRetry(() => createCompletion(c, {
        messages: [
          { role: 'system', content: '' },
          { role: 'user', content: prompt }
        ],
        temperature: 1,
        top_p: 1,
        model: MODEL
      })),
      REQUEST_TIMEOUT_MS
    );

    const text = response?.body?.choices?.[0]?.message?.content || '';
    res.json({ text: (text || '').trim() || 'No output.' });
  } catch (err) {
    const status = err?.status || err?.response?.status || 500;
    // propagate upstream Retry-After if present
    if (status === 429) {
      const retryAfterHeader = err?.response?.headers?.['retry-after'] || err?.headers?.['retry-after'];
      if (retryAfterHeader) res.set('Retry-After', String(retryAfterHeader));
    }
    const message = status === 429
      ? 'Rate limited upstream. Please reduce frequency or wait and retry.'
      : (err?.message || 'Request failed');
    res.status(status).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend API running at http://localhost:${PORT}`);
});