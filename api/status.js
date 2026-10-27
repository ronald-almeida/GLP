import { AMOUNT, blackcat, readTransaction, prepare } from '../lib/blackcat.js';
export default async function handler(req, res) {
  if (!prepare(req, res, 'GET')) return;
  let id;
  try { id = readTransaction(req.headers.authorization?.replace(/^Bearer /, ''), process.env.BLACKCAT_API_KEY); }
  catch { return res.status(401).json({ message: 'Esta consulta expirou. Confira o pagamento no seu banco.' }); }
  try {
    const sale = await blackcat(`/sales/${encodeURIComponent(id)}/status`, { key: process.env.BLACKCAT_API_KEY });
    if (sale.transactionId !== id || sale.amount !== AMOUNT || !['PENDING','PAID','CANCELLED','REFUNDED'].includes(sale.status)) throw new Error('Invalid status');
    return res.status(200).json({ status: sale.status });
  } catch { return res.status(502).json({ message: 'Não foi possível consultar o pagamento agora.' }); }
}
