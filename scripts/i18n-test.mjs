import assert from "node:assert/strict";
import vm from "node:vm";
import { readdirSync } from "node:fs";
import path from "node:path";
import { readSource } from "./source-utils.mjs";
import { createTaskPrompts } from "../native-host/task-prompts.mjs";
import { collaborationLandingPage, collaborationBoardPage } from "../native-host/collaboration-page.mjs";

async function runtime(stored = {}, databases = [], failWrite = false, worker = false, website = false) {
  const listeners = [];
  const context = vm.createContext({ console, document: worker ? undefined : {},
    location: { protocol: website ? "https:" : "chrome-extension:" },
    indexedDB: { databases: async () => { assert.equal(website, false, "must not read website databases"); return databases; } },
    chrome: { runtime: { sendMessage: async message => {
      assert.equal(message.type, "shizuo-language-get");
      return { language: "zh-CN" };
    } }, storage: { local: {
      get: async () => ({ ...stored }),
      set: async value => { if (failWrite) throw new Error("Storage unavailable"); Object.assign(stored, value); }
    }, onChanged: { addListener: callback => listeners.push(callback) } } }
  });
  for (const file of ["i18n-en.js", "i18n-en-extended.js", "i18n.js"]) vm.runInContext(readSource(`app/core/${file}`), context);
  await context.ShizuoI18n.ready;
  return { context, api: context.ShizuoI18n, stored, listeners };
}

const fresh = await runtime();
assert.equal(fresh.api.language, "en");
assert.equal(fresh.stored[fresh.api.KEY], "en");
assert.equal(fresh.api.t("ContextSail"), "ContextSail");
assert.equal(fresh.api.t("发送"), "Send");
const userText = "发送 <img src=x onerror=alert(1)> {1} $&";
assert.equal(fresh.api.t("来源：{0}", userText), `Source: ${userText}`, "interpolation must preserve user content exactly without recursive translation");
assert.equal(fresh.api.t(userText), userText);
assert.equal(fresh.api.feedback("请求执行失败：最多可同时执行 3 个本地 AI 任务"), "Request failed: Up to 3 local AI tasks can run at once");
assert.equal(fresh.api.feedback("AGY 正在生成回答"), "AGY is generating an answer");
assert.equal(fresh.api.feedback("Codex 执行失败：用户原始内容\n<img> $& {0}"), "Codex failed: 用户原始内容\n<img> $& {0}");
assert.equal(fresh.api.feedback("视频任务在“HyperFrames 渲染”阶段超过 24 小时，已自动停止"), "Video stage “Rendering HyperFrames video” exceeded 24 hours and was stopped automatically");
assert.equal(fresh.api.feedback("Codex 执行失败（退出码 1）\n失败工程已保留：/tmp/中文工程"), "Codex failed (exit code 1)\nFailed project preserved: /tmp/中文工程");
assert.equal(fresh.api.feedback(userText), userText);
assert.doesNotMatch(readSource("README.md"), /\p{Script=Han}/u, "README.md must be entirely English");
for (const [source, translated] of Object.entries(fresh.context.ShizuoEnglish)) {
  const slots = text => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  assert.deepEqual(slots(translated), slots(source), `Placeholder mismatch: ${source}`);
  assert.doesNotMatch(translated, /\p{Script=Han}/u, `Untranslated English message: ${source}`);
}
assert.equal((await runtime({}, [{ name: "pagedock" }])).api.language, "zh-CN");
assert.equal((await runtime({ __whiteboard_state__: {} })).api.language, "zh-CN");
assert.equal((await runtime({ __pagedock_ai_runtime_v1__: "codex" })).api.language, "zh-CN");
assert.equal((await runtime({ [fresh.api.KEY]: "en" }, [{ name: "pagedock" }])).api.language, "en");
assert.equal((await runtime({ [fresh.api.KEY]: "invalid" })).api.language, "en");
await fresh.api.setLanguage("zh-CN");
assert.equal(fresh.api.language, "en", "an active page must not reload or change language halfway through a task");
const reopened = await runtime(fresh.stored);
assert.equal(reopened.api.t("发送"), "发送");
assert.equal(reopened.api.feedback("AGY 正在生成回答"), "AGY 正在生成回答");
await reopened.api.setLanguage("en");
assert.equal((await runtime(reopened.stored)).api.language, "en");
await assert.rejects(() => fresh.api.setLanguage("fr"), /Unsupported/);
const failure = await runtime({ [fresh.api.KEY]: "en" }, [], true);
await assert.rejects(() => failure.api.setLanguage("zh-CN"), /Storage unavailable/);
assert.equal(failure.api.language, "en");
const worker = await runtime({ [fresh.api.KEY]: "en" }, [], false, true);
worker.listeners[0]({ [fresh.api.KEY]: { newValue: "zh-CN" } }, "local");
assert.equal(worker.api.t("发送"), "发送");
const contentScript = await runtime({}, [], false, false, true);
assert.equal(contentScript.api.language, "zh-CN", "website scripts must use the worker's migration decision");
assert.equal(contentScript.stored[contentScript.api.KEY], undefined, "website scripts must not overwrite language migration");

const pageSource = readSource("app/core/i18n-page.js");
assert.doesNotMatch(pageSource, /MutationObserver|location\.reload|innerHTML\s*=/);
assert.match(pageSource, /script, style, textarea, \[contenteditable\]/);
assert.match(readSource("app/core/pagedock-db.js"), /ShizuoI18n\.ready\.then\(openDatabaseReady\)/, "database creation must wait until migration finishes");
const manifest = JSON.parse(readSource("manifest.json"));
assert.equal(manifest.name, "ContextSail");
assert.equal(manifest.content_scripts[0].js.at(-1), "app/content/content-codex.js");
function checkShell(html) {
  const shell = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, "");
  for (const match of shell.matchAll(/>([^<>]+)</g)) {
    const text = match[1].trim();
    if (!/\p{Script=Han}/u.test(text) || ["简体中文", "Language / 语言"].includes(text)) continue;
    assert.ok(Object.hasOwn(fresh.context.ShizuoEnglish, text), `Missing static translation: ${text}`);
  }
  for (const match of shell.matchAll(/(?:title|placeholder|aria-label|alt)="([^"]*)"/g)) {
    const text = match[1];
    if (!/\p{Script=Han}/u.test(text) || text === "Language / 语言") continue;
    assert.ok(Object.hasOwn(fresh.context.ShizuoEnglish, text), `Missing attribute translation: ${text}`);
  }
}
for (const page of ["whiteboard/index", "popup/popup", "sidepanel/sidepanel", "editor/editor", "offscreen/offscreen"]) {
  const html = readSource(`app/pages/${page}.html`);
  assert.match(html, /core\/i18n-page\.js/);
  assert.match(html, /lang="en"/);
  checkShell(html);
}
function checkUiKeys(directory) {
  for (const file of readdirSync(new URL(`../${directory}`, import.meta.url), { withFileTypes: true })) {
    const relative = path.posix.join(directory, file.name);
    if (file.isDirectory()) checkUiKeys(relative);
    else if (file.name.endsWith(".js") && !file.name.startsWith("i18n")) {
      for (const match of readSource(relative).matchAll(/\bui\(("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g)) {
        const key = vm.runInNewContext(match[1]);
        assert.ok(Object.hasOwn(fresh.context.ShizuoEnglish, key), `Missing UI translation in ${relative}: ${key}`);
      }
    }
  }
}
checkUiKeys("app");
checkShell(collaborationLandingPage("test", "test"));
checkShell(collaborationBoardPage({ boardId: "test", nonce: "test" }));
const collaborationSource = readSource("native-host/collaboration-page.mjs");
for (const match of collaborationSource.matchAll(/\bui\("([^"\n]*)"\)/g)) {
  assert.ok(Object.hasOwn(fresh.context.ShizuoEnglish, match[1]), `Missing collaboration translation: ${match[1]}`);
}
assert.match(readSource("native-host/install-macos.sh"), /for dictionary in i18n-en\.js i18n-en-extended\.js/);
assert.match(readSource("app/background/modules/native-bridge.js"), /message\.error = ShizuoI18n\.feedback/);
assert.match(readSource("app/background/modules/native-bridge.js"), /message\.type === "progress".*message\.label = ShizuoI18n\.feedback/);
for (const file of readdirSync(new URL("../native-host", import.meta.url)).filter(file => file.endsWith(".mjs"))) {
  const source = readSource(`native-host/${file}`);
  // Registered native errors and progress labels must translate; prompts and CLI output are not UI.
  for (const match of source.matchAll(/(?:new Error\(|\berror:\s*|\blabel:\s*)"([^"\n]*\p{Script=Han}[^"\n]*)"/gu)) {
    assert.doesNotMatch(fresh.api.feedback(match[1]), /\p{Script=Han}/u, `Untranslated native feedback in ${file}: ${match[1]}`);
  }
  for (const match of source.matchAll(/new Error\(`([^`]*\p{Script=Han}[^`]*)`/gu)) {
    if (/`|\$\{[^}]*$/.test(match[1])) continue; // Nested templates are exercised by explicit feedback cases above.
    const sample = match[1].replace(/\$\{[^}]*\}/g, "1");
    assert.doesNotMatch(fresh.api.feedback(sample), /\p{Script=Han}/u, `Untranslated native error in ${file}: ${sample}`);
  }
  const stages = /VIDEO_STAGE_LABELS = Object\.freeze\((\{[^;]+\})\)/.exec(source);
  if (stages) for (const label of Object.values(vm.runInNewContext(`(${stages[1]})`))) {
    assert.doesNotMatch(fresh.api.feedback(label), /\p{Script=Han}/u, `Untranslated video stage: ${label}`);
  }
}
const prompts = createTaskPrompts({ codingWorkspace: "/tmp" });
for (const name of ["buildAnalysisPrompt", "buildConversationPrompt", "buildCodingPrompt"]) {
  const prompt = prompts[name]({ prompt: "Compare these sources", page: { content: "这是中文资料" } });
  assert.match(prompt, /language of the user's latest question/);
  assert.doesNotMatch(prompt, /请使用中文/);
  assert.match(prompt, /Compare these sources/);
}
console.log("English/Chinese language, migration, interpolation and prompt checks passed");
