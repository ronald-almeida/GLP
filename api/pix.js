import QRCode from 'qrcode';
import { randomUUID } from 'node:crypto';
import { validateCustomer } from '../public/validation.js';
import { AMOUNT, TITLE, blackcat, signTransaction, prepare, BlackcatError, paymentFailure } from '../lib/blackcat.js';
export default async function handler(req, res) {
  // Read-only readiness check: verifies credentials without creating a charge.
  if (req.method === 'GET') {
    if (!prepare(req, res, 'GET')) return;
    try {
      await blackcat('/sales/seller', {key:process.env.BLACKCAT_API_KEY.trim()});
      return res.status(200).json({available:true});
    } catch (error) {
      const failure = paymentFailure(error, randomUUID());
      return res.status(failure.status).json({...failure.body, uncertain:false, available:false,
        message:failure.body.uncertain ? 'Não foi possível verificar a conexão com o serviço de pagamento.' : failure.body.message});
    }
  }
  if (!prepare(req, res, 'POST')) return;
  if (!String(req.headers['content-type'] || '').includes('application/json')) return res.status(415).json({ message: 'Envie os dados em JSON.' });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || JSON.stringify(req.body).length > 4096) return res.status(400).json({ message: 'Dados inválidos.' });
  const { customer, errors } = validateCustomer(req.body);
  if (Object.keys(errors).length) return res.status(422).json({ message: 'Confira os dados informados.', errors });
  const body = { amount: AMOUNT, currency: 'BRL', paymentMethod: 'pix', items: [{ title: TITLE, unitPrice: AMOUNT, quantity: 1, tangible: false }], customer, pix: { expiresInDays: 1 }, externalRef: randomUUID() };
  if (process.env.BLACKCAT_POSTBACK_URL) body.postbackUrl = process.env.BLACKCAT_POSTBACK_URL;
  try {
    const sale = await blackcat('/sales/create-sale', { key: process.env.BLACKCAT_API_KEY.trim(), body });
    const code = sale?.paymentData?.copyPaste || sale?.paymentData?.qrCode;
    const rawExpiry = sale?.paymentData?.expiresAt;
    const expiresAt = rawExpiry == null ? null : rawExpiry;
    const amount = typeof sale?.amount === 'string' && /^\d+$/.test(sale.amount) ? Number(sale.amount) : sale?.amount;
    if (typeof code !== 'string' || !code.startsWith('000201') || code.length > 4096) throw new BlackcatError('PAYMENT_CODE_INVALID');
    if (typeof sale.transactionId !== 'string' || !sale.transactionId) throw new BlackcatError('PAYMENT_ID_INVALID');
    if (amount !== AMOUNT) throw new BlackcatError('PAYMENT_AMOUNT_MISMATCH');
    // Missing expiry must not discard a valid charge; status remains authoritative.
    if (expiresAt !== null && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) throw new BlackcatError('PAYMENT_EXPIRY_INVALID');
    const qrImage = await QRCode.toDataURL(code, { width: 320, margin: 2, errorCorrectionLevel: 'M' });
    return res.status(201).json({ code, qrImage, expiresAt, amount: AMOUNT, token: signTransaction(sale.transactionId, process.env.BLACKCAT_API_KEY) });
  } catch (error) {
    // A timeout may occur AFTER the provider created the charge. Never retry automatically.
    const failure = paymentFailure(error, body.externalRef);
    return res.status(failure.status).json(failure.body);
  }
}

