import { createHmac, timingSafeEqual } from 'node:crypto';
export const AMOUNT = 59940;
export const TITLE = 'Prescrição de Canetas na Prática Médica';
const BASE = 'https://api.blackcatoficial.com/api';
export function signTransaction(id, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ id, exp: now + 172800000 })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function readTransaction(token, secret) {
  if (typeof token !== 'string' || token.length > 1024) throw new Error('Invalid token');
  const [payload, signature, extra] = token.split('.');
  const expected = createHmac('sha256', secret).update(payload || '').digest();
  const received = Buffer.from(signature || '', 'base64url');
  if (extra || expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error('Invalid token');
  const data = JSON.parse(Buffer.from(payload, 'base64url'));
  if (!data.id || typeof data.id !== 'string' || !Number.isFinite(data.exp) || data.exp < Date.now()) throw new Error('Expired token');
  return data.id;
}
export async function blackcat(path, { key, body, fetcher = fetch }) {
  const response = await fetcher(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000)
  });
  const result = await response.json();
  if (!response.ok || result.success !== true) throw new Error('Payment provider request failed');
  return result.data;
}
export function prepare(req, res, method) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== method) { res.setHeader('Allow', method); res.status(405).json({ message: 'Método não permitido.' }); return false; }
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) throw new Error(); }
    catch { res.status(403).json({ message: 'Origem não permitida.' }); return false; }
  }
  if (!process.env.BLACKCAT_API_KEY) { res.status(503).json({ message: 'O pagamento está temporariamente indisponível. Tente novamente mais tarde.' }); return false; }
  return true;
}
