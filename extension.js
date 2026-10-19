(async function () {
  'use strict';
  const KEY = '__gfOutfitManager';
  const Core = window.GachaOutfitManagerCore;
  const UI = window.GachaOutfitManagerUI;
  const seed = window.GachaOutfitManagerSeed;
  if (window[KEY]?.dispose) window[KEY].dispose();
  const api = typeof marinara !== 'undefined' ? marinara : null;
  if (!Core || !UI || !api?.storage) throw new Error('의상 테마 관리 확장은 전체 페이지 접근 권한이 필요합니다. manifest.json이 포함된 최신 ZIP으로 가져오세요.');

  const node = document.createElement('div');
  node.id = 'gf-outfit-manager';
  node.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none';
  const root = node.attachShadow({ mode: 'open' });
  let host = null, manager = null, busy = false, disposed = false;
  const requests = new Set();
  let tab = 'all', search = '', worldId = '', limit = 60, focusedKey = '';
  let scheduled = 0, wasVisible = false, watchedRoot = null;
  const selected = new Set();
  const readRows = UI.createRowsReader();
  let opener = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const $ = selector => root.querySelector(selector);
  const labels = { active: '활성', inactive: '보관함', trash: '휴지통', all: '전체' };
  const style = `
    :host{all:initial;font:14px/1.5 system-ui,-apple-system,"Malgun Gothic",sans-serif;color:#eeeaf7;color-scheme:dark}
    *{box-sizing:border-box}button,input,select,textarea{font:inherit;color:inherit}button{cursor:pointer;border:1px solid #4a405b;background:#282133;border-radius:8px;padding:9px 12px;text-align:center;line-height:1.4}button:hover:not(:disabled){background:#382e46;border-color:#9b85b9}button:disabled{opacity:.4;cursor:not-allowed}button.primary{background:#e8c876;color:#251e10;border-color:#e8c876;font-weight:700}button.danger{color:#ffc4d1;border-color:#855061}button.ghost{background:transparent}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #e8c876;outline-offset:2px}
    [hidden]{display:none!important}p,h1,h2,h3{margin:0}.muted{color:#b8aec5;font-size:12px}.veil{position:absolute;inset:0;background:#080610cf;backdrop-filter:blur(4px);pointer-events:auto;padding:12px;display:flex;align-items:center;justify-content:center}.panel{width:100%;max-width:1800px;height:100%;max-height:1200px;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;background:#17131f;border:1px solid #51425f;border-top:2px solid #e8c876;border-radius:14px;box-shadow:0 22px 90px #000b;container-type:inline-size}
    header{padding:16px 22px;display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #3c3147}header h1{font-size:21px;letter-spacing:-.5px;margin-bottom:3px}.header-actions{display:flex;gap:8px;flex-shrink:0}.workspace{display:grid;grid-template-columns:204px minmax(0,1fr);min-height:0}.sidebar{overflow:auto;padding:18px 12px;background:#120f19;border-right:1px solid #3c3147;overscroll-behavior:contain}.section-label{padding:0 9px;margin-bottom:8px;color:#a99ab9;font-size:11px;font-weight:700;letter-spacing:.08em}.tabs{display:grid;gap:5px;margin-bottom:22px}.tabs button{display:flex;align-items:center;justify-content:space-between;gap:10px;border-color:transparent;background:none;text-align:left;padding:11px 12px}.tabs button[aria-selected=true]{background:#342b40;border-color:#655273;color:#f4d68e}.nav-count{font-size:12px;font-variant-numeric:tabular-nums;color:#b9aac8}.sidebar-actions{display:grid;gap:8px;margin-bottom:22px}.sidebar-actions button{text-align:left}.sidebar details{border-top:1px solid #3c3147;margin-top:15px;padding-top:12px}.sidebar summary{cursor:pointer;font-size:13px;color:#d4c8e1;padding:7px 3px}.files,.world{display:grid;gap:8px;padding:9px 0}.files button{text-align:left;font-size:12px}.world select{width:100%;min-width:0}.world button{font-size:12px}.world .note{line-height:1.6}
    .library{display:grid;grid-template-rows:auto auto auto minmax(0,1fr) auto;min-width:0;min-height:0}.tools{grid-row:1;padding:14px 18px 10px;display:flex;gap:10px;align-items:center}.tools input{width:100%;min-width:0;flex:1}.counts{white-space:nowrap;color:#b8aec5;font-size:12px}.selectbar{grid-row:2;padding:0 18px 10px;display:flex;align-items:center;gap:10px;min-height:36px;border-bottom:1px solid #3c3147}.selected{color:#e8c876;font-weight:700;font-size:12px;margin-left:auto}.selectbar button{border:0;background:none;padding:3px 5px;font-size:12px;color:#c4b7d1}.all-label{display:flex;gap:8px;align-items:center;font-size:12px;color:#c4b7d1;cursor:pointer}input[type=checkbox]{width:17px;height:17px;accent-color:#e8c876;cursor:pointer;flex-shrink:0;margin:0}input[type=search],input[type=text],textarea,select{background:#100d17;border:1px solid #50425f;border-radius:8px;padding:10px;min-height:40px}
    .library>.status{grid-row:3}.library>.reading{grid-row:4}.library>.footer-slot{grid-row:5}
    .status{padding:9px 18px;border-bottom:1px solid #3c3147;background:#24202e;color:#d2c5e1;white-space:pre-wrap;font-size:12px;max-height:85px;overflow:auto}.status.bad{background:#3a2030;color:#ffd0db}.reading{display:grid;grid-template-columns:minmax(280px,1fr) 340px;min-height:0;min-width:0;position:relative}.list{min-height:0;overflow:auto;overscroll-behavior:contain;padding:5px 0 12px}.card{display:flex;align-items:center;gap:12px;padding:13px 18px;border-bottom:1px solid #302737;min-height:82px}.card:hover{background:#201b29}.card.is-focused{background:#272030;box-shadow:inset 3px 0 #e8c876}.card:has(input:checked){background:#302738}.inspect{background:none!important;border:0!important;padding:0!important;text-align:left;min-width:0;flex:1}.name{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.name strong{font-size:15px;overflow-wrap:anywhere}.tag{font-size:10px;border:1px solid #51425f;border-radius:4px;padding:1px 5px;color:#bfb0ce;white-space:nowrap}.row-preview{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;line-height:1.6;color:#a99bb7;margin-top:5px;overflow-wrap:anywhere}.empty{text-align:center;padding:50px 25px;color:#b9adc7}.empty h3{font-size:17px;color:#e4daed;margin-bottom:8px}.empty p{margin-bottom:16px;font-size:13px}.empty button{font-size:12px}
    .detail{min-width:0;min-height:0;overflow:auto;border-left:1px solid #3c3147;background:#131019;padding:23px;overscroll-behavior:contain}.detail-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:22px}.detail-head>span{font-size:11px;font-weight:700;color:#a99ab9;letter-spacing:.08em}.detail-close{display:none}.detail h2{font-size:20px;line-height:1.5;overflow-wrap:anywhere;margin-bottom:12px}.detail-tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:24px}.full-desc{font-size:14px;line-height:1.9;color:#d3c6df;white-space:pre-wrap;overflow-wrap:anywhere}.detail-hint{margin-top:26px;padding-top:17px;border-top:1px solid #3c3147;font-size:12px;line-height:1.8;color:#a99ab9}.detail-placeholder{color:#a99ab9;line-height:1.8;font-size:13px}.more{margin:14px 18px;min-width:130px;font-size:12px}
    .bulk{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 18px;border-top:1px solid #665371;background:#261f31;box-shadow:0 -5px 20px #0003}.bulk .bulk-label{font-size:12px;color:#dfc788;margin-right:5px}.bulk button{font-size:12px}.foot-note{padding:9px 18px;color:#8f819f;font-size:11px;border-top:1px solid #302737}.footer-slot{min-height:0}
    dialog{position:fixed;inset:0;margin:auto;max-width:calc(100% - 32px);max-height:calc(100% - 32px);overflow:auto;width:620px;background:#211a2c;color:#eeeaf7;border:1px solid #89709e;border-radius:14px;padding:24px;box-shadow:0 25px 90px #000c;pointer-events:auto}dialog::backdrop{background:#000a}dialog h2{margin-bottom:12px;font-size:20px}dialog label{display:block;margin:12px 0 5px}dialog input,dialog textarea{width:100%}dialog textarea{height:190px;resize:vertical}dialog .actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
    @container(max-width:1050px){.reading{grid-template-columns:minmax(0,1fr)}.detail{display:none;position:absolute;inset:0 0 0 auto;width:min(410px,95%);box-shadow:-20px 0 60px #0008;z-index:2}.reading.detail-open .detail{display:block}.detail-close{display:block}.workspace{grid-template-columns:186px minmax(0,1fr)}}
    @container(max-width:620px){.workspace{grid-template-columns:124px minmax(0,1fr)}.sidebar{padding:12px 7px}.sidebar-actions button,.tabs button{font-size:12px;padding:9px 7px}.tabs button{flex-wrap:wrap;gap:3px}.nav-count{font-size:11px}.sidebar .section-label{padding:0 3px}.tools{padding:10px}.selectbar{padding:0 10px 8px;flex-wrap:wrap;gap:6px}.selected{margin-left:0}.card{padding:12px 10px;gap:8px}.detail{padding:18px}.bulk{padding:9px;gap:5px}.bulk button{padding:7px;font-size:11px}header{padding:12px}header h1{font-size:17px}.totals{font-size:10px}.header-actions button{padding:7px 9px;font-size:12px}.section-label{font-size:10px}.sidebar summary{font-size:11px}.sidebar .world label,.world .note{font-size:10px}.veil{padding:5px}.panel{border-radius:10px}.status{padding:8px 10px}}
  `;
  root.innerHTML = `<style>${style}</style>
    <section class="veil" hidden>
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="gf-ot-title">
        <header><div><h1 id="gf-ot-title">의상 테마 관리</h1><p class="muted totals">테마 목록을 불러오는 중입니다.</p></div><div class="header-actions"><button class="ghost" data-act="refresh">새로고침</button><button data-act="close" aria-label="관리창 닫기">닫기</button></div></header>
        <div class="workspace">
          <aside class="sidebar"><p class="section-label">내 테마</p><div class="tabs" role="tablist" aria-label="테마 상태" aria-orientation="vertical"></div>
            <p class="section-label">테마 추가</p><div class="sidebar-actions"><button class="primary" data-act="new">+ 직접 만들기</button><button data-act="import">JSON 가져오기</button><button data-act="seed">추천 502개 추가</button></div>
            <details><summary>세계에 적용하기</summary><div class="world"><label class="muted" for="gf-ot-world">적용할 세계</label><select id="gf-ot-world" aria-label="적용할 세계"></select><button data-act="world-on">체크한 테마 적용</button><button data-act="world-off">체크한 테마 해제</button><p class="muted note">활성 테마를 체크해서 적용하세요. 세계당 최대 64개이며, 0개면 게임이 테마를 자동 생성합니다.</p></div></details>
            <details><summary>내보내기 · 백업</summary><div class="files"><button data-act="export">테마 JSON 내보내기</button><p class="muted">체크하면 선택한 테마만, 체크가 없으면 전체를 저장합니다.</p><button data-act="backup">작업 전 백업 저장</button></div></details>
          </aside>
          <main class="library"><div class="tools"><input type="search" aria-label="제목 또는 설명 검색" placeholder="어떤 테마를 찾고 있나요?"><span class="counts"></span></div>
            <div class="selectbar"><label class="all-label"><input type="checkbox" data-select-all aria-label="검색 결과 전체 선택">검색 결과 전체</label><span class="selected">0개 선택</span><button data-act="clear">선택 해제</button></div>
            <div class="status" hidden role="status" aria-live="polite"></div>
            <div class="reading"><div class="list" role="group" aria-label="의상 테마 목록"></div><aside class="detail" aria-label="선택한 테마의 설명"></aside></div>
            <div class="footer-slot"><div class="bulk" hidden><span class="bulk-label">체크한 테마</span><button class="primary" data-act="enable">활성화</button><button data-act="disable">비활성화</button><button class="danger" data-act="delete">삭제</button><button data-act="restore">보관함으로 복원</button><button class="danger" data-act="purge">완전히 지우기</button></div><div class="foot-note">체크박스는 일괄 선택 · 테마 이름을 누르면 전체 설명</div></div>
          </main>
        </div>
      </div>
      <input type="file" accept="application/json,.json" hidden>
      <dialog class="new-dialog"><form><h2>새 의상 테마</h2><p class="muted">보관함에 추가됩니다. 추가한 뒤 선택해서 활성화하세요.</p><label for="gf-ot-name">테마명 · 최대 48자</label><input id="gf-ot-name" type="text" maxlength="48" required><label for="gf-ot-desc">설명 · 최대 2000자</label><textarea id="gf-ot-desc" maxlength="2000" required></textarea><div class="actions"><button type="button" data-act="cancel-new">취소</button><button type="submit" class="primary">보관함에 추가</button></div></form></dialog>
      <dialog class="confirm-dialog"><h2>선택 작업 확인</h2><p class="confirm-text"></p><div class="actions"><button data-act="cancel-confirm">취소</button><button data-act="confirm" class="danger">실행</button></div></dialog>
    </section>`;

  UI.isolateEvents(root);
  function relocate() { UI.placeOverlay(node,document); }
  relocate();
  function findHost(scope = document) {
    const direct = [...scope.querySelectorAll('marinara-capability-gacha-forge')].find(element => UI.isGachaVisible(element,window));
    if (direct) return direct;
    for (const element of scope.querySelectorAll('*')) {
      if (element === node) continue;
      if (element.shadowRoot) { const found = findHost(element.shadowRoot); if (found) return found; }
    }
    return null;
  }
  function locate() {
    scheduled = 0;
    if (disposed) return;
    relocate();
    if (!UI.isGachaVisible(host,window)) host = findHost();
    const visible = UI.isGachaVisible(host,window);
    node.hidden = !visible;
    const nextRoot = visible ? host.shadowRoot : null;
    if (watchedRoot !== nextRoot) {
      themeObserver.disconnect();
      UI.removeThemeButtons(watchedRoot);
      watchedRoot = nextRoot;
      if (watchedRoot) themeObserver.observe(watchedRoot,{childList:true,subtree:true});
    }
    if (watchedRoot) UI.mountThemeButtons(watchedRoot,open);
    if (!visible && wasVisible) {
      $('.veil').hidden = true;
      confirming = null;
      for (const dialog of root.querySelectorAll('dialog')) if (dialog.open) dialog.close();
      $('.reading').classList.remove('detail-open');
    }
    wasVisible = visible;
  }
  function scheduleLocate() {
    if (!disposed && !scheduled) scheduled = window.setTimeout(locate,80);
  }
  function message(text, bad = false) {
    const element = $('.status');
    element.hidden = !text;
    element.textContent = text;
    element.classList.toggle('bad', bad);
  }
  function filtered() {
    if (!manager) return [];
    return UI.summarize(readRows(manager),tab,search).visible;
  }
  function render() {
    if (disposed) return;
    const rows = readRows(manager);
    const {counts,visible:shown} = UI.summarize(rows,tab,search);
    const scrollTop = $('.list').scrollTop;
    const valid = new Set(rows.map(row => row.key));
    for (const key of selected) if (!valid.has(key)) selected.delete(key);
    UI.setMarkup($('.tabs'), ['all','active','inactive','trash'].map(status => `<button role="tab" aria-selected="${tab === status}" data-tab="${status}"><span>${labels[status]}</span><span class="nav-count">${counts[status]}</span></button>`).join(''));
    $('.counts').textContent = `${shown.length}개`;
    $('.selected').textContent = selected.size ? `${selected.size}개 체크됨` : '';
    $('.totals').textContent = `전체 ${counts.all}개 · 활성 ${manager?.library.length || 0}/200 · 보관함 ${counts.inactive}개`;
    const activeIds = new Set((manager?.library || []).map(theme => theme.id));
    const worldIds = new Set((manager?.runs || []).map(run => run.runId));
    if (!worldIds.has(worldId)) worldId = manager?.activeRunId || manager?.runs[0]?.runId || '';
    UI.setMarkup($('#gf-ot-world'), (manager?.runs || []).map(run => `<option value="${esc(run.runId)}"${run.runId === worldId ? ' selected' : ''}>${esc(run.name || run.runId)} · ${(run.outfitThemes?.ids || []).filter(id => activeIds.has(id)).length}/64</option>`).join('') || '<option value="">생성된 세계 없음</option>');
    const chosenWorld = manager?.runs.find(run => run.runId === worldId), used = new Set(chosenWorld?.outfitThemes?.ids || []);
    if (!shown.some(row => row.key === focusedKey)) focusedKey = shown[0]?.key || '';
    const badge = row => `<span class="tag">${labels[row.status]}</span>${row.status === 'active' && used.has(row.id) ? '<span class="tag">이 세계에 적용 중</span>' : ''}${row.pending ? '<span class="tag">복원 마무리 필요</span>' : ''}`;
    let listMarkup = shown.slice(0,limit).map(row => `<article class="card${focusedKey === row.key ? ' is-focused' : ''}"><input type="checkbox" data-key="${esc(row.key)}" aria-label="${esc(row.title)} 선택"><button class="inspect" data-inspect="${esc(row.key)}" aria-label="${esc(row.title)} 전체 설명"><span class="name"><strong>${esc(row.title)}</strong>${badge(row)}</span><span class="row-preview">${esc(row.desc)}</span></button></article>`).join('') || `<div class="empty"><h3>${search ? '검색 결과가 없습니다' : tab === 'trash' ? '휴지통이 비어 있습니다' : tab === 'active' ? '활성 테마가 없습니다' : '아직 테마가 없습니다'}</h3><p>${search ? '다른 검색어로 찾아보세요.' : tab === 'active' && counts.inactive ? '보관함에서 테마를 체크하고 활성화하세요.' : counts.all ? '전체 목록에서 다른 테마를 확인할 수 있습니다.' : '왼쪽의 추천 502개 추가 또는 JSON 가져오기로 시작하세요.'}</p>${counts.all && tab !== 'all' ? '<button data-act="goto-all">전체 목록 보기</button>' : ''}</div>`;
    if (shown.length > limit) listMarkup += `<button data-act="more">더 보기 (${Math.min(60,shown.length-limit)}개)</button>`;
    UI.setMarkup($('.list'),listMarkup);
    for (const checkbox of root.querySelectorAll('[data-key]')) { checkbox.checked = selected.has(checkbox.dataset.key); checkbox.disabled = busy; }
    $('.list').scrollTop = scrollTop;
    const focused = shown.find(row => row.key === focusedKey);
    UI.setMarkup($('.detail'), `<div class="detail-head"><span>테마 설명</span><button class="detail-close" data-act="close-detail" aria-label="설명 패널 닫기">닫기</button></div>` + (focused ? `<h2>${esc(focused.title)}</h2><div class="detail-tags">${badge(focused)}</div><p class="full-desc">${esc(focused.desc)}</p><p class="detail-hint">${focused.status === 'active' ? '게임에서 사용할 수 있는 테마입니다. 비활성화하면 설명을 보관함에 남겨두고 활성 칸을 비웁니다.' : focused.status === 'inactive' ? '보관 중인 테마입니다. 왼쪽 체크박스를 선택한 뒤 아래 활성화 버튼을 누르세요.' : '휴지통에 있는 테마입니다. 체크한 뒤 보관함으로 복원할 수 있습니다.'}</p>` : '<p class="detail-placeholder">목록에서 테마 이름을 누르면<br>전체 설명이 이곳에 표시됩니다.</p>'));
    const allBox = $('[data-select-all]');
    const selectedVisible = shown.filter(row => selected.has(row.key)).length;
    allBox.checked = !!shown.length && selectedVisible === shown.length;
    allBox.indeterminate = selectedVisible > 0 && selectedVisible < shown.length;
    allBox.disabled = busy || !shown.length;
    $('.bulk').hidden = !selected.size;
    for (const button of root.querySelectorAll('button')) button.disabled = busy || (!manager && !['close','refresh'].includes(button.dataset.act));
    if (!busy && manager) {
      const items = rows.filter(row => selected.has(row.key));
      $('[data-act="enable"]').disabled = !items.length || items.some(row => row.status !== 'inactive');
      $('[data-act="disable"]').disabled = !items.length || items.some(row => row.status !== 'active');
      $('[data-act="delete"]').disabled = !items.length || items.some(row => row.status === 'trash');
      $('[data-act="restore"]').disabled = !items.length || items.some(row => row.status !== 'trash');
      $('[data-act="purge"]').disabled = !items.length || items.some(row => row.status !== 'trash');
      for (const action of ['world-on','world-off']) $(`[data-act="${action}"]`).disabled = !worldId || !items.length || items.some(row => row.status !== 'active');
      $('[data-act="backup"]').disabled = !manager.data.backup;
    }
    for (const action of ['enable','disable','delete','restore','purge']) $(`[data-act="${action}"]`).hidden = !selected.size || $(`[data-act="${action}"]`).disabled;
    $('[data-act="clear"]').hidden = !selected.size;
    $('#gf-ot-world').disabled = busy;
    $('input[type=search]').disabled = busy;
    if (!busy && !$('.veil').hidden) UI.restoreFocus(root,$('input[type=search]'));
  }
  async function request(route, body) {
    if (disposed) throw new Error('확장이 비활성화되어 작업을 중단했습니다.');
    const allowed = new Set(['/themes','/state','/theme/save','/theme/delete','/run/sources']);
    if (!allowed.has(route)) throw new Error('지원되지 않는 테마 경로입니다.');
    const headers = { Accept: 'application/json' };
    // Use the same existing browser-session credential as the installed game.
    // This value is only sent to these fixed same-origin Gacha Forge routes.
    const admin = localStorage.getItem('marinara_admin_secret')?.trim();
    if (admin) headers['X-Admin-Secret'] = admin;
    const controller = new AbortController();
    requests.add(controller);
    const options = { credentials: 'same-origin', headers, signal: AbortSignal.any([AbortSignal.timeout(30000),controller.signal]) };
    if (body !== undefined) { options.method = 'POST'; headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    const fetcher = typeof api.fetch === 'function' ? api.fetch.bind(api) : window.fetch.bind(window);
    try {
      const response = await fetcher('/api/gacha-forge' + route, options);
      if (!response.ok) throw new Error(`가챠포지 연결 오류 (${response.status}). 관리자 접근 및 앱 실행 상태를 확인하세요.`);
      return await response.json();
    } finally { requests.delete(controller); }
  }
  async function ensureManager() {
    if (manager) return manager;
    const next = new Core.Manager({
      request,
      load: async () => (await api.storage.get())?.outfitManager || {},
      save: async value => { if (disposed) throw new Error('확장이 비활성화되었습니다.'); await api.storage.patch({ outfitManager: value }); }
    });
    await next.init();
    manager = next;
    return manager;
  }
  function download(value, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = name;
    root.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url),10000);
  }
  async function run(work, text = '처리 중입니다. 창을 닫지 마세요.', refreshHost = true) {
    if (busy || disposed) return;
    busy = true; message(text); render();
    try {
      await ensureManager();
      const result = await work();
      if (disposed) return;
      selected.clear();
      if (result?.errors?.length) message(`${result.done}개 완료 · ${result.errors.length}개 실패\n` + result.errors.map(item => `${item.title}: ${item.message}`).join('\n'),true);
      else if (result) message(`${result.done}개 처리 완료${result.skipped ? ` · 중복 ${result.skipped}개 건너뜀` : ''}.`);
      else message('목록을 새로 불러왔습니다.');
      if (refreshHost) {
        host?._refreshState?.();
        if (host?._showThemes) host._loadThemes?.();
      }
    } catch (error) {
      if (!disposed) message(error.message || '작업하지 못했습니다. 백업과 보관함을 확인하세요.',true);
    } finally { busy = false; render(); }
  }
  let confirming = null;
  function ask(text, action) {
    if (busy) return;
    confirming = action;
    $('.confirm-text').textContent = text;
    $('.confirm-dialog').showModal();
  }
  async function open(trigger) {
    locate();
    if (!UI.isGachaVisible(host,window)) return;
    if (trigger?.focus) opener = trigger;
    $('.veil').hidden = false;
    const alreadyLoaded = !!manager;
    await run(async () => { if (alreadyLoaded) await manager.refresh(); },'목록을 불러오는 중입니다.',false);
    if (!disposed && !$('.veil').hidden) $('input[type=search]').focus();
  }
  function close() {
    $('.veil').hidden = true;
    locate();
    if (opener?.isConnected) opener.focus();
  }
  root.addEventListener('input',event => {
    if (event.target === $('input[type=search]')) { search = event.target.value; limit = 60; $('.list').scrollTop = 0; render(); }
  });
  root.addEventListener('change',event => {
    const target = event.target;
    if (target.hasAttribute('data-select-all')) { for (const row of filtered()) target.checked ? selected.add(row.key) : selected.delete(row.key); render(); }
    if (target.dataset?.key) { target.checked ? selected.add(target.dataset.key) : selected.delete(target.dataset.key); render(); }
    if (target === $('#gf-ot-world')) { worldId = target.value; render(); }
  });
  root.addEventListener('click',event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.inspect) {
      focusedKey = button.dataset.inspect;
      $('.reading').classList.add('detail-open');
      render(); return;
    }
    if (button.dataset.tab) { tab = button.dataset.tab; selected.clear(); limit = 60; $('.list').scrollTop = 0; $('.reading').classList.remove('detail-open'); render(); return; }
    const action = button.dataset.act, keys = [...selected];
    if (action === 'close') { close(); return; }
    if (action === 'close-detail') { $('.reading').classList.remove('detail-open'); $('input[type=search]').focus(); return; }
    if (action === 'goto-all') { tab = 'all'; search = ''; $('input[type=search]').value = ''; $('.list').scrollTop = 0; render(); return; }
    if (action === 'refresh') return void run(() => manager.refresh().then(() => null),'목록을 불러오는 중입니다.',false);
    if (action === 'select') { for (const row of filtered()) selected.add(row.key); render(); return; }
    if (action === 'clear') { selected.clear(); render(); return; }
    if (action === 'more') { limit += 60; render(); return; }
    if (action === 'new') { $('.new-dialog').showModal(); $('#gf-ot-name').focus(); return; }
    if (action === 'cancel-new') { $('.new-dialog').close(); return; }
    if (action === 'import') { $('input[type=file]').click(); return; }
    if (action === 'seed') return void run(async () => { if (!seed?.themes) throw new Error('추천 테마 파일이 없습니다. themes.js를 포함한 ZIP으로 가져오세요.'); tab = 'inactive'; return manager.importThemes(seed); });
    if (action === 'export') { download(manager.exportThemes(keys.length ? keys : undefined),'outfit-themes.json'); message('테마 JSON을 내보냈습니다.'); return; }
    if (action === 'backup') { const backup = manager.exportBackup(); if (backup) download({version:1,themes:backup.themes.map(({title,desc}) => ({title,desc})),worldSelections:backup.worlds,savedAt:backup.at},'outfit-themes-before-operation.json'); return; }
    if (action === 'enable') return void run(() => manager.activate(keys));
    if (action === 'disable') return ask(`${keys.length}개를 게임 라이브러리에서 빼고 비활성 보관함으로 옮깁니다. 이 테마를 쓰던 세계에서도 다음 생성부터 제외됩니다. 이미 시작된 생성에는 소급되지 않습니다.`, () => run(() => manager.move(keys,'inactive')));
    if (action === 'delete') return ask(`${keys.length}개를 삭제하고 확장 휴지통에 보관합니다. 활성 테마는 모든 세계가 공유하는 라이브러리에서도 제거됩니다.`, () => run(() => manager.move(keys,'trash')));
    if (action === 'restore') return void run(() => manager.restore(keys));
    if (action === 'purge') return ask(`${keys.length}개를 확장 휴지통에서 완전히 지웁니다. 내보낸 JSON이 없으면 이 항목을 복원할 수 없습니다.`, () => run(() => manager.purge(keys)));
    if (action === 'world-on' || action === 'world-off') return void run(() => manager.setWorld(keys,worldId,action === 'world-on'));
    if (action === 'cancel-confirm') { confirming = null; $('.confirm-dialog').close(); return; }
    if (action === 'confirm') { const execute = confirming; confirming = null; $('.confirm-dialog').close(); execute?.(); }
  });
  $('.new-dialog form').addEventListener('submit',event => {
    event.preventDefault();
    const item = {title:$('#gf-ot-name').value,desc:$('#gf-ot-desc').value};
    $('.new-dialog').close();
    run(async () => { const result = await manager.importThemes([item]); tab = 'inactive'; $('#gf-ot-name').value = ''; $('#gf-ot-desc').value = ''; return result; });
  });
  $('input[type=file]').addEventListener('change',event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    run(async () => {
      if (file.size > 2 * 1024 * 1024) throw new Error('2MB 이하의 테마 JSON을 선택하세요.');
      let value;
      try { value = JSON.parse((await file.text()).replace(/^\uFEFF/u,'')); } catch { throw new Error('JSON 형식을 읽을 수 없습니다.'); }
      const result = await manager.importThemes(value);
      tab = 'inactive'; return result;
    });
  });
  function keyboard(event) {
    if ($('.veil').hidden) return;
    if (!$('.new-dialog').open && !$('.confirm-dialog').open) UI.trapTab(event,root);
    if (event.key === 'Escape' && !busy && !$('.new-dialog').open && !$('.confirm-dialog').open) {
      event.preventDefault();
      if ($('.reading').classList.contains('detail-open')) { $('.reading').classList.remove('detail-open'); $('input[type=search]').focus(); }
      else close();
    }
  }
  root.addEventListener('keydown',keyboard);
  function fullscreenChanged() { relocate(); scheduleLocate(); }
  document.addEventListener('fullscreenchange',fullscreenChanged);
  window.addEventListener('resize',scheduleLocate);
  window.addEventListener('scroll',scheduleLocate,true);
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target !== node && !node.contains(record.target))) scheduleLocate();
  });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','inert','view']});
  const themeObserver = new MutationObserver(scheduleLocate);
  const timer = setInterval(() => { if (document.visibilityState !== 'hidden') locate(); },4000);
  function dispose() {
    disposed = true;
    for (const controller of requests) controller.abort();
    requests.clear();
    clearInterval(timer);
    if (scheduled) window.clearTimeout(scheduled);
    observer.disconnect();
    themeObserver.disconnect();
    UI.removeThemeButtons(watchedRoot);
    root.removeEventListener('keydown',keyboard);
    document.removeEventListener('fullscreenchange',fullscreenChanged);
    window.removeEventListener('resize',scheduleLocate);
    window.removeEventListener('scroll',scheduleLocate,true);
    node.remove();
    if (window[KEY]?.dispose === dispose) delete window[KEY];
  }
  window[KEY] = { open, dispose };
  api.onCleanup?.(dispose);
  locate();
})();
