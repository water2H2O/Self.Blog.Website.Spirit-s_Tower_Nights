# 素材库整理：把沙箱挡住的几件事做完（删除 / 改名）
#
# 为什么要有这一支：AI 在受限制的沙箱里只能「复制」、不能「删除或改名」，
# 所以下面这些动作只能由你自己执行。脚本是**幂等**的 —— 跑几次都行，
# 已经做完的会跳过，不会误删。
#
# 用法（在本仓库根目录）：
#     pwsh -File tools\整理素材库.ps1
#
# 做四件事：
#   1. 删掉 _上传 里两份已经处理完的稿子（它们已归档到 D:\vibe coding\.dsh-cache\oc\上传归档\）
#   2. 清掉 Word 没正常关闭留下的 ~$*.docx 锁文件
#   3. 「地理」文件夹改名为「地域」（站上分类已统一成「地域」）
#   4. 列出几个可选手工项

$ErrorActionPreference = 'Continue'
$ws = "C:\Users\water2H2O\Desktop\oc相关\【原创&本家】水塔夜谈"
$archive = "D:\vibe coding\.dsh-cache\oc\上传归档"

if (-not (Test-Path -LiteralPath $ws)) {
	Write-Host "找不到工作目录：$ws" -ForegroundColor Red
	exit 1
}

Write-Host "=== 1) 清理 _上传（已处理的稿子）===" -ForegroundColor Cyan
$uploads = Join-Path $ws '_上传'
if (Test-Path -LiteralPath $uploads) {
	$files = Get-ChildItem -LiteralPath $uploads -File
	if ($files.Count -eq 0) {
		Write-Host "  已经是空的" -ForegroundColor Green
	}
	foreach ($f in $files) {
		$archived = Join-Path $archive $f.Name
		if (Test-Path -LiteralPath $archived) {
			try {
				Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop
				Write-Host "  已删 $($f.Name)（归档在 $archive）" -ForegroundColor Green
			} catch {
				Write-Host "  删不掉 $($f.Name)：$($_.Exception.Message)" -ForegroundColor Yellow
			}
		} else {
			Write-Host "  跳过 $($f.Name)：归档里没有这一份，先别删" -ForegroundColor Yellow
		}
	}
} else {
	Write-Host "  （没有 _上传 目录）"
}

Write-Host ""
Write-Host "=== 2) 清 Word 临时锁文件（~`$*.docx）===" -ForegroundColor Cyan
$locks = @(Get-ChildItem -LiteralPath $ws -Recurse -Force -File -Filter '~$*' -ErrorAction SilentlyContinue)
if ($locks.Count -eq 0) {
	Write-Host "  没有需要清理的" -ForegroundColor Green
} else {
	$ok = 0
	foreach ($f in $locks) {
		try {
			Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop
			$ok++
			Write-Host "  已删 $($f.FullName.Replace($ws, ''))" -ForegroundColor Green
		} catch {
			Write-Host "  删不掉 $($f.Name)：可能这个文档正开着，关掉 Word 再跑一次" -ForegroundColor Yellow
		}
	}
	Write-Host "  共处理 $ok / $($locks.Count)"
}

Write-Host ""
Write-Host "=== 3) 「地理」改名为「地域」===" -ForegroundColor Cyan
$renames = @(
	(Join-Path $ws '地理'),
	(Join-Path $ws '_settings-repo-stage\设定\地理')
)
foreach ($old in $renames) {
	if (-not (Test-Path -LiteralPath $old)) {
		Write-Host "  跳过（不存在，可能已改过）：$($old.Replace($ws, ''))" -ForegroundColor DarkGray
		continue
	}
	$new = Join-Path (Split-Path $old -Parent) '地域'
	if (Test-Path -LiteralPath $new) {
		Write-Host "  跳过（地域 已存在）：$($new.Replace($ws, ''))" -ForegroundColor Yellow
		continue
	}
	try {
		Rename-Item -LiteralPath $old -NewName '地域' -ErrorAction Stop
		Write-Host "  已改名：$($old.Replace($ws, '')) → 地域" -ForegroundColor Green
	} catch {
		Write-Host "  改名失败：$($_.Exception.Message)" -ForegroundColor Yellow
	}
}

Write-Host ""
Write-Host "=== 4) 可选手工项（脚本不代做）===" -ForegroundColor Cyan
Write-Host "  · 桌面\【已归档】【企划】水塔OC补完计划\成品 里的原图很大（风汐铃月.png 29MB 等），"
Write-Host "    站上用的已是压缩版；原图留作存档即可，不必再压。"
Write-Host "  · 图池里有 7 位只露过脸、还没档案的子（北音 / 温雪 / 霜霖星 / 香菇 / 鹤戾 / 白血尘 / 苯胺），"
Write-Host "    按之前的口径留在「补完计划」里；哪天想让他们进签筒，把设定发来即可。"
Write-Host "  · 蔚蓝还没有立绘（站上已标 #NO INFO），想补时把图放进她的档案文件夹。"
Write-Host ""
Write-Host "完成。" -ForegroundColor Green
