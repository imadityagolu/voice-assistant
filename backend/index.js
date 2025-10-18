import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors({ origin: [
  'http://localhost:5173', // Vite dev
  'http://localhost:5174', // Vite dev (fallback port)
  'http://localhost:3000'  // if serving static
], credentials: false }));

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.GITHUB_MODELS_ENDPOINT || 'https://models.github.ai/inference';
const API_KEY = process.env.GITHUB_TOKEN || '';
const MODEL = process.env.GITHUB_MODEL || 'openai/gpt-4o';

let client;
function getClient() {
  if (!API_KEY) return null;
  if (!client) client = new OpenAI({ baseURL: BASE_URL, apiKey: API_KEY });
  return client;
}

app.post('/api/generate', async (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
  if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });
  if (!API_KEY) return res.status(400).json({ error: 'GITHUB_TOKEN missing in backend/.env' });

  try {
    const c = getClient();
    const response = await c.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a helpful, concise assistant.' },
        { role: 'user', content: prompt }
      ],
      model: MODEL,
      temperature: 0.7,
      max_tokens: 512,
      top_p: 0.95
    });

    let text = response?.choices?.[0]?.message?.content || '';
    res.json({ text: (text || '').trim() || 'No output.' });
  } catch (err) {
    const status = err?.status || 500;
    const message = err?.message || 'Request failed';
    res.status(status).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend API running at http://localhost:${PORT}`);
});