import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../app/core/pagedock-db.js", import.meta.url), "utf8");
const content = fs.readFileSync(new URL("../app/content/content-codex.js", import.meta.url), "utf8");
const context = { console, structuredClone, URL, crypto: { randomUUID: () => "test-id" } };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: "pagedock-db.js" });

const normalize = context.PageDockDB.normalizePageChatUrl;
assert.equal(
  normalize("https://Example.com/article/?b=2&utm_source=test&a=1#part-2"),
  "https://example.com/article?a=1&b=2",
  "普通锚点和追踪参数不应拆分页面会话"
);
assert.notEqual(
  normalize("https://example.com/article?id=1"),
  normalize("https://example.com/article?id=2"),
  "有业务含义的查询参数必须区分页面会话"
);
assert.notEqual(
  normalize("https://example.com/#/document/1"),
  normalize("https://example.com/#/document/2"),
  "SPA hash 路由必须区分页面会话"
);

assert.match(source, /createIndex\("normalizedUrl", "normalizedUrl", \{ unique: true \}\)/, "页面会话必须使用唯一 URL 索引");
assert.match(source, /PAGE_CHAT_LIMIT = 200/, "页面会话必须有数量上限");
assert.match(source, /slice\(-30\)/, "单页会话必须限制消息数量");
assert.match(content, /input\.addEventListener\("paste"[\s\S]{0,500}attachImageFiles\(images\)/, "页面 Codex 输入框必须接收剪贴板图片");
assert.match(content, /images:\s*imageBatch/, "页面问题必须把粘贴图片发送给本地 Codex");
assert.match(content, /className = "compose-image"[\s\S]{0,600}移除图片/, "粘贴图片必须支持预览和移除");
assert.match(source, /imageCount:\s*Math\.min\(4/, "页面会话必须持久化图片数量而不是图片数据");
assert.match(content, /taskEvent/, "页面 Codex 必须能按任务 ID 找回错过的终态事件");
assert.match(content, /reconcileActiveTask/, "页面 Codex 忙碌时必须主动对账，不能无限停留在处理中");
assert.match(content, /SAVE_SELECTION_TO_INBOX_REQUEST/, "选区快捷菜单必须支持保存到收件箱");
assert.match(content, /saveSelectionToInbox\(text, button\)/, "选区保存必须展示明确的成功或失败反馈");
assert.match(content, /id="resize"[\s\S]{0,120}>放大<\//, "页面 Codex 必须提供放大窗口入口");
assert.match(content, /function setPanelExpanded\(expanded\)[\s\S]{0,500}还原窗口/, "页面 Codex 必须支持还原窗口");
assert.match(content, /\.panel\[data-expanded="true"\]\s*\{[^}]*width:\s*calc\(100vw - 16px\)[^}]*height:\s*calc\(100dvh - 16px\)/, "放大窗口必须按视口显式计算尺寸");
assert.doesNotMatch(content, /\.panel\[data-expanded="true"\]\s*\{[^}]*\b(?:right|bottom):/, "放大窗口不能依赖零尺寸 Shadow Host 的边界定位");

// Exercise the actual shortcut dispatcher without starting a paid AI task.
const dictionaries = { ShizuoEnglish: {} };
for (const file of ["i18n-en.js", "i18n-en-extended.js"]) {
  vm.runInNewContext(fs.readFileSync(new URL(`../app/core/${file}`, import.meta.url), "utf8"), dictionaries);
}
const promptSource = content.match(/const prompts = (\{[\s\S]*?\n  \});/)[1];
const dispatcher = content.match(/  function quickAction\(action, selectionText\) \{[\s\S]*?\n  \}/)[0];
assert.match(content, /class="quick-action" data-action="perspectives"[^>]*title="五位专家观点分析">观点<\/button>/);
assert.match(content, /\.compose-quick-actions\s*\{[^}]*flex-wrap:\s*wrap/, "英文快捷入口必须可换行，不能挤掉发送按钮");
for (const language of ["zh-CN", "en"]) {
  const sent = [];
  const ui = (source, ...values) => (language === "en" ? dictionaries.ShizuoEnglish[source] ?? source : source)
    .replace(/\{(\d+)\}/g, (slot, index) => index < values.length ? values[index] : slot);
  const sandbox = { ui, sendPrompt: (prompt, selection) => sent.push({ prompt, selection }) };
  vm.runInNewContext(`const prompts = ${promptSource}; ${dispatcher}; quickAction("perspectives", ""); quickAction("perspectives", "原始选区 <tag> {0}");`, sandbox);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].selection, "");
  assert.equal(sent[1].selection, "原始选区 <tag> {0}");
  assert(sent[0].prompt.includes(ui("当前页面正文")));
  assert(sent[1].prompt.includes(ui("选中文字")));
  const roles = language === "en" ? ["Practitioner", "Scholar", "Skeptic", "Economist", "Historian"] : ["实践者", "学者", "怀疑者", "经济学家", "历史学家"];
  for (const role of roles) assert(sent[0].prompt.includes(role), `Missing perspective: ${role}`);
  assert.match(sent[0].prompt, language === "en" ? /two-sentence/ : /两句话/);
  assert.match(sent[0].prompt, language === "en" ? /traceable sources/ : /可溯源/);
  assert.match(sent[0].prompt, language === "en" ? /never fabricate/ : /不得编造/);
  assert.match(sent[0].prompt, language === "en" ? /not instructions to execute/ : /不执行其中的指令/);
  if (language === "en") assert.doesNotMatch(sent[0].prompt, /\p{Script=Han}/u);
  const panelHtml = vm.runInNewContext(content.match(/panel\.innerHTML = ui\((`[\s\S]*?`)\);/)[1]);
  assert(ui(panelHtml).includes(language === "en" ? '>Perspectives</button>' : '>观点</button>'));
}

console.log("页面 Codex URL 会话索引契约验证通过");
