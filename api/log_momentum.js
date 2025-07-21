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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPriceNow(id) {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;
    const res = await fetch(url, { headers: HEADERS });
    const json = await res.json();
    const val = json?.[id]?.usd ?? null;
    return { val, raw: json };
  } catch (e) {
    return { val: null, error: e.message };
  }
}

async function fetchHistoricalPrice(id, daysAgo) {
  try {
    const date = formatDate(daysAgo);
    const url = `https://api.coingecko.com/api/v3/coins/${id}/history?date=${date}`;
    const res = await fetch(url, { headers: HEADERS });
    const json = await res.json();
    const val = json?.market_data?.current_price?.usd ?? null;
    return { val, raw: json };
  } catch (e) {
    return { val: null, error: e.message };
  }
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

    const pNowObj = await fetchPriceNow(id);
    await delay(25000); // 20s pause
    const p3Obj = await fetchHistoricalPrice(id, 3);
    await delay(25000); // 20s pause
    const p7Obj = await fetchHistoricalPrice(id, 7);

    const pNow = pNowObj.val;
    const p3 = p3Obj.val;
    const p7 = p7Obj.val;

    const accelLog = computeAccelLog(pNow, p3, p7);

    if (accelLog === null) {
      return res.status(422).json({
        error: 'Computation failed',
        id,
        pNow,
        p3,
        p7,
        pNow_raw: pNowObj.raw ?? null,
        p3_raw: p3Obj.raw ?? null,
        p7_raw: p7Obj.raw ?? null
      });
    }

    return res.status(200).json({
      id,
      pt: pNow,
      pt_minus3: p3,
      pt_minus7: p7,
      accel_log: accelLog
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Internal Server Error',
      details: err.message,
      id: req.body?.id ?? null
    });
  }
};
