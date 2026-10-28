import { createPlugin, pkgRootFrom } from '@deepwhale-cn/dsh-guard-core/plugin';
import { registerXlsxBatchApi } from './api.js';

const base = createPlugin({
  name: 'xlsx-batch',
  pkgRoot: pkgRootFrom(import.meta.url),
  skillFile: 'skill/xlsx-batch.md',
  binFile: 'bin/cli.mjs',
  description: 'Excel 批量合并 / 清洗 / 列汇总 / 导出 CSV，一次处理整目录',
  whenToUse: '当用户要批量处理整目录的 Excel（.xlsx）时使用：多文件/多 sheet 合并（加来源列）、删空行去重、列汇总报告、每 sheet 导出 CSV。典型说法：「把这几张表合并成一张」「这些表去重清洗一下」「导出成 CSV」。不用于 .xls 老格式或需要公式重算的场景。',
});

/** 技能名（与 cordis.patch.yml 的行 id 对应） */
export const name = base.name;
/** 技能服务 + 面板要用的 HTTP 出口 */
export const inject = [...base.inject, 'webServer'];

/**
 * 先注册技能（CLI/Agent 用），再把面板用的 HTTP 出口挂上。
 * webServer 缺失时只影响面板，CLI 与 skill 照常 —— 不让可选能力阻断启动。
 */
export function apply(ctx) {
  base.apply(ctx);
  try {
    if (ctx.webServer && typeof ctx.webServer.register === 'function') {
      registerXlsxBatchApi(ctx);
      ctx.logger?.info?.('[xlsx-batch] 已挂面板出口 /dsh-xlsx-batch/api');
    }
  } catch (e) {
    ctx.logger?.warn?.('[xlsx-batch] 面板出口注册失败（CLI/skill 不受影响）: ' + (e && e.message ? e.message : e));
  }
}
