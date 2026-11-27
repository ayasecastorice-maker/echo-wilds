/* Two-slot recipes compose the existing simulation; no additional spell rules.
 * The host must call cancelPending() before manual rune/form changes, camp,
 * reset or restore, and step(dt) with the same simulation seconds as game.step.
 * Pause game input and time while any native dialog is open.
 */
(function () {
  'use strict';
  const STORAGE_KEY = 'echo-wilds.recipe.v1';
  const RUNES = { frost: '凝霜', wind: '引风', echo: '回响' };
  const FORMS = { focus: '聚点', trail: '连缀' };
  const RUNE_CODE = { frost: '霜', wind: '风', echo: '响' };
  const FORM_CODE = { focus: '聚', trail: '连' };
  const DEFAULT = {
    version: 1, name: '霜桥回声', delay: 0.85,
    slots: [{ rune: 'frost', form: 'trail' }, { rune: 'echo', form: 'focus' }]
  };
  let instanceNumber = 0;
  const clone = value => JSON.parse(JSON.stringify(value));
  const cleanName = value => Array.from(String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 24).join('');

  function validRecipe(value) {
    return value && value.version === 1 && Array.isArray(value.slots) && value.slots.length === 2 &&
      value.slots.every(slot => slot && Object.hasOwn(RUNES, slot.rune) && Object.hasOwn(FORMS, slot.form)) &&
      (value.delay === 0.85 || value.delay === 1.3);
  }
  function encode(recipe) {
    return 'EW1-' + recipe.slots.map(slot => RUNE_CODE[slot.rune] + FORM_CODE[slot.form]).join('-') +
      '-' + (recipe.delay === 0.85 ? '短' : '长');
  }
  function decode(code) {
    const match = String(code).trim().match(/^EW1-([霜风响])([聚连])-([霜风响])([聚连])-([短长])$/i);
    if (!match) return null;
    const rune = symbol => Object.keys(RUNE_CODE).find(id => RUNE_CODE[id] === symbol);
    const form = symbol => Object.keys(FORM_CODE).find(id => FORM_CODE[id] === symbol);
    const slots = [{ rune: rune(match[1]), form: form(match[2]) }, { rune: rune(match[3]), form: form(match[4]) }];
    return { version: 1, name: RUNES[slots[0].rune] + ' · ' + RUNES[slots[1].rune],
      delay: match[5] === '短' ? 0.85 : 1.3, slots };
  }

  function create({ game, onStatus = () => {}, onArmed = () => {} } = {}) {
    if (!game || !game.state || !['equip', 'setForm', 'cast'].every(key => typeof game[key] === 'function')) {
      throw new TypeError('EchoRecipes.create requires an EchoGame instance.');
    }
    let recipe = clone(DEFAULT), armed = false, pending = null, dialog = null, fields = null;
    const instance = ++instanceNumber;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (validRecipe(saved)) recipe = { version: 1, name: cleanName(saved.name) || '自定义配方',
        delay: saved.delay, slots: saved.slots.map(slot => ({ rune: slot.rune, form: slot.form })) };
    } catch (_) { /* Storage is optional; gameplay still works in memory. */ }

    function notify(message) {
      if (fields) fields.status.textContent = message;
      onStatus(message);
    }
    function cancelPending(message) {
      const hadPending = Boolean(pending);
      pending = null;
      document.removeEventListener('keydown', observeSwitch, true);
      if (hadPending && typeof message === 'string' && message) notify(message);
      return hadPending;
    }
    function observeSwitch(event) {
      // Observe without preventDefault/stopPropagation. The host handles keys.
      if (!event.altKey && !event.ctrlKey && !event.metaKey &&
          ['Digit1', 'Digit2', 'Digit3', 'KeyQ'].includes(event.code)) {
        cancelPending('已改用手动符文，取消配方的第二术。');
      }
    }
    function arm() {
      cancelPending(); armed = true; onArmed(true, recipe.name);
      notify('已装配「' + recipe.name + '」，瞄准后可一次施放两术。');
      return true;
    }
    function disarm() {
      cancelPending(); armed = false; onArmed(false, recipe.name);
    }
    function cast(x, y) {
      if (!armed || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (dialog && dialog.open) return false;
      if (pending) { notify('配方正在衔接，稍等第二术完成。'); return false; }
      const state = game.state;
      if (state.jump || state.cooldown > 0) {
        notify('等落地或符文冷却后，再施放配方。'); return false;
      }
      const first = recipe.slots[0], second = recipe.slots[1];
      game.equip(first.rune); game.setForm(first.form);
      if (!game.cast(x, y)) { notify('第一术没有施放成功，请换一个有效目标。'); return false; }
      pending = { x, y, remaining: recipe.delay, blockedFor: 0,
        first: { ...first }, second: { ...second }, player: state.player,
        lastTime: state.time, name: recipe.name };
      document.addEventListener('keydown', observeSwitch, true);
      notify('「' + recipe.name + '」第一术已发出，正在衔接。');
      return true;
    }
    function step(dt) {
      if (!pending || !Number.isFinite(dt) || dt <= 0 || (dialog && dialog.open)) return;
      const state = game.state, queued = pending;
      if (state.player !== queued.player || state.time < queued.lastTime ||
          state.rune !== queued.first.rune || state.form !== queued.first.form) {
        cancelPending('状态已改变，取消配方的第二术。'); return;
      }
      queued.lastTime = state.time;
      const beforeDelay = queued.remaining;
      queued.remaining -= dt;
      if (queued.remaining > 1e-8) return;
      if (state.jump || state.cooldown > 0) {
        queued.blockedFor += beforeDelay > 0 ? Math.max(0, -queued.remaining) : dt;
        if (queued.blockedFor >= 1.5) cancelPending('暂时无法续接，第二术已取消。');
        return;
      }
      // Clear before core callbacks run. The cast originates from the player's
      // current position but retains the exact world target of the first cast.
      cancelPending();
      game.equip(queued.second.rune); game.setForm(queued.second.form);
      if (game.cast(queued.x, queued.y)) notify('「' + queued.name + '」两术已完成。');
      else notify('第二术没有有效落点，配方已结束。');
    }

    function mount() {
      if (dialog) return;
      if (!document.getElementById('echo-recipe-style')) {
        const style = document.createElement('style');
        style.id = 'echo-recipe-style';
        style.textContent = `
          dialog.echo-recipe{box-sizing:border-box;width:min(444px,calc(100% - 28px));max-height:90dvh;overflow:auto;padding:24px;border:1px solid #89967c;border-radius:8px;background:#ebe6ce;color:#263e2f;box-shadow:0 24px 90px #06140dbb;font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif}
          dialog.echo-recipe::backdrop{background:#071910bb}
          .echo-recipe *{box-sizing:border-box}.echo-recipe header{display:flex;align-items:center;justify-content:space-between;gap:12px}.echo-recipe h2{margin:0;font:700 25px/1.3 "Noto Serif SC",SimSun,serif}.echo-recipe .er-close{border:0;background:none;font-size:25px;line-height:1;padding:4px 8px;color:inherit}
          .echo-recipe .er-lead{margin:8px 0 18px;color:#53644c;font-size:12px}.echo-recipe label{display:block;font-size:12px;color:#53644c}.echo-recipe input,.echo-recipe select{width:100%;min-width:0;margin-top:5px;padding:9px 10px;border:1px solid #9da58b;border-radius:4px;background:#f7f2df;color:#263e2f;font:inherit;font-size:14px;line-height:1.4}.echo-recipe input:focus,.echo-recipe select:focus{outline:2px solid #728b60;outline-offset:2px}
          .echo-recipe .er-slot{display:grid;grid-template-columns:48px minmax(0,1fr) minmax(0,1fr);align-items:end;gap:10px;margin:14px 0}.echo-recipe .er-slot strong{font-size:12px;padding-bottom:10px}.echo-recipe .er-delay{margin:16px 0}.echo-recipe .er-summary{min-height:20px;font-size:12px;color:#52654a}.echo-recipe .er-actions{display:flex;gap:8px;margin:18px 0 0}.echo-recipe button{cursor:pointer;border:1px solid #819271;border-radius:4px;background:#e6e2c9;padding:9px 13px;color:#2c4b35;font:inherit}.echo-recipe .er-primary{flex:1;background:#344f39;color:#fff4d5;border-color:#344f39}.echo-recipe .er-share{border-top:1px solid #bec4a9;margin-top:20px;padding-top:14px}.echo-recipe summary{cursor:pointer;font-size:13px}.echo-recipe .er-share p{font-size:11px;color:#647255;margin:8px 0}.echo-recipe .er-share-buttons{display:flex;gap:8px;margin-top:9px}.echo-recipe .er-share-buttons button{flex:1;font-size:12px}.echo-recipe .er-code{font-family:ui-monospace,Consolas,"Microsoft YaHei",monospace;font-size:13px}.echo-recipe .er-status{min-height:20px;margin:13px 0 0;color:#4c6547;font-size:12px}
          @media(max-width:400px){dialog.echo-recipe{padding:19px}.echo-recipe .er-slot{grid-template-columns:42px minmax(0,1fr) minmax(0,1fr);gap:7px}.echo-recipe input,.echo-recipe select{font-size:16px;padding:8px 6px}.echo-recipe .er-code{font-size:14px}}
        `;
        document.head.append(style);
      }
      dialog = document.createElement('dialog');
      dialog.className = 'echo-recipe';
      dialog.dataset.echoRecipes = '';
      dialog.setAttribute('aria-labelledby', 'echo-recipe-title-' + instance);
      dialog.innerHTML = `
        <form class="er-form">
          <header><h2 id="echo-recipe-title-${instance}">符文配方</h2><button class="er-close" type="button" aria-label="关闭配方">×</button></header>
          <p class="er-lead">把两次施法排成自己的顺序，沿同一目标接续。</p>
          <label>配方名 · 可选<input class="er-name" maxlength="24" placeholder="给这段组合取个名字" autocomplete="off"></label>
          ${[0, 1].map(i => `<div class="er-slot"><strong>${i === 0 ? '第一术' : '第二术'}</strong><label>符文<select data-er-rune="${i}"><option value="frost">凝霜</option><option value="wind">引风</option><option value="echo">回响</option></select></label><label>形态<select data-er-form="${i}"><option value="focus">聚点</option><option value="trail">连缀</option></select></label></div>`).join('')}
          <label class="er-delay">两术间隔<select class="er-delay-select"><option value="0.85">短 · 0.85 秒</option><option value="1.3">长 · 1.30 秒</option></select></label>
          <p class="er-summary"></p>
          <div class="er-actions"><button class="er-primary" type="submit">装配配方</button><button class="er-cancel" type="button">返回</button></div>
          <details class="er-share"><summary>分享或导入一张配方</summary><p>短码只包含两术与间隔，不含名称或探索存档。</p><label>配方短码<input class="er-code" spellcheck="false" autocomplete="off" aria-label="配方分享码"></label><div class="er-share-buttons"><button class="er-copy" type="button">复制当前配方</button><button class="er-import" type="button">导入短码</button></div></details>
          <p class="er-status" role="status" aria-live="polite"></p>
        </form>`;
      document.body.append(dialog);
      const find = selector => dialog.querySelector(selector);
      fields = { name: find('.er-name'), delay: find('.er-delay-select'), code: find('.er-code'),
        summary: find('.er-summary'), status: find('.er-status'),
        runes: [0, 1].map(i => find('[data-er-rune="' + i + '"]')),
        forms: [0, 1].map(i => find('[data-er-form="' + i + '"]')) };
      function draft() {
        return { version: 1, name: cleanName(fields.name.value) || '自定义配方', delay: Number(fields.delay.value),
          slots: fields.runes.map((field, i) => ({ rune: field.value, form: fields.forms[i].value })) };
      }
      function preview() {
        const value = draft();
        fields.summary.textContent = value.slots.map(slot => RUNES[slot.rune] + ' · ' + FORMS[slot.form]).join(' → ') +
          '，间隔 ' + value.delay.toFixed(2) + ' 秒。';
      }
      function fill(value) {
        fields.name.value = value.name; fields.delay.value = String(value.delay);
        value.slots.forEach((slot, i) => { fields.runes[i].value = slot.rune; fields.forms[i].value = slot.form; });
        fields.code.value = encode(value); preview();
      }
      fields.fill = fill;
      find('.er-close').onclick = find('.er-cancel').onclick = () => dialog.close();
      find('.er-form').addEventListener('change', preview);
      find('.er-form').addEventListener('submit', event => {
        event.preventDefault(); const value = draft();
        if (!validRecipe(value)) { notify('配方格式不正确，请重新选择两术。'); return; }
        recipe = value; let saved = true;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(recipe)); } catch (_) { saved = false; }
        dialog.close(); arm();
        if (!saved) notify('配方已装配；当前浏览器不允许保存，仅本次有效。');
      });
      find('.er-import').onclick = () => {
        const value = decode(fields.code.value);
        if (!value) { notify('短码格式不正确，例如：EW1-霜连-响聚-短。'); return; }
        fill(value); notify('配方已读入，检查后点「装配配方」启用。');
      };
      find('.er-copy').onclick = async () => {
        const value = draft();
        if (!validRecipe(value)) return;
        const code = encode(value); fields.code.value = code;
        let copied = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(code); copied = true;
          }
        } catch (_) { /* Local-file pages may need the selection fallback. */ }
        if (!copied) {
          fields.code.focus(); fields.code.select();
          try { copied = document.execCommand('copy'); } catch (_) { /* Manual copying remains available. */ }
        }
        notify(copied ? '配方短码已复制，可以直接发给朋友。' : '短码已选中，请使用浏览器的复制操作。');
      };
      dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      });
    }
    function open() {
      cancelPending(); mount(); fields.fill(recipe); fields.status.textContent = '';
      if (!dialog.open) dialog.showModal();
    }

    onArmed(false, recipe.name);
    return { open, arm, disarm, isArmed: () => armed, cast, step, cancelPending };
  }

  window.EchoRecipes = Object.freeze({ create });
}());
