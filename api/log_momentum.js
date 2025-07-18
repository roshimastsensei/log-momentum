const fetch = require('node-fetch');

function formatDate(daysAgo) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; LMR-Bot/1.0; +https://log-momentum.vercel.app)'
};

async function fetchPriceNow(id) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.[id]?.usd ?? null;
}

async function fetchHistoricalPrice(id, daysAgo) {
  const date = formatDate(daysAgo);
  const url = `https://api.coingecko.com/api/v3/coins/${id}/history?date=${date}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.market_data?.current_price?.usd ?? null;
}

function computeAccelLog(pNow, p3, p7) {
  if (!pNow || !p3 || !p7 || p3 <= 0) return null;
  const numerator = pNow * p7;
  const denominator = p3 ** 2;
  if (denominator === 0 || numerator <= 0) return null;
  return Math.log(numerator / denominator);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ error: 'Method Not Allowed' });
  }

  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Missing token ID' });
    }

    const [pNow, p3, p7] = await Promise.all([
      fetchPriceNow(id),
      fetchHistoricalPrice(id, 3),
      fetchHistoricalPrice(id, 7),
    ]);

    if (pNow === null || p3 === null || p7 === null) {
      return res.status(502).json({ error: 'Price fetch failed', id, pNow, p3, p7 });
    }

    const accelLog = computeAccelLog(pNow, p3, p7);
    if (accelLog === null) {
      return res.status(422).json({ error: 'Computation failed', id, pNow, p3, p7 });
    }

    return res.status(200).json({
      id,
      pt: pNow,
      pt_minus3: p3,
      pt_minus7: p7,
      accel_log: accelLog,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
};
