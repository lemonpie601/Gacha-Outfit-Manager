/* Gacha Forge Outfit Manager 1.0.0 — standalone extension, no installed package patches. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GachaOutfitManagerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/gu, ' ');
  const fingerprint = value => JSON.stringify([normalize(value.title), value.desc]);
  const makeKey = () => 'saved:' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  const errors = {
    'library-full': '게임 라이브러리가 가득 찼습니다. 먼저 일부 테마를 비활성화하세요.',
    'write-conflict': '다른 저장 작업과 겹쳤습니다. 새로고침 후 다시 시도하세요.',
    'not-found': '해당 테마 또는 세계가 더 이상 존재하지 않습니다.',
    'bad-request': '이 버전에서 요청을 처리할 수 없습니다.'
  };

  function validateTheme(value, index = 0) {
    if (!value || typeof value !== 'object' || typeof value.title !== 'string' || typeof value.desc !== 'string') throw new Error(`${index + 1}번째 테마의 제목 또는 설명이 없습니다.`);
    const title = value.title.trim(), desc = value.desc.replace(/\r\n?/gu, '\n').trim();
    if (!title || !desc || title.length > 48 || desc.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(title + desc) || /[\r\n\t]/u.test(title)) throw new Error(`${index + 1}번째 테마를 확인하세요. 제목은 한 줄 1–48자, 설명은 1–2000자여야 합니다.`);
    return { title, desc };
  }

  function planWorldSelection(choice, activeIds, pickedIds, enabled) {
    const original = Array.isArray(choice.ids) ? choice.ids : [];
    const existing = [...new Set(original.filter(id => activeIds.has(id)))];
    const used = new Set(existing), picked = [...new Set(pickedIds)].filter(id => activeIds.has(id));
    const additions = picked.filter(id => !used.has(id));
    const available = Math.max(0,64-existing.length);
    const accepted = additions.slice(0,available);
    const removed = new Set(picked);
    const ids = enabled ? [...existing,...accepted] : existing.filter(id => !removed.has(id));
    return {ids,available,done:enabled ? accepted.length : existing.length-ids.length,
      already:enabled ? picked.length-additions.length : 0,
      capacitySkipped:enabled ? additions.length-accepted.length : 0,
      worldCount:ids.length,unchanged:JSON.stringify(original)===JSON.stringify(ids)};
  }

  class Manager {
    constructor(adapter) {
      this.adapter = adapter;
      this.data = { version: 1, records: [], backup: null };
      this.library = [];
      this.runs = [];
      this.usage = {};
      this.activeRunId = '';
      this.busy = false;
    }
    async init() {
      const saved = await this.adapter.load();
      if (saved && Object.keys(saved).length) {
        if (saved.version !== 1 || !Array.isArray(saved.records)) throw new Error('확장 보관함 형식이 올바르지 않습니다. 저장소를 덮어쓰지 않았습니다.');
        const keys = new Set();
        for (const item of saved.records) {
          validateTheme(item);
          if (!item.key || keys.has(item.key) || !['inactive', 'trash'].includes(item.status) || !Array.isArray(item.originalIds)) throw new Error('보관함에 손상된 항목이 있습니다. 백업 파일을 확인하세요.');
          keys.add(item.key);
        }
        this.data = clone(saved);
      }
      await this.refresh();
      return this;
    }
    async request(route, body) {
      const response = await this.adapter.request(route, body);
      if (!response || response.ok !== true) throw new Error(errors[response?.error] || `요청 실패: ${response?.error || route}`);
      return response;
    }
    async refresh() {
      const [themes, state] = await Promise.all([this.request('/themes'), this.request('/state')]);
      if (!Array.isArray(themes.themes) || !Array.isArray(state.runs)) throw new Error('가챠포지의 응답 형식이 지원되는 버전과 다릅니다.');
      const ids = new Set();
      for (const theme of themes.themes) {
        validateTheme(theme);
        if (typeof theme.id !== 'string' || !theme.id || ids.has(theme.id)) throw new Error('라이브러리의 테마 ID가 올바르지 않습니다.');
        ids.add(theme.id);
      }
      this.library = clone(themes.themes);
      this.usage = clone(themes.usage || {});
      this.runs = clone(state.runs);
      this.activeRunId = state.activeRunId || '';
      return this.rows();
    }
    rows() {
      const activeIds = new Set(this.library.map(item => item.id));
      return this.library.map(item => ({ ...item, key: 'active:' + item.id, status: 'active' })).concat(
        this.data.records.filter(item => !item.originalIds.some(id => activeIds.has(id))).map(item => ({ ...clone(item), pending: !!item.restoreId }))
      );
    }
    async persist(next) {
      const bytes = new TextEncoder().encode(JSON.stringify(next)).length;
      if (bytes > 900000) throw new Error('보관함 저장 용량에 가까워졌습니다. JSON으로 내보내고 불필요한 휴지통 항목을 정리하세요. 이번 작업은 저장하지 않았습니다.');
      await this.adapter.save(clone(next));
      this.data = clone(next);
    }
    async exclusive(work) {
      if (this.busy) throw new Error('다른 테마 작업이 끝날 때까지 기다려 주세요.');
      this.busy = true;
      try { return await work(); } finally { this.busy = false; }
    }
    select(keys) {
      const rows = new Map(this.rows().map(item => [item.key, item]));
      const result = [...new Set(keys)].map(key => rows.get(key));
      if (!result.length || result.some(item => !item)) throw new Error('선택한 테마가 변경되었습니다. 새로고침 후 다시 선택하세요.');
      return result;
    }
    assertIdle() {
      if (this.runs.some(run => Array.isArray(run.generating) && run.generating.length)) throw new Error('가챠포지가 생성 작업 중입니다. 생성이 끝난 뒤 테마를 변경하세요.');
    }
    backup(next) {
      next.backup = { at: new Date().toISOString(), themes: clone(this.library), worlds: this.runs.map(run => ({ runId: run.runId, name: run.name || '', outfitThemes: clone(run.outfitThemes || { ids: [], order: 'cycle' }) })) };
    }
    async importThemes(input) {
      return this.exclusive(async () => {
        const list = Array.isArray(input) ? input : input?.themes;
        if (!Array.isArray(list) || !list.length || list.length > 2000) throw new Error('themes 배열이 있는 JSON을 선택하세요. 한 번에 1–2000개를 가져올 수 있습니다.');
        const checked = list.map(validateTheme);
        await this.refresh();
        const next = clone(this.data), known = new Set(this.rows().map(fingerprint));
        let added = 0;
        for (const theme of checked) {
          const hash = fingerprint(theme);
          if (known.has(hash)) continue;
          known.add(hash);
          next.records.push({ key: makeKey(), ...theme, originalIds: [], status: 'inactive', at: new Date().toISOString() });
          added++;
        }
        await this.persist(next);
        return { done: added, skipped: list.length - added, errors: [] };
      });
    }
    async move(keys, status) {
      return this.exclusive(async () => {
        if (!['inactive', 'trash'].includes(status)) throw new Error('지원되지 않는 작업입니다.');
        await this.refresh();
        this.assertIdle();
        const selected = this.select(keys), next = clone(this.data);
        this.backup(next);
        for (const row of selected) {
          if (row.status === 'active') {
            const existing = next.records.find(item => item.originalIds.includes(row.id));
            if (existing) Object.assign(existing, { title: row.title, desc: row.desc, status });
            else next.records.push({ key: makeKey(), title: row.title, desc: row.desc, originalIds: [row.id], status, at: new Date().toISOString() });
          } else {
            next.records.find(item => item.key === row.key).status = status;
          }
        }
        // The durable copy is written BEFORE the first server mutation.
        await this.persist(next);
        const result = { done: 0, errors: [] };
        for (const row of selected) {
          try {
            if (row.status === 'active') {
              const response = await this.request('/theme/delete', { id: row.id });
              if (!Array.isArray(response.themes) || response.themes.some(theme => theme.id === row.id)) throw new Error('삭제 결과를 확인할 수 없습니다. 보관 사본은 유지했습니다.');
              this.library = clone(response.themes);
            }
            result.done++;
          } catch (error) {
            result.errors.push({ title: row.title, message: error.message });
            if (error.code === 'RATE_LIMITED' || error.name === 'AbortError') {
              result.stopped = true;result.remaining = selected.length - result.done - result.errors.length;break;
            }
          }
        }
        if (!result.stopped) await this.refresh();
        return result;
      });
    }
    async activate(keys) {
      return this.exclusive(async () => {
        await this.refresh();
        this.assertIdle();
        const selected = this.select(keys);
        if (selected.some(item => item.status !== 'inactive')) throw new Error('보관함의 비활성 테마만 활성화할 수 있습니다.');
        const fresh = selected.filter(row => !this.library.some(theme => fingerprint(theme) === fingerprint(row)));
        if (this.library.length + fresh.length > 200) throw new Error(`활성 테마는 최대 200개입니다. 지금은 ${200 - this.library.length}개를 추가할 수 있습니다.`);
        const next = clone(this.data);
        this.backup(next);
        await this.persist(next);
        const result = { done: 0, errors: [] };
        for (const row of selected) {
          try {
            let active = this.library.find(theme => theme.id === row.restoreId) || this.library.find(theme => fingerprint(theme) === fingerprint(row));
            if (!active) {
              const response = await this.request('/theme/save', { title: row.title, desc: row.desc });
              if (!Array.isArray(response.themes)) throw new Error('생성 결과를 확인할 수 없습니다. 보관 사본은 유지했습니다.');
              this.library = clone(response.themes);
              active = this.library.find(theme => fingerprint(theme) === fingerprint(row));
              if (!active) throw new Error('새 테마의 ID를 확인할 수 없습니다.');
            }
            if (row.originalIds.length) {
              const pending = clone(this.data);
              pending.records.find(item => item.key === row.key).restoreId = active.id;
              await this.persist(pending);
              const state = await this.request('/state');
              for (const run of state.runs || []) {
                const choice = run.outfitThemes || { ids: [], order: 'cycle' };
                const ids = Array.isArray(choice.ids) ? choice.ids : [];
                if (!ids.some(id => row.originalIds.includes(id))) continue;
                const mapped = [...new Set(ids.map(id => row.originalIds.includes(id) ? active.id : id))];
                const response = await this.request('/run/sources', { runId: run.runId, sources: { outfitThemes: { ids: mapped, order: choice.order || 'cycle' } } });
                if (JSON.stringify(response.run?.outfitThemes?.ids) !== JSON.stringify(mapped)) throw new Error('세계의 테마 복원을 확인할 수 없습니다. 보관 사본으로 다시 시도할 수 있습니다.');
              }
            }
            const completed = clone(this.data);
            completed.records = completed.records.filter(item => item.key !== row.key);
            await this.persist(completed);
            result.done++;
          } catch (error) {
            result.errors.push({ title: row.title, message: error.message });
            if (error.code === 'RATE_LIMITED' || error.name === 'AbortError') {
              result.stopped = true;result.remaining = selected.length - result.done - result.errors.length;break;
            }
          }
        }
        if (!result.stopped) await this.refresh();
        return result;
      });
    }
    async restore(keys) {
      return this.exclusive(async () => {
        const selected = this.select(keys);
        if (selected.some(item => item.status !== 'trash')) throw new Error('휴지통의 테마를 선택하세요.');
        const next = clone(this.data), selectedKeys = new Set(keys);
        for (const row of next.records) if (selectedKeys.has(row.key)) row.status = 'inactive';
        await this.persist(next);
        return { done: selected.length, errors: [] };
      });
    }
    async purge(keys) {
      return this.exclusive(async () => {
        const selected = this.select(keys);
        if (selected.some(item => item.status !== 'trash')) throw new Error('휴지통에서만 완전히 지울 수 있습니다.');
        const next = clone(this.data), selectedKeys = new Set(keys);
        next.records = next.records.filter(item => !selectedKeys.has(item.key));
        await this.persist(next);
        return { done: selected.length, errors: [] };
      });
    }
    async setWorld(keys, runId, enabled) {
      return this.exclusive(async () => {
        await this.refresh();
        this.assertIdle();
        const selected = this.select(keys);
        if (selected.some(item => item.status !== 'active')) throw new Error('세계에 적용하려면 먼저 테마를 활성화하세요.');
        const run = this.runs.find(item => item.runId === runId);
        if (!run) throw new Error('적용할 세계를 선택하세요.');
        const choice = run.outfitThemes || { ids: [], order: 'cycle' };
        const activeIds = new Set(this.library.map(item => item.id));
        // Preserve current usable choices, and admit new IDs only into vacant slots.
        const plan = planWorldSelection(choice,activeIds,selected.map(item => item.id),enabled);
        const {ids} = plan;
        if (ids.length > 64) throw new Error('세계에 저장된 선택이 64개를 넘습니다. 먼저 일부를 해제하세요.');
        const result = {kind:'world',enabled,...plan,errors:[]};
        if (plan.unchanged) return result;
        const next = clone(this.data);
        this.backup(next);
        await this.persist(next);
        const response = await this.request('/run/sources', { runId, sources: { outfitThemes: { ids, order: choice.order || 'cycle' } } });
        if (JSON.stringify(response.run?.outfitThemes?.ids) !== JSON.stringify(ids)) throw new Error('세계에 저장된 결과가 다릅니다. 새로고침 후 확인하세요.');
        await this.refresh();
        return result;
      });
    }
    exportThemes(keys) {
      const rows = keys ? this.select(keys) : this.rows();
      return { version: 1, themes: rows.filter(row => row.status !== 'trash').map(row => ({ title: row.title, desc: row.desc })) };
    }
    exportBackup() { return clone(this.data.backup); }
  }
  return { Manager, validateTheme, normalize, planWorldSelection };
});
