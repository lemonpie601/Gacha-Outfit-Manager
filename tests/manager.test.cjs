const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const corePath = path.resolve(__dirname, '../core.js');
const core = fs.existsSync(corePath) ? require(corePath) : {};
const copy = value => JSON.parse(JSON.stringify(value));
const first = { id: 'a', title: '봄', desc: 'Spring clothing.' };
const second = { id: 'b', title: '여름', desc: 'Summer clothing.' };

// Only the external HTTP/private-storage boundary is replaced. The real manager
// performs every import, capacity check, backup, batch, and world update.
async function setup({ themes = [first, second], runs, saved = {}, failDelete, failSave, failStore } = {}) {
  assert.equal(typeof core.Manager, 'function', 'Theme manager has not been implemented');
  const remote = { themes: copy(themes), runs: copy(runs || [{ runId: 'r1', name: 'World', outfitThemes: { ids: ['a', 'b'], order: 'shuffle' } }]) };
  let privateData = copy(saved), writes = 0, sequence = 0;
  const calls = [];
  const manager = new core.Manager({
    load: async () => copy(privateData),
    save: async value => { if (failStore) throw new Error('storage unavailable'); privateData = copy(value); writes++; },
    request: async (route, body) => {
      calls.push([route, copy(body || {})]);
      if (route === '/themes') return { ok: true, themes: copy(remote.themes), usage: {} };
      if (route === '/state') return { ok: true, runs: copy(remote.runs), activeRunId: 'r1' };
      if (route === '/theme/delete') {
        assert.ok(writes > 0, 'A recoverable copy must exist before any deletion');
        if (typeof failDelete === 'function') failDelete(body.id);
        if (body.id === failDelete) return { ok: false, error: 'write-conflict' };
        remote.themes = remote.themes.filter(t => t.id !== body.id);
        return { ok: true, themes: copy(remote.themes), usage: {} };
      }
      if (route === '/theme/save') {
        if (failSave) return { ok: false, error: 'write-conflict' };
        if (remote.themes.length >= 200) return { ok: false, error: 'library-full' };
        remote.themes.push({ id: `new-${++sequence}`, title: body.title, desc: body.desc });
        return { ok: true, themes: copy(remote.themes), usage: {}, max: 200 };
      }
      if (route === '/run/sources') {
        const run = remote.runs.find(r => r.runId === body.runId);
        assert.ok(run);
        run.outfitThemes = copy(body.sources.outfitThemes);
        return { ok: true, run: copy(run) };
      }
      throw new Error(`Unexpected route: ${route}`);
    }
  });
  await manager.init();
  return { manager, remote, calls, saved: () => copy(privateData), writes:()=>writes };
}

test('imports the 502-theme collection without losing overflow or duplicating the active library', async () => {
  const { manager } = await setup();
  const seedContext = { window: {} }; require('node:vm').runInNewContext(fs.readFileSync(path.resolve(__dirname, '../themes.js'), 'utf8'), seedContext); const pack = seedContext.window.GachaOutfitManagerSeed;
  await manager.importThemes(pack);
  assert.equal(manager.rows().length, 504);
  await manager.importThemes(pack);
  assert.equal(manager.rows().length, 504);
  assert.equal(manager.library.length, 2);
});

test('invalid import is rejected atomically instead of silently truncating titles', async () => {
  const { manager } = await setup();
  await assert.rejects(manager.importThemes({ themes: [{ title: 'Good', desc: 'Valid' }, { title: 'x'.repeat(49), desc: 'Bad' }] }));
  assert.equal(manager.rows().length, 2);
});

test('activating newly imported themes avoids per-theme world reads and duplicate journal writes',async()=>{
  const {manager,calls,saved,writes}=await setup();
  await manager.importThemes([{title:'A',desc:'First'},{title:'B',desc:'Second'}]);
  const keys=manager.rows().filter(row=>row.status==='inactive').map(row=>row.key);calls.length=0;const before=writes();
  await manager.activate(keys);
  assert.equal(calls.filter(([route])=>route==='/state').length,2,'only preflight and final refresh need world state');
  assert.equal(saved().records.length,0);
  assert.equal(writes()-before,3,'one backup and one completion write per new theme');
});

test('exhausted rate-limit retries stop a batch without hammering every remaining theme',async()=>{
  const {manager,calls,saved}=await setup({failDelete:()=>{throw Object.assign(new Error('rate limited'),{code:'RATE_LIMITED'});}});
  calls.length=0;const result=await manager.move(['active:a','active:b'],'inactive');
  assert.equal(calls.filter(([route])=>route==='/theme/delete').length,1);
  assert.equal(result.stopped,true);assert.equal(result.remaining,1);assert.equal(saved().records.length,2);
});

test('disabling deletes only selected live themes after a recoverable backup', async () => {
  const { manager, remote, saved } = await setup();
  await manager.move(['active:a'], 'inactive');
  assert.deepEqual(remote.themes.map(t => t.id), ['b']);
  assert.equal(manager.rows().find(t => t.title === '봄').status, 'inactive');
  assert.equal(saved().backup.themes[0].desc, 'Spring clothing.');
});

test('private storage failure prevents all live deletion', async () => {
  const { manager, remote, calls } = await setup({ failStore: true });
  await assert.rejects(manager.move(['active:a'], 'inactive'));
  assert.equal(remote.themes.length, 2);
  assert.equal(calls.filter(c => c[0] === '/theme/delete').length, 0);
});

test('partial batch failure retains successful and failed records without deleting unrelated themes', async () => {
  const { manager, remote, saved } = await setup({ failDelete: 'b' });
  const result = await manager.move(['active:a', 'active:b'], 'inactive');
  assert.equal(result.done, 1);
  assert.equal(result.errors.length, 1);
  assert.deepEqual(remote.themes.map(t => t.id), ['b']);
  assert.equal(saved().records.length, 2);
});

test('reactivation replaces stale IDs in every world and preserves order', async () => {
  const { manager, remote } = await setup({ runs: [
    { runId: 'r1', outfitThemes: { ids: ['a', 'b'], order: 'shuffle' } },
    { runId: 'r2', outfitThemes: { ids: ['b', 'a'], order: 'stop' } }
  ] });
  await manager.move(['active:a'], 'inactive');
  const archived = manager.rows().find(t => t.status === 'inactive');
  await manager.activate([archived.key]);
  assert.deepEqual(remote.runs[0].outfitThemes, { ids: ['new-1', 'b'], order: 'shuffle' });
  assert.deepEqual(remote.runs[1].outfitThemes, { ids: ['b', 'new-1'], order: 'stop' });
  assert.equal(manager.rows().filter(t => t.status === 'inactive').length, 0);
});

test('activation refuses a full library before creating any record', async () => {
  const themes = Array.from({ length: 200 }, (_, i) => ({ id: String(i), title: `Theme ${i}`, desc: 'Existing outfit.' }));
  const { manager, calls } = await setup({ themes, runs: [] });
  await manager.importThemes([{ title: 'Extra', desc: 'Extra outfit.' }]);
  await assert.rejects(manager.activate([manager.rows().find(t => t.status === 'inactive').key]));
  assert.equal(calls.filter(c => c[0] === '/theme/save').length, 0);
});

test('failed creation leaves the inactive copy available for a retry', async () => {
  const { manager } = await setup({ failSave: true });
  await manager.importThemes([{ title: 'Extra', desc: 'Extra outfit.' }]);
  const record = manager.rows().find(t => t.status === 'inactive');
  const result = await manager.activate([record.key]);
  assert.equal(result.errors.length, 1);
  assert.equal(manager.rows().find(t => t.key === record.key).status, 'inactive');
});

test('bulk delete is recoverable and restoring from trash does not auto-enable themes', async () => {
  const { manager, remote } = await setup();
  await manager.move(['active:a'], 'trash');
  let record = manager.rows().find(t => t.status === 'trash');
  await manager.restore([record.key]);
  record = manager.rows().find(t => t.key === record.key);
  assert.equal(record.status, 'inactive');
  assert.equal(remote.themes.length, 1);
});

test('world selection changes preserve unrelated IDs and the rotation mode', async () => {
  const { manager, remote } = await setup();
  await manager.setWorld(['active:a'], 'r1', false);
  assert.deepEqual(remote.runs[0].outfitThemes, { ids: ['b'], order: 'shuffle' });
  await manager.setWorld(['active:a'], 'r1', true);
  assert.deepEqual(remote.runs[0].outfitThemes, { ids: ['b', 'a'], order: 'shuffle' });
});

test('a full world preserves its existing themes and reports capacity skips without writes', async () => {
  const themes = Array.from({ length: 65 }, (_, i) => ({ id: `t${i}`, title: `Theme ${i}`, desc: 'Outfit.' }));
  const { manager, calls, remote, writes } = await setup({ themes, runs: [{ runId: 'r1', outfitThemes: { ids: themes.slice(0,64).map(t => t.id), order: 'cycle' } }] });
  const before=copy(remote.runs);const result=await manager.setWorld(['active:t64'], 'r1', true);
  assert.equal(result.done,0);assert.equal(result.capacitySkipped,1);assert.equal(result.worldCount,64);assert.equal(result.unchanged,true);
  assert.deepEqual(remote.runs,before);assert.equal(writes(),0);
  assert.equal(calls.filter(c => c[0] === '/run/sources').length, 0);
});

test('fills only vacant world slots in checked order and reports already-applied separately',async()=>{
  const themes=Array.from({length:67},(_,i)=>({id:`t${i}`,title:`Theme ${i}`,desc:'Outfit.'}));
  const existing=themes.slice(0,62).map(t=>t.id);
  const {manager,remote,saved}=await setup({themes,runs:[{runId:'r1',outfitThemes:{ids:existing,order:'shuffle'}}]});
  const result=await manager.setWorld(['active:t65','active:t0','active:t63','active:t66','active:t64'],'r1',true);
  assert.deepEqual(remote.runs[0].outfitThemes,{ids:[...existing,'t65','t63'],order:'shuffle'});
  assert.equal(result.done,2);assert.equal(result.already,1);assert.equal(result.capacitySkipped,2);assert.equal(result.worldCount,64);
  assert.equal(manager.library.length,67);assert.deepEqual(saved().backup.worlds[0].outfitThemes.ids,existing);
});

test('oversized checked selection fills an empty world with 64 and keeps every library theme',async()=>{
  const themes=Array.from({length:100},(_,i)=>({id:`t${i}`,title:`Theme ${i}`,desc:'Outfit.'}));
  const {manager,remote}=await setup({themes,runs:[{runId:'r1',outfitThemes:{ids:[],order:'stop'}}]});
  const result=await manager.setWorld(themes.map(t=>'active:'+t.id),'r1',true);
  assert.equal(result.done,64);assert.equal(result.capacitySkipped,36);assert.equal(remote.themes.length,100);assert.equal(remote.runs[0].outfitThemes.order,'stop');
});

test('world removal reports actual removals and leaves other choices intact',async()=>{
  const {manager,remote}=await setup({runs:[{runId:'r1',outfitThemes:{ids:['a'],order:'cycle'}}]});
  const result=await manager.setWorld(['active:a','active:b'],'r1',false);
  assert.equal(result.done,1);assert.equal(result.worldCount,0);assert.deepEqual(remote.runs[0].outfitThemes.ids,[]);
});

test('an archived world reference removed by the user is not resurrected', async () => {
  const { manager, remote } = await setup();
  await manager.move(['active:a'], 'inactive');
  remote.runs[0].outfitThemes.ids = ['b'];
  await manager.activate([manager.rows().find(t => t.status === 'inactive').key]);
  assert.deepEqual(remote.runs[0].outfitThemes.ids, ['b']);
});

test('destructive actions reject stale selections instead of touching a different theme', async () => {
  const { manager, remote } = await setup();
  remote.themes = [second];
  await assert.rejects(manager.move(['active:a'], 'trash'));
  assert.deepEqual(remote.themes, [second]);
});

test('explicit world replacement clears disabled references so 64 archived themes do not block one new active theme', async () => {
  const { manager, remote } = await setup({
    themes: [{ id: 'new', title: 'New', desc: 'New outfit.' }],
    runs: [{ runId: 'r1', outfitThemes: { ids: Array.from({length:64},(_,i) => `archived-${i}`), order: 'stop' } }]
  });
  await manager.setWorld(['active:new'], 'r1', true);
  assert.deepEqual(remote.runs[0].outfitThemes, { ids: ['new'], order: 'stop' });
});
