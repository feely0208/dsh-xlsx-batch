# @deepwhale-cn/dsh-xlsx-batch

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/feely0208/dsh-xlsx-batch)

**整目录的 Excel 一次处理完**：多文件多 sheet 合并、删空行去重 trim、列级汇总、每个 sheet 导出 CSV —— 不开 Excel，不动原表。

**关键词**：Excel 批量合并 · xlsx 批量处理 · 多表合并 · Excel 去重 · 删除空行 · Excel 汇总统计 · Excel 转 CSV · 表格清洗

## 不装会怎样

月底拿到 20 个门店各自发来的销售表，每张表 sheet 名不一样、列顺序不一样，要合成一张总表：
不装就得逐个打开、复制、粘贴，粘错一列整张表就废了，还很容易把某家门店漏掉。

名单表里混着空行、重复行、前后带空格的姓名，导入系统就报错；
想快速统计每列非空多少、金额列合计多少，得挨个 sheet 套公式；
系统只认 CSV 时，还要手动「另存为」几十次。

这个插件把这些重复劳动收成一条命令。**只读原表**，结果写到单独的输出目录，
同名文件自动加序号、绝不覆盖原文件。

## 能做什么

| 子命令 | 作用 | 产物（可核对） |
|---|---|---|
| `merge` | 多文件、多 sheet 合并到一个工作簿；自动加「来源文件」「来源工作表」两列 | `merged.xlsx`；不同 sheet 列顺序不同也能按表头名对齐 |
| `clean` | 删空行、删重复行、trim 文本前后空格，保留全部 sheet | 每个输入文件一个清洗后的 `.xlsx`；JSON 给出删了几行、trim 了几格 |
| `summary` | 每列非空计数、数值列个数与求和 | `summary.xlsx`（文件 / 工作表 / 列名 / 非空计数 / 数值个数 / 求和） |
| `csv` | 每个 sheet 导出成 CSV | `<文件名>__<sheet名>.csv`，UTF-8 带 BOM，Excel 双击打开不乱码 |

共同约定：

- **不修改输入文件**，默认输出到 `<输入目录>/_输出`，可用 `--out` 指定；
- **同名文件不覆盖**：已存在时自动加 `_1`、`_2`；
- 目录递归处理，自动跳过 Excel 临时文件（`~$` 开头）和 `_输出` 目录；
- `--json` 输出结构化结果，方便脚本 / CI 断言；出错时退出码非 0 并说明缺什么。

```bash
# 20 个门店表合并成一张总表
dsh-xlsx-batch merge --input ./门店报表 --out ./汇总

# 清洗名单：删空行、去重、trim
dsh-xlsx-batch clean --input ./名单 --out ./清洗后

# 每列统计
dsh-xlsx-batch summary --input ./报表 --out ./统计

# 每个 sheet 导 CSV
dsh-xlsx-batch csv --input ./报表 --out ./csv
```

## 不能做什么

- ❌ **读的是值，不是公式**：公式单元格取 Excel 上次保存时缓存的计算结果；没缓存过的公式可能读成空。
  `clean`/`csv`/`merge` 的输出是**值**，公式、条件格式、图表、数据透视表、宏**不会保留**。
- ❌ 不合并样式：合并/清洗后的文件用基础格式（表头加粗、冻结首行），原表的配色、列宽、合并单元格不保留。
- ❌ 不处理 `.xls` 老格式、加密/密码保护的表格；`.xls` 请先另存为 `.xlsx`。
- ❌ `merge` 只处理每个 sheet 的「第一行当表头」，没有表头的纯数据表会被当成表头；
  多级表头、合并单元格表头不做特殊识别。
- ❌ 不做透视、不做分组统计、不做跨表公式、不做数据校验（如身份证/手机号格式）。
- ❌ `clean` 的「重复行」是整行完全一致（trim 后）才算重复；只按某一列去重需要自己筛。
- ✅ 全部在本机由 openpyxl 处理，不联网、不上传表格。

## 安装

```bash
dsh plugin --profile web add @deepwhale-cn/dsh-xlsx-batch
```

运行依赖本机的 **python3 + openpyxl**（插件不会替你装）。缺依赖时 CLI 会直接打印安装命令：

```bash
python3 -m pip install openpyxl
# macOS 没有 python3 时
brew install python3
```

## 用法

```bash
dsh-xlsx-batch --help
dsh-xlsx-batch --demo        # 自造样例文件跑完整流程，打印产物路径
dsh-xlsx-batch <action> --input <文件或目录> [--out <目录>] [--json]
```

`--demo` 会在系统临时目录里造样例工作簿并依次跑 merge / clean / summary / csv，
不动你的任何文件，跑完直接看产物路径就知道它能干什么。

## License

MIT © 温州深鲸智能科技有限公司
