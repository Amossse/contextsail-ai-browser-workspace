import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readWhiteboardSource, readWhiteboardStyles } from "./source-utils.mjs";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const html = `${read("app/pages/whiteboard/index.html")}\n${readWhiteboardStyles()}`;
const board = readWhiteboardSource();

assert.match(html, /id="homeToolbar"[\s\S]{0,300}id="openInbox"[\s\S]{0,180}id="newBoard"/, "收件箱与新建白板入口必须位于首页顶栏");
assert.doesNotMatch(html, /id="(?:heroAiName|quickText|quickAdd|homeJourney|inboxLibrary|inboxList)"/, "首页不能再展示介绍、快速收集或重复收件箱卡片");
assert.match(board, /boardNameEl\.readOnly = board\.id === db\.INBOX_ID/, "收件箱名称必须只读，普通白板仍可编辑");
assert.match(board, /boardNameEl\.addEventListener\("change", async \(\) => \{\s*if \(!currentBoard \|\| currentBoard\.id === db\.INBOX_ID\) return;/, "收件箱必须拒绝重命名事件");
assert.match(read("app/core/pagedock-db.js"), /name: board\.id === INBOX_ID \? ui\("收件箱"\)/, "导入与桥接写入也必须保留系统收件箱名称");

assert.match(html, /id="homeMoreMenu"[\s\S]{0,900}AI 与连接[\s\S]{0,400}实验能力[\s\S]{0,300}协作与会话/, "主页高级能力必须渐进披露");
assert.doesNotMatch(html, /id="aiRuntimeMenu"/, "技术型运行时选择不能常驻顶栏");
assert.match(html, /id="healthCheckDialog"[\s\S]{0,900}id="aiRuntimeSelect"[\s\S]{0,500}id="selectionVideoEngine"/, "运行时与视频引擎必须收进 AI 与连接设置");
assert.match(html, /id="exportMenu"[\s\S]{0,1800}画布[\s\S]{0,500}工作流[\s\S]{0,700}数据与恢复[\s\S]{0,500}设置[\s\S]{0,400}实验能力/, "白板更多菜单必须按用户任务分组并弱化实验能力");
assert.doesNotMatch(html, /id="toggleCollaboration"/, "协作面板不能占用常驻顶栏入口");
assert.match(html, /id="askSelectionWithCodex"[^>]*>交给 AI</, "画布主动作不应暴露底层运行时");
assert.match(board, /button\.hidden = button\.dataset\.mode !== "text" && !settingsExpanded/, "图片快捷动作只能在高级设置展开时出现");
assert.match(html, /id="connectionGuideDialog"[\s\S]{0,2600}id="checkConnectionGuide"/, "首次执行未连接时必须有可操作的连接向导");
assert.match(board, /ensureCodexReadyForTask\(\(\) => runBoardCardTask/, "任务创建前必须先检查本地连接，避免产生可避免的失败卡");
["emptyAddTask", "emptyAddText", "emptyAddImage"].forEach(id => assert.match(html, new RegExp(`id="${id}"`), `空白画布必须提供 ${id} 起步动作`));
assert.match(board, /emptyAddText[\s\S]{0,600}addTextItem[\s\S]{0,600}emptyAddTask[\s\S]{0,300}addTaskItem/, "空白画布入口必须真正创建对应卡片");
assert.match(board, /function createRecentItem[\s\S]{0,1400}focusExternalActivity\(\{ boardId: item\.boardId, cardId: item\.id \}\)/, "最近收集必须定位到具体卡片，而不是只打开白板");
assert.match(board, /recentHintEl\.textContent = ui\("快捷入口，点击在所属位置打开"\)/, "最近内容必须明确是入口而不是副本");
assert.match(board, /boardLibraryEl\.hidden = !boards\.length/, "没有普通白板时必须隐藏重复的空白板模块");
assert.doesNotMatch(board, /还没有白板，先新建一个吧/, "首页顶部已有新建入口，不能再展示重复的空白板提示");
assert.match(board, /orchestrate\.textContent = ui\("规划多步任务"\)/, "动态工作流入口必须使用新用户能理解的名称");
assert.match(board, /orchestrate\.hidden = active \|\| failed \|\| item\.taskWorkflowRole === "step" \|\| !settingsExpanded/, "多步工作流必须跟随高级设置渐进披露");
assert.match(html, /id="selectionMoreMenu"[\s\S]{0,500}AI 处理[\s\S]{0,300}提炼知识卡[\s\S]{0,300}整理画布[\s\S]{0,500}连接所选/, "圈选更多菜单必须区分 AI 处理与画布整理");
assert.match(board, /hasConversation \? ui\("与 \{0\} 对话", aiRuntimeLabel\(\)\) : ui\("问问 \{0\}", aiRuntimeLabel\(\)\)/, "空白任务与持续对话必须跟随当前 AI 运行时并保持明确语义");
assert.match(board, /function updateAiRuntimeCopy\(\)[\s\S]{0,500}AI 助手/, "切换本地 AI 不应改变主任务语言");
assert.doesNotMatch(board, /starterLabel\.textContent = "从素材开始"[\s\S]{0,500}\["video", "生成视频"\]/, "实验性视频不能占据素材任务的首屏快捷动作");
assert.match(board, /send\.title = atCapacity[\s\S]{0,220}先输入问题或要完成的任务/, "空任务必须解释发送按钮不可用的原因");

console.log("新用户主路径体验契约验证通过");
