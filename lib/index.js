import { createPlugin, pkgRootFrom } from '@deepwhale-cn/dsh-guard-core/plugin';

export const { name, inject, apply } = createPlugin({
  name: 'xlsx-batch',
  pkgRoot: pkgRootFrom(import.meta.url),
  skillFile: 'skill/xlsx-batch.md',
  binFile: 'bin/cli.mjs',
  description: 'Excel 批量合并 / 清洗空行 / 汇总 / 导出 CSV，一次处理整目录',
  whenToUse: '当用户要批量处理整目录的 Excel（.xlsx/.xlsm）时使用：多文件多 sheet 合并、删空行去重 trim、按列统计非空与数值求和、每个 sheet 导出 CSV。典型说法：「把这些门店表合成一张总表」「表格去重删空行」「统计每列金额合计」「Excel 批量转 CSV」。不用于 .xls 老格式、加密表格或需要保留公式/图表/宏的场景。',
});
