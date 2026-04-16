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

  // === Layout analysis via GPT-4o ===
  if (action === 'analyze') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });

    let parsed;
    try { parsed = JSON.parse(body.toString()); }
    catch(e) { return res.status(400).json({ error: 'Invalid JSON' }); }

    const { image, origW, origH, targetW, targetH, targetName } = parsed;

    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `你是廣告設計顧問。這是一張 ${origW}x${origH} 的廣告圖，需要重新排版成 ${targetW}x${targetH}（${targetName}）。

請分析這張圖，用繁體中文輸出以下內容（JSON格式）：

{
  "elements": [
    {"type": "文字/logo/按鈕/圖片", "content": "內容描述", "currentPosition": "目前在哪裡（例：左側中央）", "suggestedPosition": "建議在新版位放在哪裡", "reason": "原因"}
  ],
  "layoutStrategy": "整體排版策略說明（2-3句）",
  "canvaSteps": [
    "步驟1：...",
    "步驟2：...",
    "步驟3：..."
  ],
  "warnings": ["注意事項1", "注意事項2"]
}

只回傳 JSON，不要其他文字。`
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
    if (!gptRes.ok) {
      return res.status(400).json({ error: gptData.error?.message || 'GPT error' });
    }

    const content = gptData.choices?.[0]?.message?.content || '{}';
    let analysis = {};
    try {
      const clean = content.replace(/```json\n?|\n?```/g, '').trim();
      analysis = JSON.parse(clean);
    } catch(e) {
      analysis = { layoutStrategy: content, elements: [], canvaSteps: [], warnings: [] };
    }

    return res.status(200).json(analysis);
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
};
