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

    let parsed;
    try {
      parsed = JSON.parse(body.toString());
    } catch(e) {
      return res.status(400).json({ error: 'Invalid JSON body', detail: e.message });
    }

    const base64Image = parsed.image;
    if (!base64Image) return res.status(400).json({ error: 'Missing image field' });

    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Image },
            features: [
              { type: 'TEXT_DETECTION', maxResults: 100 },
              { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 100 }
            ]
          }]
        })
      }
    );

    const visionData = await visionRes.json();

    // Log for debugging
    console.log('Vision status:', visionRes.status);
    console.log('Vision response keys:', JSON.stringify(Object.keys(visionData)));
    const resp0 = visionData.responses?.[0];
    console.log('Response[0] keys:', JSON.stringify(Object.keys(resp0 || {})));
    console.log('textAnnotations count:', resp0?.textAnnotations?.length || 0);
    console.log('error:', JSON.stringify(resp0?.error));

    if (resp0?.error) {
      return res.status(400).json({ error: resp0.error.message, code: resp0.error.code });
    }

    const annotations = resp0?.textAnnotations || [];
    const blocks = annotations.slice(1).map(a => ({
      text: a.description,
      vertices: a.boundingPoly.vertices
    }));

    return res.status(200).json({
      blocks,
      debug: {
        annotationCount: annotations.length,
        visionStatus: visionRes.status,
        imageLength: base64Image.length
      }
    });
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
