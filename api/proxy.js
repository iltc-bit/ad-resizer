export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = new URL(req.url, );
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
        'Authorization': ,
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
              text: 
            },
            {
              type: 'image_url',
              image_url: { url: , detail: 'high' }
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
    console.log('GPT raw:', content.slice(0, 300));

    let rawBlocks = [];
    try {
      const clean = content.replace(//g, '').trim();
      rawBlocks = JSON.parse(clean);
    } catch(e) {
      console.log('Parse error:', e.message, 'content:', content.slice(0,100));
      rawBlocks = [];
    }

    // Convert x/y/w/h format to vertices format for frontend compatibility
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

    console.log('Blocks found:', blocks.length);
    return res.status(200).json({ blocks });
  }

  // === OpenAI image edit ===
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

  const openaiRes = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      'Authorization': ,
      'Content-Type': req.headers['content-type'],
    },
    body,
  });

  const data = await openaiRes.json();
  res.status(openaiRes.status).json(data);
}
