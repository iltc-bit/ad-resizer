export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  // Stream raw body to OpenAI
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  const openaiRes = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': req.headers['content-type'],
    },
    body,
  });

  const data = await openaiRes.json();
  res.status(openaiRes.status).json(data);
}
