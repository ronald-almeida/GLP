import test from 'node:test';
import assert from 'node:assert/strict';
import pix from '../api/pix.js';
import { normalizeExpiry } from '../lib/blackcat.js';
const customer = {name:'Pessoa de Teste',email:'checkout@example.test',confirmEmail:'checkout@example.test',document:'52998224725',phone:'11999999999'};
function response() { return { code:200, setHeader(){},status(v){this.code=v;return this;},json(v){this.body=v;return this;} }; }
function setup(t, fetcher) {
  process.env.BLACKCAT_API_KEY=' test-only-key ';
  t.after(()=>delete process.env.BLACKCAT_API_KEY);
  t.mock.method(globalThis,'fetch',fetcher);
  const logs=[];t.mock.method(console,'error',line=>logs.push(line));return logs;
}
const req = () => ({method:'POST',headers:{host:'localhost:3000','content-type':'application/json'},body:customer});
for (const [http,code,status] of [[400,'PROVIDER_VALIDATION',422],[401,'PROVIDER_AUTH',503],[403,'PROVIDER_FORBIDDEN',503],[404,'PROVIDER_ENDPOINT',503],[422,'PROVIDER_VALIDATION',422],[429,'PROVIDER_RATE_LIMIT',429]]) {
  test(`provider HTTP ${http} remains distinguishable and does not claim duplicate charge`,async t=>{
    const logs=setup(t,async(url,options)=>{
      assert.equal(options.headers['X-API-Key'],'test-only-key');
      return new Response('untrusted private details: '+customer.email,{status:http});
    });
    const res=response();await pix(req(),res);
    assert.equal(res.code,status);assert.equal(res.body.code,code);assert.equal(res.body.uncertain,false);
    assert.ok(res.body.reference);assert.ok(!JSON.stringify(res.body).includes(customer.email));
    assert.ok(!logs.join('').includes(customer.email));assert.ok(!logs.join('').includes('test-only-key'));
    assert.equal(JSON.parse(logs[0]).providerStatus,http);
  });
}
test('server errors and malformed successful responses remain uncertain with no automatic retry',async t=>{
  let calls=0;setup(t,async()=>{calls++;return new Response('gateway failure',{status:502});});
  const res=response();await pix(req(),res);
  assert.equal(res.body.code,'PROVIDER_UNAVAILABLE');assert.equal(res.body.uncertain,true);assert.equal(calls,1);
});
test('successful HTTP with invalid JSON remains uncertain',async t=>{
  setup(t,async()=>new Response('not json',{status:201}));
  const res=response();await pix(req(),res);
  assert.equal(res.body.code,'PROVIDER_INVALID_JSON');assert.equal(res.body.uncertain,true);
});
test('valid Pix survives omitted expiry and numeric-string amount',async t=>{
  setup(t,async()=>new Response(JSON.stringify({success:true,data:{transactionId:'TXN-TEST',amount:'59940',paymentData:{copyPaste:'000201LOCAL-TEST-NOT-PAYABLE'}}}),{status:201}));
  const res=response();await pix(req(),res);
  assert.equal(res.code,201);assert.equal(res.body.expiresAt,null);assert.equal(res.body.amount,59940);
});
test('wrong amount is never accepted or silently retried',async t=>{
  setup(t,async()=>new Response(JSON.stringify({success:true,data:{transactionId:'TXN-TEST',amount:1,paymentData:{copyPaste:'000201LOCAL-TEST-NOT-PAYABLE'}}}),{status:201}));
  const res=response();await pix(req(),res);
  assert.equal(res.body.code,'PAYMENT_AMOUNT_MISMATCH');assert.equal(res.body.uncertain,true);
});
test('readiness checks credentials without creating a sale or disclosing seller data',async t=>{
  setup(t,async(url,options)=>{
    assert.equal(url,'https://api.blackcatoficial.com/api/sales/seller');assert.equal(options.method,'GET');
    return new Response(JSON.stringify({success:true,data:{name:'Private seller data'}}));
  });
  const res=response();await pix({method:'GET',headers:{host:'localhost:3000'}},res);
  assert.equal(res.code,200);assert.deepEqual(res.body,{available:true});
});
test('expiry accepts ISO timezone, Unix seconds and Unix milliseconds without guessing a deadline',()=>{
  const now=Date.parse('2026-10-27T00:00:00Z');
  const future=Date.parse('2026-10-28T00:00:00Z');
  for (const value of [future,future/1000,String(future),String(future/1000),'2026-10-27T21:00:00-03:00']) assert.equal(normalizeExpiry(value,now),'2026-10-28T00:00:00.000Z');
  for (const value of [null,undefined,'','Invalid Date','2026-10-28 00:00:00','2026-10-28T00:00:00','2020-01-01T00:00:00Z',0,{},Infinity]) assert.equal(normalizeExpiry(value,now),null);
});
for (const expiry of ['Invalid Date','','2020-01-01T00:00:00Z','2026-10-28 00:00:00']) {
  test(`a created Pix reaches the modal even with unusable expiry: ${JSON.stringify(expiry)}`,async t=>{
    let calls=0;
    setup(t,async()=>{calls++;return new Response(JSON.stringify({success:true,data:{transactionId:'TXN-TEST',status:'PENDING',amount:59940,paymentData:{copyPaste:'000201LOCAL-TEST-NOT-PAYABLE',expiresAt:expiry}}}),{status:201});});
    t.mock.method(console,'warn',()=>{});
    const res=response();await pix(req(),res);
    assert.equal(res.code,201);assert.equal(res.body.expiresAt,null);assert.equal(res.body.status,'PENDING');
    assert.equal(res.body.code,'000201LOCAL-TEST-NOT-PAYABLE');assert.match(res.body.qrImage,/^data:image\/png;base64,/);assert.ok(res.body.token);assert.equal(calls,1);
  });
}

