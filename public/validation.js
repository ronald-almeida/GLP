export const digits = value => String(value ?? '').replace(/\D/g, '');
export function validDocument(value) {
  const n = digits(value);
  if (!/^(\d{11}|\d{14})$/.test(n) || /^(\d)\1+$/.test(n)) return false;
  const calc = weights => { const sum = weights.reduce((s, w, i) => s + Number(n[i]) * w, 0); const mod = sum % 11; return mod < 2 ? 0 : 11 - mod; };
  if (n.length === 11) return calc([10,9,8,7,6,5,4,3,2]) === +n[9] && calc([11,10,9,8,7,6,5,4,3,2]) === +n[10];
  return calc([5,4,3,2,9,8,7,6,5,4,3,2]) === +n[12] && calc([6,5,4,3,2,9,8,7,6,5,4,3,2]) === +n[13];
}
export function validateCustomer(body = {}) {
  const errors = {};
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  const email = String(body.email ?? '').trim().toLowerCase();
  const confirmEmail = String(body.confirmEmail ?? '').trim().toLowerCase();
  const document = digits(body.document), phone = digits(body.phone);
  if (name.length < 5 || name.length > 120 || name.split(' ').length < 2) errors.name = 'Digite seu nome completo.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.email = 'Digite um email válido.';
  if (confirmEmail !== email) errors.confirmEmail = 'Os emails precisam ser iguais.';
  if (!validDocument(document)) errors.document = 'Digite um CPF ou CNPJ válido.';
  if (!/^[1-9]\d{9,10}$/.test(phone)) errors.phone = 'Digite o DDD e o número do celular.';
  return { errors, customer: { name, email, phone, document: { number: document, type: document.length === 11 ? 'cpf' : 'cnpj' } } };
}
