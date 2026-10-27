import test from 'node:test';
import assert from 'node:assert/strict';
import pix from '../api/pix.js';
import status from '../api/status.js';
import { validateCustomer, validDocument } from '../public/validation.js';
import { signTransaction, readTransaction } from '../lib/blackcat.js';
const customer = {name:'Pessoa de Teste',email:'checkout@example.test',confirmEmail:'checkout@example.test',document:'52998224725',phone:'11999999999'};
function response() { return { code:200, headers:{}, setHeader(k,v){this.headers[k]=v;},status(v){this.code=v;return this;},json(v){this.body=v;return this;} }; }
const request = body => ({method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json'},body});
test('validates CPF/CNPJ, email confirmation and contact information', () => {
  assert.equal(validDocument('529.982.247-25'),true);
  assert.equal(validDocument('11.222.333/0001-81'),true);
  for (const n of ['00000000000','52998224724','11222333000182','123']) assert.equal(validDocument(n),false);
  assert.deepEqual(validateCustomer(customer).errors,{});
  assert.ok(validateCustomer({...customer,confirmEmail:'other@example.test'}).errors.confirmEmail);
});
test('signed status token rejects tampering and expired tokens', () => {
  const token = signTransaction('TXN-TEST','test-key');
  assert.equal(readTransaction(token,'test-key'),'TXN-TEST');
  assert.throws(() => readTransaction(token,'other-key'));
  assert.throws(() => readTransaction(signTransaction('TXN-TEST','test-key',0),'test-key'));
});
test('payment boundary fixes amount and keeps API key on server', async t => {
  t.mock.method(globalThis,'fetch',async (url,options) => {
    assert.equal(url,'https://api.blackcatoficial.com/api/sales/create-sale');
    assert.equal(options.headers['X-API-Key'],'test-only-key');
    const payload = JSON.parse(options.body);
    assert.equal(payload.amount,59940);assert.equal(payload.items[0].unitPrice,59940);
    assert.equal(payload.paymentMethod,'pix');assert.equal(payload.items[0].tangible,false);
    return new Response(JSON.stringify({success:true,data:{transactionId:'TXN-TEST',amount:59940,paymentData:{copyPaste:'000201TEST-ONLY-NOT-A-PAYMENT',expiresAt:new Date(Date.now()+86400000).toISOString()}}}),{status:201});
  });
  process.env.BLACKCAT_API_KEY='test-only-key';
  t.after(()=>delete process.env.BLACKCAT_API_KEY);
  const res=response();await pix(request({...customer,amount:1}),res);
  assert.equal(res.code,201);assert.equal(res.body.amount,59940);assert.match(res.body.qrImage,/^data:image\/png;base64,/);
  assert.ok(!JSON.stringify(res.body).includes('test-only-key'));
  assert.equal(readTransaction(res.body.token,'test-only-key'),'TXN-TEST');
});
test('rejects missing key, invalid data and cross-origin calls without requesting provider',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',()=>{calls++;throw new Error();});
  delete process.env.BLACKCAT_API_KEY;
  const missing=response();await pix(request(customer),missing);assert.equal(missing.code,503);
  process.env.BLACKCAT_API_KEY='test-only-key';t.after(()=>delete process.env.BLACKCAT_API_KEY);
  const invalid=response();await pix(request({...customer,document:'123'}),invalid);assert.equal(invalid.code,422);
  const foreign=response();const req=request(customer);req.headers.origin='https://foreign.example';await pix(req,foreign);assert.equal(foreign.code,403);
  assert.equal(calls,0);
});
test('timeout stays uncertain and is not retried',async t=>{
  process.env.BLACKCAT_API_KEY='test-only-key';t.after(()=>delete process.env.BLACKCAT_API_KEY);
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('Timeout');});
  const res=response();await pix(request(customer),res);
  assert.equal(res.code,502);assert.equal(res.body.uncertain,true);assert.equal(calls,1);
});
test('status requires signed token and verifies transaction amount',async t=>{
  process.env.BLACKCAT_API_KEY='test-only-key';t.after(()=>delete process.env.BLACKCAT_API_KEY);
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({success:true,data:{transactionId:'TXN-TEST',amount:59940,status:'PAID'}})));
  const req={method:'GET',headers:{host:'localhost:3000',authorization:`Bearer ${signTransaction('TXN-TEST','test-only-key')}`}};
  const res=response();await status(req,res);assert.deepEqual(res.body,{status:'PAID'});
  const bad=response();await status({...req,headers:{host:'localhost:3000'}},bad);assert.equal(bad.code,401);
});
