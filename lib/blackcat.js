import { createHmac, timingSafeEqual } from 'node:crypto';
export const AMOUNT = 59940;
export const TITLE = 'Prescrição de Canetas na Prática Médica';
const BASE = 'https://api.blackcatoficial.com/api';
export class BlackcatError extends Error {
  constructor(code, { providerStatus = null, uncertain = true } = {}) {
    super(code); this.name = 'BlackcatError'; this.code = code;
    this.providerStatus = providerStatus; this.uncertain = uncertain;
  }
}
export function paymentFailure(error, reference) {
  const code = error instanceof BlackcatError ? error.code : 'PAYMENT_RESPONSE_INVALID';
  const uncertain = error instanceof BlackcatError ? error.uncertain : true;
  const messages = {
    PROVIDER_AUTH: 'O pagamento está indisponível por uma configuração do vendedor. Entre em contato com o vendedor.',
    PROVIDER_FORBIDDEN: 'O recebimento por Pix não está habilitado para este vendedor. Entre em contato com o vendedor.',
    PROVIDER_VALIDATION: 'Os dados da compra foram recusados. Confira nome, email, CPF/CNPJ e celular antes de tentar novamente.',
    PROVIDER_RATE_LIMIT: 'Há muitas solicitações de pagamento neste momento. Aguarde um minuto e tente novamente.',
    PROVIDER_ENDPOINT: 'O serviço de pagamento está indisponível. Entre em contato com o vendedor.'
  };
  console.error(JSON.stringify({ event:'pix_failure', code, providerStatus:error.providerStatus ?? null, uncertain, reference }));
  return { status: code === 'PROVIDER_VALIDATION' ? 422 : code === 'PROVIDER_RATE_LIMIT' ? 429 : uncertain ? 502 : 503,
    body: { code, uncertain, reference, message: messages[code] || 'A resposta do pagamento não pôde ser confirmada. A cobrança pode ter sido criada; consulte o vendedor antes de gerar outro Pix.' } };
}
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
  let response;
  try { response = await fetcher(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000)
  }); } catch (error) {
    throw new BlackcatError(error.name === 'TimeoutError' || error.name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK');
  }
  // HTTP rejections are different from losing the response after creating a sale.
  const rejection = {400:'PROVIDER_VALIDATION',401:'PROVIDER_AUTH',403:'PROVIDER_FORBIDDEN',404:'PROVIDER_ENDPOINT',422:'PROVIDER_VALIDATION',429:'PROVIDER_RATE_LIMIT'}[response.status];
  if (rejection) throw new BlackcatError(rejection, {providerStatus:response.status, uncertain:false});
  if (!response.ok) throw new BlackcatError('PROVIDER_UNAVAILABLE', {providerStatus:response.status});
  let result;
  try { result = await response.json(); } catch { throw new BlackcatError('PROVIDER_INVALID_JSON', {providerStatus:response.status}); }
  if (result?.success !== true || !result.data) throw new BlackcatError('PROVIDER_RESPONSE_INVALID', {providerStatus:response.status});
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
  if (!process.env.BLACKCAT_API_KEY?.trim()) { res.status(503).json({ code:'PAYMENT_NOT_CONFIGURED', uncertain:false, message: 'O pagamento ainda não foi configurado pelo vendedor. Entre em contato com o vendedor.' }); return false; }
  return true;
}

