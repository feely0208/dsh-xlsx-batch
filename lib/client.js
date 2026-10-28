/**
 * Excel 批量处理 —— 客户端半边（面板 UI）
 *
 * 挂两个槽（照 design-line / memory-doctor 已验证的写法）：
 *   · `sidebar.panellist` → 侧栏多一个「Word 批量」图标
 *   · `main`（keyed 槽）  → 中间栏渲染本面板
 *
 * 数据全走宿主 HTTP `/dsh-xlsx-batch/api`（同源，无需握手）。
 * 约束：不 require 任何 Harness 客户端包；只用主题令牌；不碰 CLI 内核。
 */
window.__ModuleLoader__.load({
  id: '@deepwhale-cn/dsh-xlsx-batch',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const react = require('react');
    const h = react.createElement;

    const SLOT_ICON = 'sidebar.panellist';
    const SLOT_MAIN = 'main';
    const PANEL_ID = 'xlsx-batch';
    const API = '/dsh-xlsx-batch/api';

    async function api(path, options) {
      const res = await fetch(`${API}${path}`, {
        headers: { 'content-type': 'application/json' },
        ...options,
        body: options && options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { ok: false, error: text };
      }
      if (!res.ok && data && !data.error) data.error = `HTTP ${res.status}`;
      return data;
    }

    const 图标 = () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }, [
      h('path', { key: 'a', d: 'M4 4h10l6 6v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z' }),
      h('path', { key: 'b', d: 'M14 4v6h6' }),
      h('path', { key: 'c', d: 'M8 13h8M8 17h5' }),
    ]);

    const CSS = `
      .dxb-root { display:flex; flex-direction:column; gap:14px; padding:18px 20px 28px; height:100%; overflow:auto; }
      .dxb-h { display:flex; align-items:center; gap:10px; }
      .dxb-title { font-size:16px; font-weight:600; }
      .dxb-sub { color: var(--dsw-alias-text-secondary, #8b98a8); font-size:12px; }
      .dxb-card { border:1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08)); border-radius:12px; background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.03)); padding:14px; display:flex; flex-direction:column; gap:10px; }
      .dxb-row { display:flex; gap:8px; align-items:center; }
      .dxb-label { font-size:12px; color: var(--dsw-alias-text-secondary, #8b98a8); width:64px; flex:none; }
      .dxb-input, .dxb-select, .dxb-area { flex:1; min-width:0; padding:7px 9px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12)); background: var(--dsw-alias-bg-base, transparent); color: inherit; font-size:13px; font-family:inherit; }
      .dxb-area { min-height:70px; resize:vertical; font-family: ui-monospace, Menlo, monospace; }
      .dxb-btn { padding:7px 16px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.14)); background: var(--dsw-alias-brand-primary, #2f6f9f); color:#fff; font-size:13px; cursor:pointer; }
      .dxb-btn[disabled] { opacity:.55; cursor:default; }
      .dxb-btn.ghost { background:transparent; color:inherit; }
      .dxb-out { white-space:pre-wrap; word-break:break-word; font-family: ui-monospace, Menlo, monospace; font-size:12px; line-height:1.6; max-height:300px; overflow:auto; background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.18)); border-radius:8px; padding:10px; }
      .dxb-err { color: var(--dsw-alias-state-error-primary, #e0645a); }
      .dxb-ok { color: var(--dsw-alias-state-success-primary, #46b47a); }
      .dxb-tip { font-size:12px; color: var(--dsw-alias-text-secondary, #8b98a8); }
    `;

    function 面板() {
      const [ops, 设ops] = react.useState([]);
      const [action, 设action] = react.useState('replace');
      const [input, 设input] = react.useState('');
      const [out, 设out] = react.useState('');
      const [跑, 设跑] = react.useState(false);
      const [结果, 设结果] = react.useState(null);

      react.useEffect(() => {
        void (async () => {
          const r = await api('/ops');
          if (r && Array.isArray(r.ops) && r.ops.length) 设ops(r.ops);
        })();
      }, []);

      const 当前 = ops.find((o) => o.key === action);

      const 执行 = async () => {
        设跑(true);
        设结果(null);
        try {
          const r = await api('/run', { method: 'POST', body: { action, input, out } });
          设结果(r);
        } catch (e) {
          设结果({ ok: false, error: e instanceof Error ? e.message : String(e) });
        } finally {
          设跑(false);
        }
      };

      return h('div', { className: 'dxb-root' }, [
        h('style', { key: 'css' }, CSS),
        h('div', { key: 'head', className: 'dxb-h' }, [
          h('div', { key: 'i', style: { display: 'flex', alignItems: 'center' } }, h(图标)),
          h('div', { key: 't' }, [
            h('div', { key: 'a', className: 'dxb-title' }, 'Excel 批量处理'),
            h('div', { key: 'b', className: 'dxb-sub' }, '合并 / 清洗 / 汇总 / 转 CSV · 一次处理整目录'),
          ]),
        ]),

        h('div', { key: 'form', className: 'dxb-card' }, [
          h('div', { key: 'op', className: 'dxb-row' }, [
            h('span', { key: 'l', className: 'dxb-label' }, '操作'),
            h('select', { key: 's', className: 'dxb-select', value: action, onChange: (e) => 设action(e.target.value) },
              (ops.length ? ops : [{ key: 'merge', label: '合并工作簿' }]).map((o) => h('option', { key: o.key, value: o.key }, o.label))),
          ]),
          h('div', { key: 'in', className: 'dxb-row' }, [
            h('span', { key: 'l', className: 'dxb-label' }, '文件/目录'),
            h('input', { key: 'i', className: 'dxb-input', placeholder: '例如 D:\\\\DeepSeek Harness\\\\case_zhumei2 或 /Users/mac/合同', value: input, onChange: (e) => 设input(e.target.value) }),
          ]),
          h('div', { key: 'out', className: 'dxb-row' }, [
            h('span', { key: 'l', className: 'dxb-label' }, '输出目录'),
            h('input', { key: 'i', className: 'dxb-input', placeholder: '留空 = <输入目录>/_输出', value: out, onChange: (e) => 设out(e.target.value) }),
          ]),
          当前 && 当前.hint ? h('div', { key: 'hint', className: 'dxb-tip' }, 当前.hint) : null,
          h('div', { key: 'act', className: 'dxb-row', style: { justifyContent: 'flex-end' } }, [
            h('button', { key: 'b', className: 'dxb-btn', disabled: 跑, onClick: 执行 }, 跑 ? '正在处理…' : '开始处理'),
          ]),
        ]),

        结果
          ? h('div', { key: 'res', className: 'dxb-card' }, [
              h('div', { key: 's', className: 结果.ok ? 'dxb-ok' : 'dxb-err' }, 结果.ok ? '完成' : `失败${结果.error ? '：' + 结果.error : ''}`),
              结果.output ? h('div', { key: 'o', className: 'dxb-out' }, 结果.output) : null,
            ])
          : null,

        h('div', { key: 'tip', className: 'dxb-tip' },
          '需要 python3 + python-docx。命令等价于 CLI：dsh-xlsx-batch <操作> --input <路径>；所有处理都在本机完成，不上传文件。'),
      ]);
    }

    const inject = ['slots'];
    function apply(ctx) {
      const 试 = (名, fn) => {
        try {
          fn();
        } catch (e) {
          try {
            console.warn('[xlsx-batch] 插槽注册失败（已跳过）：' + 名, e && e.message ? e.message : e);
          } catch {
            /* ignore */
          }
        }
      };
      试('侧栏图标', () => ctx.slots.inject(SLOT_ICON, function* () {
        yield ctx.slots.register({ name: SLOT_ICON, id: PANEL_ID, order: 24, label: 'Excel 批量' }, 图标);
      }));
      试('主面板', () => ctx.slots.inject(SLOT_MAIN, function* () {
        yield ctx.slots.register({ name: SLOT_MAIN, key: PANEL_ID }, 面板);
      }));
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
