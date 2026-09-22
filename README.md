# vue3renderer

把 `.vue` 单文件组件或网页渲染成 PNG 截图。

- **两种来源**：`.vue` 文件（SFC 在内存中 SSR 编译，不产生中间 HTML 文件）或任意网址
- **常驻浏览器**：首次截图懒启动，之后所有请求复用同一实例，省掉每次 1–2 秒的冷启动
- **并发控制**：内置信号量限流，超出的请求自动排队
- **数据驱动**：通过 `props` 给模板传 JSON 数据，同一模板渲染不同结果，无状态残留
- **跨平台**：自动探测 Windows / Linux 下的 Chrome 路径，也可手动指定

## 架构图

<p align="center">
  <img src="docs/architecture.svg" alt="vue3renderer architecture" width="860">
</p>

<p align="center"><sub>调用方一次配置创建 SnapshotRenderer；.vue 文件经 vue3tohtml 在内存中 SSR 编译（props 透传），网址直接 goto；两者都在常驻 Chromium 上渲染，信号量限流排队，输出 PNG/JPEG Buffer。图会跟随你的深浅色主题。<br>源文件 <a href="docs/architecture.html">docs/architecture.html</a>（可交互，支持导出），修改后运行 <code>node export-diagram.ts</code> 重新生成。</sub></p>

## 安装

```bash
npm i vue3renderer playwright
```

playwright 是 peer dependency，需要你自行安装。浏览器内核二选一：

```bash
# 方式一：让 playwright 下载 Chromium
npx playwright install chromium

# 方式二：用系统已装的 Chrome（推荐服务器部署，不用下 300MB）
# 什么都不用做，会自动探测；或者用环境变量指定：
# set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe   (Windows)
# export CHROME_PATH=/usr/bin/google-chrome                              (Linux)
```

要求 Node.js >= 18，仅支持 ESM（`"type": "module"`）。

## 快速开始

```ts
import { createSnapshotter } from 'vue3renderer'

// 配置一次：Chrome 路径、并发数、尺寸、清晰度……
const shot = createSnapshotter({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', // 不传则自动探测 / 读 CHROME_PATH
  concurrency: 2,
  width: 1280,
  deviceScaleFactor: 2, // 清晰度：1 普通 / 2 高清 / 3 超清
})

// .vue 文件截图
await shot.snapshotVue('./Showcase.vue', 'output.png')

// 网址截图
await shot.snapshotUrl('https://example.com', 'web.png')

// 自动识别来源：http(s):// 开头按网址，否则按 .vue 文件
await shot.snapshot('./Showcase.vue', 'output.png')

// 服务退出前回收浏览器（可选；之后再次截图会自动重启）
await shot.close()
```

不想管理实例时，还有三个零配置的模块级函数（走内部共享的常驻浏览器）：

```ts
import { snapshot, snapshotUrl, snapshotVue } from 'vue3renderer'

await snapshotVue('./Showcase.vue', 'output.png', { deviceScaleFactor: 3 })
```

## 用 props 传数据

模板里写死的数据改为 `defineProps` 接收，每次截图传不同的 JSON：

```vue
<!-- UserCard.vue -->
<script setup lang="ts">
withDefaults(
  defineProps<{
    user?: { name: string; tags: string[] }
  }>(),
  { user: () => ({ name: '匿名', tags: [] }) },
)
</script>
<template>
  <h1>{{ user.name }}</h1>
  <ul>
    <li v-for="tag in user.tags" :key="tag">{{ tag }}</li>
  </ul>
</template>
```

```ts
await shot.snapshotVue('./UserCard.vue', 'alice.png', {
  props: { user: { name: 'Alice', tags: ['a', 'b'] } },
})
await shot.snapshotVue('./UserCard.vue', 'bob.png', {
  props: { user: { name: 'Bob', tags: ['c'] } },
})
```

注意事项：

- `<script setup>` 用了 TS 泛型语法（`defineProps<{...}>()`）时必须带 `lang="ts"`
- 动态字段通过 `{{ }}`、`v-for`、`v-if` 使用，**不要字符串拼接 HTML**（props 值会被安全序列化，拼接则会引入 XSS）
- 模板未用 `defineProps` 声明的字段会被**静默忽略**，字段名对不上时先检查声明
- props 每次调用独立生效，可放心并发复用同一模板

## API

### `createSnapshotter(options?): SnapshotRenderer`

创建截图器。所有配置一次设置、全局生效，单次调用可临时覆盖截图类默认值。

**浏览器级选项**（创建时锁定）：

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `executablePath` | `string` | 自动探测 | Chromium 可执行文件路径；探测顺序为 手动指定 → `CHROME_PATH`/`CHROMIUM_PATH` 环境变量 → 平台默认安装位置（Windows: Program Files / LocalAppData 下的 chrome.exe；Linux: google-chrome / chromium / snap） |
| `concurrency` | `number` | `4` | 最大并发截图数，超出的排队（FIFO） |
| `launchOptions` | `object` | — | 透传给 `chromium.launch` 的额外参数 |

**截图默认值**（每次调用可用第三个参数覆盖）：

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `width` / `height` | `number` | `1280` / `800` | 视口尺寸 |
| `fullPage` | `boolean` | `true` | 整页截图；`false` 只截视口范围 |
| `deviceScaleFactor` | `number` | `2` | 清晰度（设备缩放比） |
| `waitForFonts` | `boolean` | `true` | 等字体加载完成再截图 |
| `fontTimeout` | `number` | `10000` | 字体等待超时（毫秒），超时照常截图 |
| `timeout` | `number` | `30000` | 页面加载超时（毫秒） |
| `props` | `object` | — | 传给 `.vue` 根组件的 props（仅 `snapshotVue` / `snapshot` 生效） |
| `type` | `'png' \| 'jpeg'` | `'png'` | 截图格式；jpeg 体积小，适合接口返回 |
| `quality` | `number` | `90` | jpeg 质量 1-100（仅 `type: 'jpeg'` 生效） |
| `clip` | `{x, y, width, height}` | — | 区域截图（相对页面左上角）；设置后 `fullPage` 失效 |
| `darkMode` | `boolean` | `false` | 深色模式（`prefers-color-scheme: dark`） |
| `userAgent` | `string` | 浏览器默认 | 自定义 User-Agent |
| `locale` | `string` | 系统默认 | 浏览器语言环境，如 `'zh-CN'` |
| `timezoneId` | `string` | 系统默认 | 时区，如 `'Asia/Shanghai'`，影响页面内时间显示 |
| `animations` | `'allow' \| 'disabled'` | `'allow'` | 截图瞬间禁用 CSS 动画/过渡，避免截到中间态 |
| `waitUntil` | `'load' \| 'domcontentloaded' \| 'networkidle'` | 网址 `networkidle` / vue `load` | 页面加载等待策略；慢页面可改 `domcontentloaded` 提速 |
| `fontFamily` | `string` | — | 全局字体名（**需系统已安装**，如 `'思源黑体 CN'`）；未安装时自动回退到平台兜底字体链（苹方/微软雅黑/Noto Sans CJK → sans-serif）并打印警告，不会报错。含逗号时视为完整字体链原样使用、不做检测 |

### 实例方法

```ts
shot.snapshotUrl(url, output?, overrides?)   // 网址 → PNG
shot.snapshotVue(vueFile, output?, overrides?) // .vue 文件 → PNG
shot.snapshot(source, output?, overrides?)   // 自动识别来源
shot.close()                                 // 关闭常驻浏览器
```

- 返回 `Promise<Buffer>`；`output` 省略时不落盘，纯内存返回
- `source` 以 `http://` / `https://` 开头按网址处理，否则按 `.vue` 文件路径

### 模块级函数

`snapshotUrl(url, output?, options?)` / `snapshotVue(vueFile, output?, options?)` / `snapshot(source, output?, options?)` —— 行为同实例方法，走共享常驻浏览器，选项里浏览器级字段不生效。

## HTTP 服务场景

以 Express 为例，`req.body` 的业务数据放进 `props` 透传即可：

```ts
import express from 'express'
import { createSnapshotter } from 'vue3renderer'

const shot = createSnapshotter({ concurrency: 4 })
const app = express()
app.use(express.json({ limit: '1mb' }))

app.post('/snapshot', async (req, res) => {
  // 只把白名单内的业务字段透传给模板，不要把不可信输入拼进 HTML 结构
  const buffer = await shot.snapshotVue('./Report.vue', undefined, {
    props: {
      title: String(req.body.title ?? '未命名报告'),
      rows: Array.isArray(req.body.rows) ? req.body.rows : [],
    },
  })
  res.type('image/png').send(buffer)
})
```

## 部署提示

- **并发别照 CPU 核数拉满**：每个并发 page 有真实内存开销（@2x 的复杂页面单 page 可到几百 MB），`concurrency: 2–4` 起步，观察内存再加
- **量大时多实例**：创建多个 `createSnapshotter()` 实例（各自独立浏览器进程）比单实例拉满并发更稳
- **Linux 中文变方块**：系统缺中文字体，`apt install fonts-noto-cjk` 后重启服务即可；自定义字体同理——先装进系统（如 `/usr/share/fonts/` 下 + `fc-cache -fv`），再用 `fontFamily` 选项引用
- **崩溃自愈**：浏览器进程意外退出后，下一次截图会自动重启实例，无需额外处理

## 开发

```bash
git clone <repo> && cd vue3renderer
npm i
node main.ts        # 跑示例（本地需有 Chrome 或设置 CHROME_PATH）
npm run build       # tsc 编译到 dist/
```

## License

MIT
