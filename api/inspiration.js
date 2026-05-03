// Rebrickable inspiration endpoint
// Looks up real LEGO sets matching the user's query.
// Requires REBRICKABLE_API_KEY env var. Returns null gracefully if not set.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const rebrickableKey = process.env.REBRICKABLE_API_KEY;
  if (!rebrickableKey) {
    // Gracefully return empty if no key is configured
    return res.status(200).json({ set: null, configured: false });
  }

  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query required' });
    }

    // Sanitize and limit query length
    const cleanQuery = query.slice(0, 100).trim();

    // Search Rebrickable for sets matching this query
    const url = `https://rebrickable.com/api/v3/lego/sets/?search=${encodeURIComponent(cleanQuery)}&page_size=5&ordering=-num_parts`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `key ${rebrickableKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Rebrickable API error:', response.status);
      return res.status(200).json({ set: null });
    }

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      return res.status(200).json({ set: null });
    }

    // Pick the one with the most parts that's not a tiny polybag
    // Prefer sets between 100-2000 parts (real-feeling sets)
    const sets = data.results;
    let best = sets.find(s => s.num_parts >= 100 && s.num_parts <= 2000) || sets[0];

    return res.status(200).json({
      set: {
        set_num: best.set_num,
        name: best.name,
        year: best.year,
        num_parts: best.num_parts,
        set_img_url: best.set_img_url,
        theme_id: best.theme_id,
      },
      configured: true,
    });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(200).json({ set: null });
  }
}
