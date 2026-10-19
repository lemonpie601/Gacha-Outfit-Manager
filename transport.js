(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GachaOutfitManagerTransport=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function retryDelay(value,now,attempt=0) {
    if(value!==null && value!==undefined && String(value).trim()!=='') {
      const seconds=Number(value),date=Date.parse(value);
      if(Number.isFinite(seconds) && seconds>=0) return Math.max(1000,seconds*1000+250);
      if(Number.isFinite(date) && date>now) return date-now+250;
    }
    return 5000*Math.pow(2,attempt);
  }
  function sleep(ms,signal) {
    return new Promise((resolve,reject)=>{
      if(signal?.aborted) return reject(signal.reason);
      const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(signal.reason);};
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
      signal?.addEventListener('abort',abort,{once:true});
    });
  }
  function createClient(options) {
    const now=options.now || Date.now,signal=options.signal;
    const check=()=>{if(signal?.aborted) throw signal.reason || new Error('확장이 비활성화되었습니다.');};
    async function wait(ms) {
      check();if(ms>0) await (options.sleep || sleep)(ms,signal);check();
    }
    function queue(gap) {
      let tail=Promise.resolve(),next=0;
      return work=>{
        const task=tail.then(()=>work(async()=>{await wait(next-now());next=now()+gap;},ms=>{next=Math.max(next,now()+ms);options.onWait?.(ms);}));
        tail=task.catch(()=>{});return task;
      };
    }
    const apiQueue=queue(250),storageQueue=queue(1250);
    function limited(ms) {
      const error=new Error(`요청이 많아 잠시 제한되었습니다 (429). 약 ${Math.ceil(ms/1000)}초 뒤 다시 시도하세요. 보관 사본은 유지됩니다.`);
      error.code='RATE_LIMITED';return error;
    }
    const allowed=new Set(['/themes','/state','/theme/save','/theme/delete','/run/sources']);
    async function request(route,body) {
      if(!allowed.has(route)) throw new Error('지원되지 않는 테마 경로입니다.');
      // Retries are limited to explicit 429 rejections, before server handlers run.
      // Ambiguous network/timeout/5xx failures are never replayed.
      return apiQueue(async(pace,cooldown)=>{
        for(let attempt=0;attempt<3;attempt++) {
          await pace();
          const headers={Accept:'application/json'},admin=options.getAdmin?.();
          if(admin) headers['X-Admin-Secret']=admin;
          const timeout=AbortSignal.timeout(30000);
          const init={credentials:'same-origin',headers,signal:signal?AbortSignal.any([signal,timeout]):timeout};
          if(body!==undefined) {init.method='POST';headers['Content-Type']='application/json';init.body=JSON.stringify(body);}
          const response=await options.fetch('/api/gacha-forge'+route,init);
          if(response.status===429) {
            const delay=retryDelay(response.headers?.get('Retry-After'),now(),attempt);
            cooldown(delay);
            if(attempt===2) throw limited(delay);
            continue;
          }
          if(!response.ok) throw new Error([401,403].includes(response.status)?`가챠포지 접근이 거부되었습니다 (${response.status}). 관리자 접근 설정을 확인하세요.`:`가챠포지 요청을 처리하지 못했습니다 (${response.status}).`);
          return response.json();
        }
      });
    }
    function storageCall(action,value) {
      return storageQueue(async(pace,cooldown)=>{
        for(let attempt=0;attempt<3;attempt++) {
          await pace();
          try {return action==='get'?await options.storage.get():await options.storage.patch(value);}
          catch(error) {
            // Marinara's storage API exposes status in its Error, but no response headers.
            if(error?.status!==429 && !/^Storage (?:read|update) failed \(429\)$/.test(error?.message || '')) throw error;
            const delay=60250;cooldown(delay);
            if(attempt===2) throw limited(delay);
          }
        }
      });
    }
    return {request,load:()=>storageCall('get'),save:value=>storageCall('patch',value)};
  }
  return {createClient,retryDelay};
});
