const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const file=path.resolve(__dirname,'../transport.js');
const transport=fs.existsSync(file)?require(file):{};
function fixture({responses=[],storageErrors=[]}={}) {
  assert.equal(typeof transport.createClient,'function');
  let time=0;const calls=[],stores=[],waits=[];
  const client=transport.createClient({now:()=>time,sleep:async ms=>{time+=ms;},onWait:ms=>waits.push(ms),getAdmin:()=>'',
    fetch:async(url,options)=>{calls.push({url,options,time});const next=responses.shift()||{};if(next.error)throw next.error;return {ok:!next.status||next.status===200,status:next.status||200,headers:{get:name=>next.headers?.[name]??null},json:async()=>next.value||{ok:true}};},
    storage:{get:async()=>{stores.push(time);if(storageErrors.length)throw storageErrors.shift();return {};},patch:async value=>{stores.push(time);if(storageErrors.length)throw storageErrors.shift();return value;}}
  });
  return {client,calls,stores,waits,now:()=>time};
}
test('serializes and spaces parallel game requests',async()=>{
 const {client,calls}=fixture();await Promise.all([client.request('/themes'),client.request('/state'),client.request('/themes')]);
 assert.equal(calls.length,3);for(let i=1;i<calls.length;i++)assert.ok(calls[i].time-calls[i-1].time>=250);
});
test('honors Retry-After and retries the rejected POST before releasing the next request',async()=>{
 const {client,calls,waits}=fixture({responses:[{status:429,headers:{'Retry-After':'5'}},{value:{ok:true,id:'saved'}}]});
 const result=await client.request('/theme/save',{title:'A',desc:'B'});await client.request('/state');
 assert.equal(result.id,'saved');assert.equal(calls[1].time-calls[0].time>=5000,true);assert.equal(calls[0].options.body,calls[1].options.body);assert.ok(waits.some(ms=>ms>=5000));
});
test('parses HTTP dates and uses a safe wait when rate-limit headers are absent',()=>{
 assert.equal(typeof transport.retryDelay,'function');assert.equal(transport.retryDelay('Thu, 01 Jan 1970 00:00:08 GMT',1000),7250);assert.ok(transport.retryDelay(null,0)>=5000);
});
test('persistent 429 stops after bounded attempts with a rate-limit message, not an admin message',async()=>{
 const {client,calls}=fixture({responses:Array.from({length:8},()=>({status:429,headers:{'Retry-After':'1'}}))});
 await assert.rejects(client.request('/themes'),error=>error.code==='RATE_LIMITED'&&!error.message.includes('관리자'));assert.equal(calls.length,3);
});
test('network or 500 failures never replay a mutation',async()=>{
 for(const next of [{status:500},{error:new TypeError('network failed')}]){const {client,calls}=fixture({responses:[next]});await assert.rejects(client.request('/theme/save',{title:'A',desc:'B'}));assert.equal(calls.length,1);}
});
test('storage calls respect their separate 60/minute bucket and retry rejected patches safely',async()=>{
 const {client,stores,waits}=fixture({storageErrors:[new Error('Storage update failed (429)')]});
 await client.save({version:1});await client.load();assert.equal(stores.length,3);assert.ok(stores[1]-stores[0]>=60000);assert.ok(stores[2]-stores[1]>=1250);assert.ok(waits.some(ms=>ms>=60000));
});
test('aborting during a server cooldown cancels pending and queued requests',async()=>{
 const controller=new AbortController();let calls=0;
 const client=transport.createClient({signal:controller.signal,storage:{},fetch:async()=>{calls++;return {ok:false,status:429,headers:{get:()=> '60'}};},onWait:()=>controller.abort()});
 const results=await Promise.allSettled([client.request('/themes'),client.request('/state')]);assert.ok(results.every(result=>result.status==='rejected'));assert.equal(calls,1);
});
test('rejects unexpected routes before any request or credential read',async()=>{
 const {client,calls}=fixture();await assert.rejects(client.request('/settings'));assert.equal(calls.length,0);
});
