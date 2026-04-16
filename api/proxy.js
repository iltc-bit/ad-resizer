export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const action = url.searchParams.get('action');

  // Read raw body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  // === OCR: detect text blocks via Google Vision ===
  if (action === 'ocr') {
    const visionKey = process.env.GOOGLE_VISION_API_KEY;
    if (!visionKey) return res.status(500).json({ error: 'GOOGLE_VISION_API_KEY not set' });

    const parsed = JSON.parse(body.toString());
    const base64Image = parsed.image; // base64 string without data: prefix

    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [{ type: 'TEXT_DETECTION', maxResults: 100 }]
          }]
        })
      }
    );

    const visionData = await visionRes.json();
    const annotations = visionData.responses?.[0]?.textAnnotations || [];

    // Skip first annotation (full text), return individual word/block bounding boxes
    const blocks = annotations.slice(1).map(a => ({
      text: a.description,
      vertices: a.boundingPoly.vertices
    }));

    return res.status(200).json({ blocks });
  }

  // === OpenAI image edit (outpaint) ===
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
