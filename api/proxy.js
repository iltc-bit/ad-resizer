export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const action = url.searchParams.get('action');

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  // === OCR via GPT-4o vision ===
  if (action === 'ocr') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

    let parsed;
    try { parsed = JSON.parse(body.toString()); }
    catch(e) { return res.status(400).json({ error: 'Invalid JSON' }); }

    const base64Image = parsed.image;
    if (!base64Image) return res.status(400).json({ error: 'Missing image' });

    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Detect all text in this image and return their bounding box coordinates.
Return ONLY a JSON array, no other text. Each item should have:
- "text": the text content
- "vertices": array of 4 points [{x,y},{x,y},{x,y},{x,y}] as pixel coordinates (top-left, top-right, bottom-right, bottom-left)

The image is ${parsed.width}x${parsed.height} pixels.
Be precise with coordinates. Include ALL visible text including logos, buttons, and small text.
Return format: [{"text":"...","vertices":[{"x":0,"y":0},...]},...]`
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${base64Image}`, detail: 'high' }
            }
          ]
        }]
      })
    });

    const gptData = await gptRes.json();
    console.log('GPT OCR status:', gptRes.status);

    if (!gptRes.ok) {
      return res.status(400).json({ error: gptData.error?.message || 'GPT error' });
    }

    const content = gptData.choices?.[0]?.message?.content || '[]';
    console.log('GPT OCR raw:', content.slice(0, 200));

    let blocks = [];
    try {
      const clean = content.replace(/```json\n?|\n?```/g, '').trim();
      blocks = JSON.parse(clean);
    } catch(e) {
      console.log('Parse error:', e.message);
      blocks = [];
    }

    console.log('Parsed blocks:', blocks.length);
    return res.status(200).json({ blocks });
  }

  // === OpenAI image edit ===
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

  const openaiRes = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': req.headers['content-type'],
    },
    body,
  });

  const data = await openaiRes.json();
  res.status(openaiRes.status).json(data);
}
