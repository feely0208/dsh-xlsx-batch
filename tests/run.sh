#!/bin/bash
# @deepwhale-cn/dsh-xlsx-batch · 双向验证
# 正例：用 openpyxl 现场造 xlsx，跑 merge/clean/summary/csv，
#       逐项断言产物存在且行数/数值确实对；反例：坏输入必须非 0 退出并说明原因。
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")/.."

PASS=0; FAIL=0
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
check(){ # check <描述> <命令...>
  local desc="$1"; shift
  if "$@" >/dev/null 2>"$TMP/last_err"; then ok "$desc"
  else bad "$desc"; sed -n '1,3p' "$TMP/last_err" | sed 's/^/       /'; fi
}
say(){ echo ""; echo "  【$1】"; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/dsh-xlsx-batch-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
FIX="$TMP/输入"
OUT="$TMP/输出"
mkdir -p "$FIX"

echo ""; echo "  @deepwhale-cn/dsh-xlsx-batch · 双向验证"
echo "  ────────────────────────────────────────────────────────"

# ── 造正例样本（openpyxl，不依赖手工二进制） ──────────────────────
python3 - "$FIX" <<'PY' || { echo "  ❌ 造样例失败"; exit 1; }
import sys
from openpyxl import Workbook
root = sys.argv[1]

def book(name, sheets):
    wb = Workbook()
    wb.remove(wb.active)
    for title, rows in sheets:
        ws = wb.create_sheet(title=title)
        for row in rows:
            ws.append(row)
    wb.save(root + "/" + name)

# 故意混入：空行、重复行、前后空格、字符串数字；两本表列顺序不同
book("book1.xlsx", [
    ("销售", [
        ["姓名", "部门", "金额"],
        ["张三", " 销售部 ", "100"],
        ["李四", "销售部", "200"],
        [None, None, None],
        ["张三", " 销售部 ", "100"],
    ]),
    ("库存", [["品名", "数量"], ["A", 5], ["B", 7]]),
])
book("book2.xlsx", [
    ("销售", [["部门", "姓名", "金额"], ["市场部", "王五", "300"]]),
    ("备注", [["说明"], ["样例数据"]]),
])
PY

BEFORE=$(shasum -a 256 "$FIX"/*.xlsx | shasum -a 256)
say "CLI 形态"
node bin/cli.mjs --help >"$TMP/help.txt" 2>&1 && ok "--help 退出 0" || bad "--help 退出非 0"
grep -q "子命令" "$TMP/help.txt" && ok "--help 列出子命令" || bad "--help 缺少子命令列表"
grep -q "openpyxl" "$TMP/help.txt" && ok "--help 说明 python 依赖" || bad "--help 未说明依赖"
node bin/cli.mjs >/dev/null 2>&1 && ok "无参数时打印 help 且退出 0" || bad "无参数未退出 0"
node bin/cli.mjs merge --input "$FIX" --bogus >/dev/null 2>&1; [ $? -ne 0 ] && ok "未知参数非 0 退出" || bad "未知参数仍成功"
DEP=$(python3 -S lib/xlsx_tool.py merge '{}' 2>&1); RC=$?
[ $RC -eq 3 ] && ok "缺 openpyxl 依赖时退出码 3" || bad "缺依赖退出码应为 3，实际 $RC"
echo "$DEP" | grep -q "pip install openpyxl" && ok "缺依赖明确提示安装命令（不静默）" || bad "缺依赖没有安装提示"

say "正例 · merge 多文件/多 sheet 合并（加来源列）"
node bin/cli.mjs merge --input "$FIX" --out "$OUT/合并" --json >"$TMP/merge.json" 2>&1
RC=$?
[ $RC -eq 0 ] && ok "merge 退出 0" || bad "merge 退出 $RC"
cat > "$TMP/check_merge.py" <<'PY'
import glob, json, os, sys
from openpyxl import load_workbook
out, json_path = sys.argv[1], sys.argv[2]
data = json.load(open(json_path, encoding="utf-8"))
assert data.get("ok") is True, data
files = glob.glob(os.path.join(out, "*.xlsx"))
assert len(files) == 1, "期望 1 个合并文件，实际 %d" % len(files)
wb = load_workbook(files[0], data_only=True)
ws = wb["合并"]
rows = [list(r) for r in ws.iter_rows(values_only=True)]
header = rows[0]
assert header[0] == "来源文件" and header[1] == "来源工作表", "缺来源列: %r" % (header,)
for name in ("姓名", "部门", "金额", "品名", "数量", "说明"):
    assert name in header, "合并表头缺列: " + name
body = rows[1:]
assert len(body) == 7, "期望 7 行数据（跳过空行），实际 %d" % len(body)
# 列顺序不同的 sheet 必须按表头映射，而不是按位置硬拼
idx = {name: i for i, name in enumerate(header)}
wang = [r for r in body if r[idx["姓名"]] == "王五"]
assert len(wang) == 1, "没找到王五行"
assert wang[0][idx["部门"]] == "市场部", "列映射错了: %r" % (wang[0],)
assert wang[0][idx["金额"]] == "300", "金额映射错了"
assert wang[0][0] == "book2.xlsx" and wang[0][1] == "销售", "来源列不对"
assert sum(1 for r in body if r[0] == "book1.xlsx") == 5, "book1 来源行数不对"
PY
check "合并 8 行、来源列正确、列顺序不同也能按表头映射" python3 "$TMP/check_merge.py" "$OUT/合并" "$TMP/merge.json"

AFTER=$(shasum -a 256 "$FIX"/*.xlsx | shasum -a 256)
[ "$BEFORE" = "$AFTER" ] && ok "输入文件未被修改（sha256 一致）" || bad "输入文件被修改了"

say "正例 · clean 删空行 / 去重 / trim"
node bin/cli.mjs clean --input "$FIX" --out "$OUT/清洗" --json >"$TMP/clean.json" 2>&1
RC=$?
[ $RC -eq 0 ] && ok "clean 退出 0" || bad "clean 退出 $RC"
cat > "$TMP/check_clean.py" <<'PY'
import glob, json, os, sys
from openpyxl import load_workbook
out, json_path = sys.argv[1], sys.argv[2]
data = json.load(open(json_path, encoding="utf-8"))
assert data.get("ok") is True, data
by_name = {f["input_name"]: f for f in data["files"]}
assert by_name["book1.xlsx"]["empty_removed"] == 1, "空行没删掉"
assert by_name["book1.xlsx"]["duplicates_removed"] == 1, "重复行没去掉"
assert by_name["book1.xlsx"]["cells_trimmed"] >= 2, "前后空格没 trim"
files = sorted(glob.glob(os.path.join(out, "*.xlsx")))
assert len(files) == 2, "期望 2 个清洗结果，实际 %d" % len(files)
wb = load_workbook(os.path.join(out, "book1.xlsx"), data_only=True)
rows = [list(r) for r in wb["销售"].iter_rows(values_only=True)]
assert len(rows) == 3, "清洗后应为表头+2 行，实际 %d" % len(rows)
assert rows[0] == ["姓名", "部门", "金额"], "表头不对: %r" % (rows[0],)
assert rows[1][1] == "销售部", "文本没 trim: %r" % (rows[1],)
names = [r[0] for r in rows[1:]]
assert names.count("张三") == 1, "重复行没去掉: %r" % names
assert set(wb.sheetnames) == {"销售", "库存"}, "sheet 没保留: %r" % wb.sheetnames
PY
check "清洗后空行/重复行消失、文本已 trim、sheet 保留" python3 "$TMP/check_clean.py" "$OUT/清洗" "$TMP/clean.json"

say "正例 · summary 非空计数 / 数值列求和"
node bin/cli.mjs summary --input "$FIX" --out "$OUT/汇总" --json >"$TMP/summary.json" 2>&1
RC=$?
[ $RC -eq 0 ] && ok "summary 退出 0" || bad "summary 退出 $RC"
cat > "$TMP/check_summary.py" <<'PY'
import glob, json, os, sys
from openpyxl import load_workbook
out, json_path = sys.argv[1], sys.argv[2]
data = json.load(open(json_path, encoding="utf-8"))
assert data.get("ok") is True, data
files = glob.glob(os.path.join(out, "*.xlsx"))
assert len(files) == 1, "期望 1 个汇总文件"
wb = load_workbook(files[0], data_only=True)
ws = wb["汇总"]
rows = [list(r) for r in ws.iter_rows(values_only=True)]
header = rows[0]
assert header == ["文件", "工作表", "列名", "非空计数", "数值个数", "求和"], header
def find(file_name, sheet, col):
    for r in rows[1:]:
        if r[0] == file_name and r[1] == sheet and r[2] == col:
            return r
    raise AssertionError("没找到汇总行: %s/%s/%s" % (file_name, sheet, col))
amount = find("book1.xlsx", "销售", "金额")
assert amount[3] == 3, "金额非空计数错: %r" % (amount,)
assert amount[4] == 3, "金额数值个数错: %r" % (amount,)
assert abs(float(amount[5]) - 400) < 1e-9, "金额求和对不上: %r" % (amount,)
name = find("book1.xlsx", "销售", "姓名")
assert name[3] == 3, "姓名非空计数错: %r" % (name,)
qty = find("book1.xlsx", "库存", "数量")
assert abs(float(qty[5]) - 12) < 1e-9, "数量求和错: %r" % (qty,)
PY
check "汇总报告：金额非空 3 / 求和 400，数量求和 12" python3 "$TMP/check_summary.py" "$OUT/汇总" "$TMP/summary.json"

say "正例 · csv 每个 sheet 导出"
node bin/cli.mjs csv --input "$FIX" --out "$OUT/csv" --json >"$TMP/csv.json" 2>&1
RC=$?
[ $RC -eq 0 ] && ok "csv 退出 0" || bad "csv 退出 $RC"
cat > "$TMP/check_csv.py" <<'PY'
import glob, json, os, sys
out, json_path = sys.argv[1], sys.argv[2]
data = json.load(open(json_path, encoding="utf-8"))
assert data.get("ok") is True, data
files = sorted(glob.glob(os.path.join(out, "*.csv")))
assert len(files) == 4, "4 个 sheet 应导出 4 个 CSV，实际 %d" % len(files)
inv = os.path.join(out, "book1__库存.csv")
assert os.path.exists(inv), "缺库存 CSV: %r" % files
lines = open(inv, encoding="utf-8-sig").read().splitlines()
assert len(lines) == 3, "库存 CSV 应为表头+2 行，实际 %d" % len(lines)
assert lines[0] == "品名,数量", "CSV 表头不对: %r" % lines[0]
sales = os.path.join(out, "book1__销售.csv")
assert os.path.exists(sales), "缺销售 CSV"
slines = open(sales, encoding="utf-8-sig").read().splitlines()
assert len(slines) == 5, "销售 CSV 应为表头+4 行，实际 %d" % len(slines)
assert sum(1 for line in slines if "张三" in line) == 2
# UTF-8 BOM：Excel 双击打开不乱码
raw = open(sales, "rb").read(3)
assert raw == b"\xef\xbb\xbf", "CSV 缺少 UTF-8 BOM"
PY
check "4 个 CSV，行数正确、UTF-8 BOM 存在" python3 "$TMP/check_csv.py" "$OUT/csv" "$TMP/csv.json"

say "正例 · 不覆盖同名产物 & 默认输出目录"
node bin/cli.mjs merge --input "$FIX" --out "$OUT/合并" >/dev/null 2>&1
[ -f "$OUT/合并/merged.xlsx" ] && [ -f "$OUT/合并/merged_1.xlsx" ] \
  && ok "同名产物自动加序号（merged_1.xlsx）" || bad "同名产物被覆盖或未加序号"
mkdir -p "$TMP/默认目录" && cp "$FIX/book1.xlsx" "$TMP/默认目录/"
node bin/cli.mjs csv --input "$TMP/默认目录" >/dev/null 2>&1
[ -f "$TMP/默认目录/_输出/book1__销售.csv" ] && ok "未给 --out 时默认写到 <输入目录>/_输出" || bad "默认输出目录不对"
node bin/cli.mjs clean --input "$FIX/book1.xlsx" --out "$TMP/单文件" >/dev/null 2>&1
[ -f "$TMP/单文件/book1.xlsx" ] && ok "支持单个 .xlsx 输入" || bad "单文件输入失败"

say "正例 · --demo 自造样例跑完整流程"
node bin/cli.mjs --demo --json >"$TMP/demo.json" 2>&1
RC=$?
[ $RC -eq 0 ] && ok "--demo 退出 0" || bad "--demo 退出 $RC"
cat > "$TMP/check_demo.py" <<'PY'
import json, os, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
assert data.get("ok") is True and data.get("action") == "demo", data
assert len(data.get("steps", [])) == 4, "演示步骤不足 4 个"
arts = data.get("artifacts", [])
assert len(arts) >= 6, "演示产物不足: %d" % len(arts)
for path in arts:
    assert os.path.exists(path), "演示产物不存在: " + path
print(data["demoRoot"])
PY
DROOT=$(python3 "$TMP/check_demo.py" "$TMP/demo.json" 2>"$TMP/last_err")
[ $? -eq 0 ] && ok "4 个动作全跑通，产物均真实存在" || bad "demo 产物校验失败"
[ -n "${DROOT:-}" ] && rm -rf "$DROOT"

say "反例 · 坏输入必须非 0 退出并说明缺什么"
NEG=$(node bin/cli.mjs merge --input "$TMP/根本不存在" 2>&1); RC=$?
[ $RC -ne 0 ] && ok "不存在的输入 → 非 0 退出（$RC）" || bad "不存在的输入仍退出 0"
echo "$NEG" | grep -q "不存在" && ok "提示「输入不存在」" || bad "缺少错误提示：$NEG"
mkdir -p "$TMP/空目录"
NEG=$(node bin/cli.mjs summary --input "$TMP/空目录" 2>&1); RC=$?
[ $RC -ne 0 ] && ok "空目录 → 非 0 退出（$RC）" || bad "空目录仍退出 0"
echo "$NEG" | grep -q "没有 .xlsx" && ok "提示「目录里没有 .xlsx」" || bad "空目录提示不对：$NEG"
NEG=$(node bin/cli.mjs nosuch --input "$FIX" 2>&1); RC=$?
[ $RC -ne 0 ] && ok "未知子命令 → 非 0 退出（$RC）" || bad "未知子命令仍退出 0"
echo "$NEG" | grep -q "未知子命令" && ok "提示「未知子命令」" || bad "未知子命令提示不对"
NEG=$(node bin/cli.mjs clean 2>&1); RC=$?
[ $RC -ne 0 ] && ok "缺 --input → 非 0 退出（$RC）" || bad "缺 --input 仍退出 0"
node bin/cli.mjs clean --input "$TMP/根本不存在" --json >"$TMP/err.json" 2>&1; RC=$?
[ $RC -ne 0 ] && ok "--json 模式下错误也非 0 退出" || bad "--json 错误仍退出 0"
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); assert d['ok'] is False and d['message']" "$TMP/err.json" \
  >/dev/null 2>"$TMP/last_err" && ok "--json 错误输出可解析且含 message" || bad "--json 错误输出不可解析"

echo ""
echo "  ────────────────────────────────────────────────────────"
echo "  通过 $PASS · 失败 $FAIL"
echo ""
[ "$FAIL" -eq 0 ] || exit 1
