// Vision refinement endpoint: takes a screenshot of the current build,
// sends it to Claude with vision, and asks for an improved JSON build.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { build, imageDataUrl, originalRequest, difficulty } = req.body;
    if (!build || !imageDataUrl || !originalRequest) {
      return res.status(400).json({ error: 'build, imageDataUrl, and originalRequest required' });
    }

    // Strip data URL prefix to get base64
    const base64Match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!base64Match) {
      return res.status(400).json({ error: 'Invalid image data URL' });
    }
    const mediaType = base64Match[1];
    const imageData = base64Match[2];

    const systemPrompt = `You are BrickBot, a master LEGO designer. Your job is to LOOK at a current LEGO build and REVISE it to better match what the user asked for.

You have the same piece type library as before:
- "brick", "tile" (smooth), "plate"
- "slope" (direction: east/west/north/south) — for ramps, roofs, angled noses
- "slope_inv" (direction: same) — for overhangs
- "wedge" (direction: sw/se/ne/nw) — for plane wings, swept shapes — RIGHT ANGLE goes at the named corner, hypotenuse opposite
- "cone" — narrow at top, for nose cones, tower spires, tree tops
- "cylinder" — round pillars, for engines, antennas, chimneys
- "round_brick" — round details
- "arch" — doorways

COORDINATE SYSTEM: X=left/right, Z=front/back, Y=up. 1 unit = 1 stud horizontally, 1 brick height vertically. Bricks at y>0 need support below.

WHAT TO LOOK FOR in the image:
- Does the current build actually LOOK like what the user asked for? Be honest with yourself.
- Is the silhouette right? (e.g., X-Wing should have 4 visible angled wings)
- Are the proportions right? (Cars wide & low; rockets tall & narrow)
- Are the distinctive features there? (Cockpit, engines, wings, nose cone, chimney, etc.)
- Is it using the right piece types? (Wings should be wedges, noses should be slopes/cones, engines should be cylinders)
- Is it too flat? Too small? Too rectangular?

WHAT TO DO:
- REWRITE the build from scratch to better match the request.
- Keep the same difficulty (target the same brick count range).
- USE WEDGES for wings (this is critical — flat rectangular wings look wrong).
- USE CONES for nose cones, tower tips, tree tops.
- USE CYLINDERS for engines, antennas, chimneys.
- USE SLOPES for angled surfaces, roofs, windshields.
- Add the distinctive features that make this thing recognizable.
- Build with real 3D volume — use all 3 axes.

Respond with ONLY a JSON object (no markdown, no backticks, no commentary):
{"type": "build", "name": "...", "description": "...", "bricks": [...], "steps": [...]}

Each brick: {"id", "step", "x", "y", "z", "width", "depth", "height", "color", "type", "direction" (if slope/wedge), "label"}
Each step: {"step", "title", "description", "brickIds": [...]}`;

    const userMessage = {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: imageData },
        },
        {
          type: 'text',
          text: `The user originally asked for: "${originalRequest}"

The image above shows the current ${difficulty} build called "${build.name || ''}".

Here's the JSON of the current build:
${JSON.stringify(build, null, 0)}

Please look at the image carefully. Does it actually look like "${originalRequest}"? If not, REVISE the build to be much more recognizable. Use slopes, wedges, cones, cylinders aggressively to give it the right shape. Keep it at ${difficulty} complexity. Return ONLY the improved JSON build (no markdown, no commentary).`,
        },
      ],
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        system: systemPrompt,
        messages: [userMessage],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return res.status(response.status).json({ error: 'AI service error', detail: errorText.slice(0, 200) });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
