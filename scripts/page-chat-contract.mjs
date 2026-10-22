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

const renderSource = content.match(/  function renderMessageBody\(body, message\) \{[\s\S]*?\n  \}/)[0];
const manifest = JSON.parse(fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
for (const library of ["vendor/markdown/marked.umd.js", "vendor/markdown/purify.min.js"]) {
  const scripts = manifest.content_scripts[0].js;
  assert(scripts.indexOf(library) >= 0 && scripts.indexOf(library) < scripts.indexOf("app/content/content-codex.js"));
}
const rendering = { URL, location: { href: "https://example.com/article" }, console: { warn() {} } };
vm.runInNewContext(fs.readFileSync(new URL("../vendor/markdown/marked.umd.js", import.meta.url), "utf8"), rendering);
vm.runInNewContext(`${renderSource}; this.render = renderMessageBody;`, rendering);
const mockBody = links => ({ textContent: "", innerHTML: "", classList: { add() {} }, querySelectorAll: () => links });
const literal = "**原始文本** <b>不执行</b>";
for (const role of ["user", "error"]) {
  const element = mockBody([]);
  rendering.render(element, { role, text: literal });
  assert.equal(element.textContent, literal);
  assert.equal(element.innerHTML, "");
}
let sanitized = false;
rendering.DOMPurify = { isSupported: true, sanitize(html, options) {
  assert.match(html, /<h2>Title<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<table>/);
  assert.match(html, /<b>HTML<\/b>/);
  assert.match(html, /&lt;script&gt;sample/);
  assert.equal(options.USE_PROFILES.html, true);
  assert.equal(options.SANITIZE_NAMED_PROPS, true);
  for (const tag of ["style", "iframe", "form", "input", "img", "video", "audio"]) assert(options.FORBID_TAGS.includes(tag));
  assert(options.FORBID_ATTR.includes("style"));
  sanitized = true;
  return "<p>Sanitized output</p>";
} };
const links = ["https://example.com/source", "javascript:alert(1)", "http://[invalid"].map(href => ({
  getAttribute: () => href, removeAttribute(name) { this.removed = name; }
}));
const richBody = mockBody(links);
const answer = "## Title\n\n**bold**\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n<b>HTML</b>\n\n```html\n<script>sample</script>\n```";
rendering.render(richBody, { role: "assistant", text: answer });
assert(sanitized);
assert.equal(richBody.innerHTML, "<p>Sanitized output</p>", "Only sanitized markup may reach innerHTML");
assert.equal(links[0].target, "_blank");
assert.equal(links[0].rel, "noopener noreferrer");
for (const link of links.slice(1)) assert.equal(link.removed, "href");
for (const purifier of [undefined, { isSupported: false }, { isSupported: true, sanitize() { throw new Error("failure"); } }]) {
  rendering.DOMPurify = purifier;
  const fallback = mockBody([]);
  rendering.render(fallback, { role: "assistant", text: answer });
  assert.equal(fallback.textContent, answer, "Rich-text failure must preserve the complete answer");
}

rendering.DOMPurify = { isSupported: true, sanitize: html => html };
for (const [input, expected] of [
  ["**核心立场（两句话）： **薄编排器", "<strong>核心立场（两句话）：</strong> 薄编排器"],
  ["**核心立场（两句话）：**薄编排器", "<strong>核心立场（两句话）：</strong>薄编排器"],
  ["**分析推断：**使用方希望减少等待", "<strong>分析推断：</strong>使用方希望减少等待"],
  ["**中文（两句）**正文", "<strong>中文（两句）</strong>正文"],
  ["前缀 ** 分析推断： **正文", "前缀  <strong>分析推断：</strong> 正文"],
  ["**支持 *嵌套强调*： **正文", "<strong>支持 <em>嵌套强调</em>：</strong> 正文"],
  ["**正常加粗**", "<strong>正常加粗</strong>"],
  ["`**代码： **`", "<code>**代码： **</code>"],
  ["```md\n**代码： **\n```", "<code class=\"language-md\">**代码： **\n</code>"],
  ["~~~md\n**代码： **\n~~~", "<code class=\"language-md\">**代码： **\n</code>"],
  ["    **代码： **", "<code>**代码： **\n</code>"],
  ["<code>**代码： **</code>", "<code>**代码： **</code>"],
  ["<code>**代码：**正文</code>", "<code>**代码：**正文</code>"],
  ["\\*\\*文字： \\*\\*", "**文字： **"],
  ["**跨行\n不修复 **", "**跨行\n不修复 **"],
  ["**未闭合", "**未闭合"]
]) {
  const body = mockBody([]);
  const message = { role: "assistant", text: input };
  rendering.render(body, message);
  assert(body.innerHTML.includes(expected), `Unexpected emphasis rendering: ${input}\n${body.innerHTML}`);
  assert.equal(message.text, input, "Rendering must not change stored source text");
}

console.log("页面 Codex 会话、观点快捷入口及安全富文本契约验证通过");
