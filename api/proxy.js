const config = { api: { bodyParser: false } };
module.exports = { config };

module.exports.default = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const action = url.searchParams.get('action');

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  if (action === 'ocr') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

    let parsed;
    try { parsed = JSON.parse(body.toString()); }
    catch(e) { return res.status(400).json({ error: 'Invalid JSON' }); }

    const { image, width, height } = parsed;
    if (!image) return res.status(400).json({ error: 'Missing image' });

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
              text: `This image is exactly ${width}x${height} pixels. Find all text regions. For each block return: "text", "x" (left edge px), "y" (top edge px), "w" (width px), "h" (height px). Be precise. Return ONLY a JSON array, no markdown. Example: [{"text":"Hello","x":10,"y":20,"w":100,"h":30}]`
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${image}`, detail: 'high' }
            }
          ]
        }]
      })
    });

    const gptData = await gptRes.json();
    console.log('GPT status:', gptRes.status);

    if (!gptRes.ok) {
      return res.status(400).json({ error: gptData.error?.message || 'GPT error' });
    }

    const content = gptData.choices?.[0]?.message?.content || '[]';
    console.log('GPT raw:', content.slice(0, 200));

    let rawBlocks = [];
    try {
      const clean = content.replace(/```json\n?|\n?```/g, '').trim();
      rawBlocks = JSON.parse(clean);
    } catch(e) {
      console.log('Parse error:', e.message);
      rawBlocks = [];
    }

    const blocks = rawBlocks.map(b => ({
      text: b.text,
      x: b.x, y: b.y, w: b.w, h: b.h,
      vertices: [
        {x: b.x, y: b.y},
        {x: b.x + b.w, y: b.y},
        {x: b.x + b.w, y: b.y + b.h},
        {x: b.x, y: b.y + b.h}
      ]
    }));

    console.log('Blocks:', blocks.length);
    return res.status(200).json({ blocks });
  }

  // OpenAI image edit
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
};
