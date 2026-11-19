import fs from "node:fs";
import path from "node:path";

const root = "src/renderer/src";
const uiDirectory = `${path.join(root, "components", "ui")}${path.sep}`;

/**
 * 浮层表面只在 components/ui 内定义：
 * - 菜单/浮层：Popover / Menu / Select
 * - 对话框：Dialog（DIALOG_PANEL）
 * - 大面板/窗口：shadow-float
 */

function walk(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (entry.name.endsWith(".tsx")) result.push(full);
  }
  return result;
}

const violations = [];

for (const file of walk(root)) {
  if (file.startsWith(uiDirectory)) continue
  const relative = file.slice(root.length + 1).replace(/\\/g, "/")
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/)

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    const report = (rule, message) => {
      violations.push({ file: relative, line: lineNumber, rule, message })
    }

    if (/<(select|button|input|textarea)\b/.test(line)) {
      report(
        "native-control",
        "业务代码禁止原生控件；请用 Button / Input / Textarea / NativeSelect"
      )
    }

    const pixelRounds = [...line.matchAll(/rounded-\[(\d+)px\]/g)]
    if (pixelRounds.some((match) => Number(match[1]) > 3)) {
      report(
        "rounding",
        "圆角只用 rounded-md / rounded-card / rounded-panel；1-3px 仅限细线"
      )
    }

    if (/\brounded-(sm|lg|xl|2xl|3xl)\b/.test(line)) {
      report("rounding", "圆角只用 rounded-md / rounded-card / rounded-panel")
    }

    if (
      line.includes("shadow-menu") &&
      /\bbg-surface\b(?!-)/.test(line)
    ) {
      report("popover-surface", "shadow-menu 浮层请用 bg-surface-raised")
    }

    if (/className=.*#[0-9a-fA-F]{6}/.test(line)) {
      report("hex-color", "className 里禁止硬编码色值，请用 tokens")
    }

    if (
      line.includes("fixed inset-0") &&
      (line.includes("bg-black/") || line.includes("bg-[color-mix"))
    ) {
      report("overlay", "遮罩统一用 bg-overlay，禁止自调遮罩色")
    }

    if (line.includes("shadow-menu")) {
      report(
        "self-made-popover",
        "浮层请用 Popover / Menu / Dialog；不要自建 shadow-menu"
      )
    }
  })
}

if (violations.length === 0) {
  console.log(
    `[check-ui] 通过：${walk(root).length - walk(uiDirectory).length} 个业务 tsx，无违规`
  )
  process.exit(0)
}

console.error(`[check-ui] 发现 ${violations.length} 处违规：`)
for (const violation of violations) {
  console.error(
    `- ${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`
  )
}
process.exit(1)
