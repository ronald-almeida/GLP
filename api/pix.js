import QRCode from 'qrcode';
import { randomUUID } from 'node:crypto';
import { validateCustomer } from '../public/validation.js';
import { AMOUNT, TITLE, blackcat, signTransaction, prepare } from '../lib/blackcat.js';
export default async function handler(req, res) {
  if (!prepare(req, res, 'POST')) return;
  if (!String(req.headers['content-type'] || '').includes('application/json')) return res.status(415).json({ message: 'Envie os dados em JSON.' });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || JSON.stringify(req.body).length > 4096) return res.status(400).json({ message: 'Dados inválidos.' });
  const { customer, errors } = validateCustomer(req.body);
  if (Object.keys(errors).length) return res.status(422).json({ message: 'Confira os dados informados.', errors });
  const body = { amount: AMOUNT, currency: 'BRL', paymentMethod: 'pix', items: [{ title: TITLE, unitPrice: AMOUNT, quantity: 1, tangible: false }], customer, pix: { expiresInDays: 1 }, externalRef: randomUUID() };
  if (process.env.BLACKCAT_POSTBACK_URL) body.postbackUrl = process.env.BLACKCAT_POSTBACK_URL;
  try {
    const sale = await blackcat('/sales/create-sale', { key: process.env.BLACKCAT_API_KEY, body });
    const code = sale?.paymentData?.copyPaste || sale?.paymentData?.qrCode;
    const expiresAt = sale?.paymentData?.expiresAt;
    if (typeof code !== 'string' || !code.startsWith('000201') || code.length > 4096 || !sale.transactionId || sale.amount !== AMOUNT || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) throw new Error('Invalid payment response');
    const qrImage = await QRCode.toDataURL(code, { width: 320, margin: 2, errorCorrectionLevel: 'M' });
    return res.status(201).json({ code, qrImage, expiresAt, amount: AMOUNT, token: signTransaction(sale.transactionId, process.env.BLACKCAT_API_KEY) });
  } catch {
    // A timeout may occur AFTER the provider created the charge. Never retry automatically.
    return res.status(502).json({ uncertain: true, message: 'Não foi possível confirmar a geração do Pix. Para evitar uma cobrança duplicada, aguarde e entre em contato com o vendedor antes de tentar novamente.' });
  }
}
