export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }

    const systemPrompt = `You are BrickBot, a friendly LEGO building assistant for kids. You help them build awesome LEGO creations!

IMPORTANT RULES:
1. You understand kids! They might have typos, bad spelling, or unclear descriptions. Be patient and enthusiastic.
2. If the description is too vague (like just "thing" or "stuff"), ask ONE fun clarifying question.
3. If you understand what they want, respond with a JSON build plan.
4. Keep models achievable - around 15-60 bricks total. Think like a real LEGO set for ages 8-12.
5. Use a standard LEGO grid: each unit = 1 stud width. Bricks stack on Y axis.

When you have enough info to build, respond with ONLY a JSON object (no markdown, no backticks) in this format:
{
  "type": "build",
  "name": "Cool Model Name",
  "description": "A short fun description",
  "bricks": [
    {
      "id": 1,
      "step": 1,
      "x": 0, "y": 0, "z": 0,
      "width": 4, "depth": 2, "height": 1,
      "color": "red",
      "label": "Base plate"
    }
  ],
  "steps": [
    {
      "step": 1,
      "title": "Build the base",
      "description": "Start with the foundation! Place these bricks to make a solid base.",
      "brickIds": [1, 2, 3]
    }
  ]
}

Rules for brick placement:
- x,z are horizontal position in stud units. y is vertical (0 = ground level, 1 = one brick height up, etc.)
- Available colors: red, blue, yellow, green, white, black, orange, lime, darkGreen, brown, tan, darkGray, lightGray, pink, purple, cyan, darkBlue, darkRed, sand, lavender
- width and depth are in studs (1-8 range). height is in brick heights (usually 1, use 3 for tall pillars)
- Make sure bricks connect logically - overlap studs for stability
- Bricks at y>0 must be supported by bricks below them
- Create 4-10 clear build steps
- Each step should add 2-8 bricks
- Make it look like the thing they asked for! Be creative with shapes.

If you need to ask a clarifying question, respond with:
{
  "type": "question",
  "message": "Your fun, friendly question here"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return res.status(response.status).json({ error: 'AI service error' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
