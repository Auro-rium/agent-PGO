export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });

  const endpoint = process.env.GOOGLE_SCRIPT_URL;
  if (!endpoint) {
    return res.status(503).json({ error: 'Waitlist storage is being connected. Please use Book a call for now.' });
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        createdAt: new Date().toISOString(),
        source: String(req.body?.source || 'landing'),
        userAgent: String(req.body?.ua || '').slice(0, 500),
      }),
    });

    if (!upstream.ok) throw new Error(`Google endpoint ${upstream.status}`);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('waitlist_forward_failed', error);
    return res.status(502).json({ error: 'Could not save your email. Try again shortly.' });
  }
}
