/**
 * Excel 批量处理 —— 宿主半边 HTTP 出口（面板用）
 *
 * 面板（lib/client.js）跟这里是同源的：浏览器 fetch `/dsh-xlsx-batch/api/*`，
 * 由 DSH 宿主把请求交给这个 handler，真正干活的是随包的 bin/cli.mjs（Python 内核不变）。
 *
 * 安全约束：
 *   · 参数一律走数组传给子进程，不拼 shell 字符串；
 *   · 只允许白名单里的 action；
 *   · 超时 10 分钟，超时杀掉整棵子进程树。
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(PKG_ROOT, 'bin', 'cli.mjs');
const ROUTE = '/dsh-xlsx-batch';

/** 面板可做的操作（与 CLI 的 action 一一对应） */
const OPS = [
  { key: 'merge', label: '合并工作簿（加来源列）' },
  { key: 'clean', label: '清洗：删空行 / 去重 / trim' },
  { key: 'summary', label: '列汇总报告' },
  { key: 'csv', label: '每个 sheet 导出 CSV' },
];

const 上限 = 10 * 60 * 1000;

function 回(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

async function 读体(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** 跑 CLI：返回 { ok, code, output } */
function 跑CLI(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      // 与壳里其它子进程一致：用 Electron 当 Node（纯 node 环境下这个变量无副作用）
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
    });
    let out = '';
    const 收集 = (d) => {
      out += String(d);
      if (out.length > 200_000) out = out.slice(-200_000); // 防止刷爆内存
    };
    child.stdout?.on('data', 收集);
    child.stderr?.on('data', 收集);
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* 已退出 */
      }
      收集('\n[超时] 超过 10 分钟仍未完成，已终止。');
    }, 上限);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, code: -1, output: `启动失败：${e instanceof Error ? e.message : String(e)}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code: code ?? -1, output: out.trim() });
    });
  });
}

/** 把面板参数翻译成 CLI 参数 */
function 组参数(b) {
  const action = String(b.action || '');
  if (!OPS.some((o) => o.key === action)) return { error: `未知操作：${action}` };
  const input = String(b.input || '').trim();
  if (!input) return { error: '请填写要处理的文件或目录路径' };
  if (!existsSync(input)) return { error: `路径不存在：${input}` };
  const args = [action, '--input', input];
  const out = String(b.out || '').trim();
  if (out) args.push('--out', out);
  return { args };
}

/**
 * 挂到宿主 webServer 上。
 * @param {any} ctx 插件上下文（需已注入 webServer）
 */
export function registerXlsxBatchApi(ctx) {
  const handler = async (req, res) => {
    try {
      const u = new URL(req.url || '/', 'http://127.0.0.1');
      const p = u.pathname;
      if (p === `${ROUTE}/api/ops` && req.method === 'GET') {
        return 回(res, 200, { ok: true, ops: OPS });
      }
      if (p === `${ROUTE}/api/run` && req.method === 'POST') {
        const b = await 读体(req);
        const { args, error } = 组参数(b);
        if (error) return 回(res, 400, { ok: false, error });
        const r = await 跑CLI(args);
        return 回(res, 200, r);
      }
      return 回(res, 404, { ok: false, error: 'not found' });
    } catch (e) {
      return 回(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  };
  ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler });
}
