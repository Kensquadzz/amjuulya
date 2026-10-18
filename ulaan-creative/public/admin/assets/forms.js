// Schema-driven forms for website content sections.
// Field types: text | textarea | url | select | toggle | lines | list | media
import { h, setDirty } from './lib.js';
import { mediaField } from './media.js';

let uid = 0;
const fid = () => `f${++uid}`;

/**
 * Renders fields for `schema` bound to the plain object `value` (mutated in place).
 * Returns the root element.
 */
export function buildForm(schema, value, { mediaCache = {} } = {}) {
  return h('div.form-grid', schema.map((f) => field(f, value, mediaCache)));
}

function field(f, obj, mediaCache) {
  const id = fid();
  const set = (v) => { obj[f.name] = v; setDirty(true); };
  const help = f.help ? h('p.help', { id: `${id}-h` }, f.help) : null;
  const common = { id, 'aria-describedby': f.help ? `${id}-h` : null };
  const wrap = (control) => h('div.field', { class: f.wide ? 'field--wide' : '' }, h('label', { for: id }, f.label), help, control);

  switch (f.type) {
    case 'textarea': {
      const el = h('textarea', { ...common, rows: f.rows || 4, maxlength: f.max || 5000, value: obj[f.name] ?? '' });
      el.oninput = () => set(el.value);
      return wrap(el);
    }
    case 'select': {
      const el = h('select', common, f.options.map(([v, l]) => h('option', { value: v }, l)));
      el.value = obj[f.name] ?? f.options[0][0];
      el.onchange = () => set(el.value);
      return wrap(el);
    }
    case 'toggle': {
      const el = h('input', { ...common, type: 'checkbox', checked: Boolean(obj[f.name]) });
      el.onchange = () => set(el.checked);
      return h('div.field.field--toggle', h('label.switch', { for: id }, el, h('span', f.label)), help);
    }
    case 'lines': {
      const el = h('textarea', { ...common, rows: f.rows || 5, value: (obj[f.name] || []).join('\n') });
      el.oninput = () => set(el.value.split('\n').map((s) => s.trim()).filter(Boolean));
      return wrap(el);
    }
    case 'media': {
      return mediaField({
        label: f.label, kind: f.kind || 'image', help: f.help,
        value: obj[f.name] ? mediaCache[obj[f.name]] || { id: obj[f.name], name: 'Сонгосон медиа', kind: f.kind || 'image', thumbUrl: '' } : null,
        onChange: (m) => { if (m) mediaCache[m.id] = m; set(m ? m.id : null); },
      });
    }
    case 'list':
      return listField(f, obj, mediaCache);
    default: {
      const el = h('input', { ...common, type: f.type === 'url' ? 'url' : 'text', maxlength: f.max || 500, value: obj[f.name] ?? '', placeholder: f.placeholder || '' });
      el.oninput = () => set(el.value);
      return wrap(el);
    }
  }
}

function listField(f, obj, mediaCache) {
  obj[f.name] = Array.isArray(obj[f.name]) ? obj[f.name] : [];
  const items = obj[f.name];
  const list = h('ol.list-editor');
  const draw = () => {
    list.replaceChildren(...items.map((it, i) => h('li.list-editor__item',
      h('div.list-editor__head',
        h('strong', `${f.itemLabel || 'Мөр'} ${i + 1}${f.titleOf ? ` — ${f.titleOf(it) || ''}` : ''}`),
        h('div.row.row--tight',
          h('button.icon-btn', { type: 'button', disabled: i === 0, 'aria-label': 'Дээш зөөх', onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; setDirty(true); draw(); } }, '↑'),
          h('button.icon-btn', { type: 'button', disabled: i === items.length - 1, 'aria-label': 'Доош зөөх', onclick: () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; setDirty(true); draw(); } }, '↓'),
          h('button.icon-btn', { type: 'button', 'aria-label': 'Устгах', onclick: () => { if (confirm('Энэ мөрийг устгах уу?')) { items.splice(i, 1); setDirty(true); draw(); } } }, '✕'))),
      buildForm(f.fields, it, { mediaCache }))));
    if (!items.length) list.append(h('li.muted', 'Хоосон.'));
  };
  draw();
  const add = h('button.btn.btn--ghost', { type: 'button', onclick: () => { items.push(structuredClone(f.template)); setDirty(true); draw(); } }, `+ ${f.addLabel || 'Нэмэх'}`);
  return h('fieldset.field.field--wide', h('legend', f.label), f.help ? h('p.help', f.help) : null, list, add);
}
