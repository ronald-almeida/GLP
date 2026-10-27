import { validateCustomer, digits } from './validation.js';
const $ = id => document.getElementById(id);
const form = $('checkout-form'), dialog = $('pix-dialog');
let payment = null, busy = false, uncertain = false, timer = null, checking = false, terminal = false;
function showErrors(errors) {
  for (const name of ['email','confirmEmail','name','document','phone']) {
    $(`${name}-error`).textContent = errors[name] || '';
    $(name).setAttribute('aria-invalid', String(Boolean(errors[name])));
  }
}
function openPayment() { if (!dialog.open) dialog.showModal(); if (!terminal) scheduleStatus(); }
function scheduleStatus() { clearTimeout(timer); if (dialog.open && !terminal) timer = setTimeout(checkStatus, 12000); }
function markTerminal(status) {
  terminal = true; clearTimeout(timer); dialog.classList.add('terminal');
  const paid = status === 'PAID';
  $('pix-title').textContent = paid ? 'Pagamento confirmado!' : status === 'REFUNDED' ? 'Pagamento estornado' : 'Pix encerrado';
  $('pix-description').textContent = paid ? 'Seu pagamento de R$ 599,40 foi recebido.' : 'Este código Pix não deve mais ser utilizado.';
  $('payment-status').textContent = paid ? '✓ Pagamento aprovado' : status === 'REFUNDED' ? 'Pagamento estornado' : 'Código expirado ou cancelado';
  $('payment-status').classList.toggle('paid', paid);
  $('expiration').textContent = '';
  $('generate-label').textContent = paid ? 'Ver pagamento confirmado' : 'Ver status do Pix';
  $('open-pix').textContent = 'Ver pagamento';
  dialog.querySelector('.modal-help').textContent = paid ? 'Guarde o comprovante do seu banco. Para informações sobre o acesso ao curso, entre em contato com o vendedor.' : 'Se você já pagou, confira o comprovante no aplicativo do seu banco e entre em contato com o vendedor.';
}
async function generate(event) {
  event?.preventDefault();
  if (busy || uncertain) return;
  if (payment) { openPayment(); return; }
  const data = Object.fromEntries(new FormData(form));
  const { errors } = validateCustomer(data); showErrors(errors);
  if (Object.keys(errors).length) { $(Object.keys(errors)[0]).focus(); return; }
  busy = true; $('generate').disabled = $('open-pix').disabled = true;
  $('generate-label').textContent = 'Gerando seu Pix…'; $('form-message').textContent = '';
  try {
    const response = await fetch('/api/pix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    let result;
    try { result = await response.json(); } catch { throw new Error('Não foi possível confirmar a geração. Consulte o vendedor antes de tentar novamente.'); }
    if (!response.ok) {
      if (result.errors) showErrors(result.errors);
      uncertain = Boolean(result.uncertain) || response.status >= 500 && response.status !== 503;
      $('form-message').textContent = result.message || 'Não foi possível gerar o Pix.';
      return;
    }
    if (!result.code || !result.qrImage || !result.token) throw new Error('Resposta incompleta. Consulte o vendedor antes de gerar outro Pix.');
    payment = result;
    $('pix-qr').src = result.qrImage; $('pix-code').value = result.code;
    $('expiration').textContent = `Válido até ${new Date(result.expiresAt).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' })}`;
    openPayment();
  } catch (error) {
    uncertain = true;
    $('form-message').textContent = 'A conexão foi interrompida e a cobrança pode ter sido criada. Consulte o vendedor antes de tentar novamente.';
  } finally {
    busy = false; $('generate').disabled = $('open-pix').disabled = uncertain;
    $('generate-label').textContent = payment ? 'Ver código QR' : uncertain ? 'Geração não confirmada' : 'Gerar código QR';
  }
}
async function checkStatus() {
  if (!payment || checking || terminal) return;
  if (document.hidden) { scheduleStatus(); return; }
  checking = true; $('check-status').disabled = true;
  try {
    const response = await fetch('/api/status', { headers: { Authorization: `Bearer ${payment.token}` }, signal: AbortSignal.timeout(25000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    if (result.status !== 'PENDING') { markTerminal(result.status); return; }
    if (Date.now() >= Date.parse(payment.expiresAt)) { markTerminal('CANCELLED'); return; }
    $('payment-status').textContent = 'Aguardando pagamento';
  } catch {
    $('payment-status').textContent = 'Consulta indisponível. Seu Pix permanece o mesmo.';
    if (Date.now() >= Date.parse(payment.expiresAt)) { markTerminal('CANCELLED'); return; }
  } finally { checking = false; $('check-status').disabled = false; scheduleStatus(); }
}
form.addEventListener('submit', generate);
$('open-pix').addEventListener('click', generate);
$('close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
dialog.addEventListener('close', () => { clearTimeout(timer); $('generate').focus(); });
$('check-status').addEventListener('click', checkStatus);
$('copy-code').addEventListener('click', async () => {
  if (!payment || terminal) return;
  if (Date.now() >= Date.parse(payment.expiresAt)) { await checkStatus(); return; }
  try { await navigator.clipboard.writeText(payment.code); $('copy-message').textContent = 'Código copiado! Agora abra o app do seu banco.'; $('copy-code').textContent = '✓ Código copiado'; }
  catch { $('pix-code').focus(); $('pix-code').select(); $('copy-message').textContent = 'Selecione e copie o código acima manualmente.'; }
});
for (const input of form.querySelectorAll('input')) input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); $(`${input.id}-error`).textContent = ''; });
$('document').addEventListener('input', e => {
  const d = digits(e.target.value).slice(0,14);
  e.target.value = d.length <= 11 ? d.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/,'$1.$2.$3-$4') : d.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/g,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2');
});
$('phone').addEventListener('input', e => { const d = digits(e.target.value).slice(0,11); e.target.value = d.replace(/^(\d{2})(\d)/,'($1) $2').replace(/(\d{4,5})(\d{4})$/,'$1-$2'); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && dialog.open && payment && !terminal) checkStatus(); });
