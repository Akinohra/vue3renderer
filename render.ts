import { existsSync } from 'fs'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { compileVueToStaticHTML } from 'vue3tohtml'

/** 单次截图的选项（均可省略，走创建时设置的默认值） */
export interface SnapshotOptions {
  /** 视口宽度，默认 1280 */
  width?: number
  /** 视口高度，默认 800 */
  height?: number
  /** 整页截图（默认 true），false 时只截视口范围 */
  fullPage?: boolean
  /** 设备缩放比，控制清晰度：1 = 普通，2 = 高清（默认），3 = 超清 */
  deviceScaleFactor?: number
  /** 等待页面字体加载完成再截图，默认 true */
  waitForFonts?: boolean
  /** 字体等待超时（毫秒），默认 10000，超时后照常截图 */
  fontTimeout?: number
  /** 页面加载超时（毫秒），默认 30000 */
  timeout?: number
  /** 传给 .vue 根组件的 props（JSON 可序列化对象），模板需 defineProps 声明接收；每次调用独立生效 */
  props?: Record<string, unknown>
  /** 截图格式，默认 'png'；'jpeg' 体积小，适合接口返回 */
  type?: 'png' | 'jpeg'
  /** jpeg 质量 1-100（仅 type='jpeg' 时生效），默认 90 */
  quality?: number
  /** 区域截图（相对页面左上角）；设置后 fullPage 失效 */
  clip?: { x: number; y: number; width: number; height: number }
  /** 深色模式（prefers-color-scheme: dark），默认 false */
  darkMode?: boolean
  /** 自定义 User-Agent */
  userAgent?: string
  /** 浏览器语言环境，如 'zh-CN'、'en-US' */
  locale?: string
  /** 时区，如 'Asia/Shanghai'；影响页面内 new Date() 的显示 */
  timezoneId?: string
  /** 截图瞬间是否禁用 CSS 动画/过渡（避免截到中间态），默认 'allow' 保持原样 */
  animations?: 'allow' | 'disabled'
  /** 页面加载等待策略；默认网址 'networkidle'、.vue 'load'，慢页面可改 'domcontentloaded' 提速 */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'
  /** 全局字体名（需系统已安装，如 '思源黑体 CN'）；未安装时自动回退系统默认字体链并打印警告 */
  fontFamily?: string
}

/** 创建截图器时的全部配置：浏览器级 + 截图默认值，一次设置全局生效 */
export interface SnapshotterOptions extends SnapshotOptions {
  /** Chromium 可执行文件路径；不传时依次读 CHROME_PATH / CHROMIUM_PATH 环境变量，再按平台探测 */
  executablePath?: string
  /** 最大并发截图数，默认 4；超出的请求排队等待 */
  concurrency?: number
  /** 透传给 chromium.launch 的额外参数 */
  launchOptions?: Omit<Parameters<typeof chromium.launch>[0], 'executablePath'>
}

/** 解析 Chromium 路径：手动指定 > 环境变量 > 平台默认安装位置 */
function resolveChromium(executablePath?: string): string {
  if (executablePath) return executablePath

  const envPath = process.env.CHROME_PATH ?? process.env.CHROMIUM_PATH
  if (envPath) return envPath

  const candidates =
    process.platform === 'win32'
      ? [
          join(process.env.ProgramFiles ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(process.env['ProgramFiles(x86)'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          join(process.env.LocalAppData ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/snap/bin/chromium',
        ]

  const found = candidates.find((p) => p && existsSync(p))
  if (!found) {
    throw new Error(
      '未找到 Chromium：请通过 SnapshotterOptions.executablePath 或环境变量 CHROME_PATH 指定可执行文件路径',
    )
  }
  return found
}

/** 平台兜底字体链：用户字体缺失时依次回退，最后落到系统默认 sans-serif */
const FALLBACK_FONT_STACK = [
  '-apple-system',
  'BlinkMacSystemFont',
  "'Segoe UI'",
  "'PingFang SC'",
  "'Hiragino Sans GB'",
  "'Microsoft YaHei'",
  "'Noto Sans CJK SC'",
  'sans-serif',
].join(', ')

/** 生成全局 font-family 样式；fontFamily 含逗号时视为用户自带完整字体链，原样使用 */
function buildFontFamilyCss(fontFamily: string): string {
  const stack = fontFamily.includes(',')
    ? fontFamily
    : `"${fontFamily.replaceAll('"', '')}", ${FALLBACK_FONT_STACK}`
  return `html, body, body * { font-family: ${stack} !important }`
}

/** 简单信号量：限制同时进行的截图数，超出排队（FIFO） */
class Semaphore {
  #active = 0
  #queue: (() => void)[] = []
  readonly #limit: number

  constructor(limit: number) {
    this.#limit = limit
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.#active >= this.#limit) {
      await new Promise<void>((resolve) => this.#queue.push(resolve))
    }
    this.#active++
    try {
      return await task()
    } finally {
      this.#active--
      this.#queue.shift()?.()
    }
  }
}

/**
 * 截图器：常驻一个浏览器实例，截图请求经信号量限流后复用该实例。
 * 首次截图时懒启动浏览器（避免不用也起进程）；浏览器意外退出会自动重启。
 * 量大时可创建多个实例（各自独立的浏览器进程）分担负载。
 *
 * 一般不直接 new，用 createSnapshotter() 创建。
 */
export class SnapshotRenderer {
  readonly #executablePath?: string
  readonly #launchOptions: SnapshotterOptions['launchOptions']
  readonly #defaults: SnapshotOptions
  readonly #semaphore: Semaphore
  #browser: Browser | null = null
  #launching: Promise<Browser> | null = null

  constructor(options: SnapshotterOptions = {}) {
    this.#executablePath = options.executablePath
    this.#launchOptions = options.launchOptions
    // 浏览器级配置抽走后，剩下的都是单次截图的默认值
    const { executablePath: _e, concurrency: _c, launchOptions: _l, ...defaults } = options
    this.#defaults = defaults
    this.#semaphore = new Semaphore(options.concurrency ?? 4)
  }

  /** 获取常驻浏览器；崩溃或关闭后自动重启（并发调用只触发一次启动） */
  async #getBrowser(): Promise<Browser> {
    if (this.#browser?.isConnected()) return this.#browser
    if (!this.#launching) {
      this.#launching = chromium
        .launch({
          executablePath: resolveChromium(this.#executablePath),
          ...this.#launchOptions,
        })
        .then((browser) => {
          this.#browser = browser
          return browser
        })
        .catch((err) => {
          this.#launching = null // 启动失败允许重试
          throw err
        })
    }
    return this.#launching
  }

  /** 限流 + 复用常驻浏览器完成一次截图 */
  async #withPage(overrides: SnapshotOptions, load: (page: Page) => Promise<void>): Promise<Buffer> {
    const options: SnapshotOptions = { ...this.#defaults, ...overrides }
    return this.#semaphore.run(async () => {
      const browser = await this.#getBrowser()
      // 每次截图新建 page（独立 context，避免 cookie/状态串页），用完即关；
      // 热浏览器上这一步只有几十毫秒，冷启动开销已经省掉
      const page = await browser.newPage({
        viewport: {
          width: options.width ?? 1280,
          height: options.height ?? 800,
        },
        deviceScaleFactor: options.deviceScaleFactor ?? 2,
        colorScheme: options.darkMode ? 'dark' : 'light',
        userAgent: options.userAgent,
        locale: options.locale,
        timezoneId: options.timezoneId,
      })
      try {
        await load(page)

        // 全局字体：应用用户指定的字体名，未安装时回退兜底字体链
        if (options.fontFamily) {
          await page.addStyleTag({ content: buildFontFamilyCss(options.fontFamily) })
          if (!options.fontFamily.includes(',')) {
            const name = options.fontFamily.replaceAll('"', '')
            // document.fonts.check 对系统字体不可靠（缺失也返回 true），
            // 改用 canvas 测宽：给目标字体显式挂 generic 后缀，
            // 缺失时会解析成后缀字体、宽度相等；存在时度量必然不同
            const available = await page.evaluate((font) => {
              const ctx = document.createElement('canvas').getContext('2d')
              if (!ctx) return true
              const text = 'mmmmmmmmmmlli'
              const width = (font: string) => {
                ctx.font = font
                return ctx.measureText(text).width
              }
              return (
                width(`72px "${font}", monospace`) !== width('72px monospace') ||
                width(`72px "${font}", serif`) !== width('72px serif')
              )
            }, name)
            if (!available) {
              console.warn(
                `[vue3renderer] 字体 "${name}" 未安装，已回退到系统默认字体链`,
              )
            }
          }
        }

        if (options.waitForFonts !== false) {
          // 等字体就绪，超时不报错、照常截图（页面可能引用了加载不到的网络字体）
          await page.evaluate(
            (ms) =>
              Promise.race([
                document.fonts.ready,
                new Promise((resolve) => setTimeout(resolve, ms)),
              ]),
            options.fontTimeout ?? 10_000,
          )
        }

        const type = options.type ?? 'png'
        return await page.screenshot({
          fullPage: options.clip ? false : (options.fullPage ?? true),
          ...(options.clip ? { clip: options.clip } : {}),
          type,
          // quality 仅对 jpeg 合法
          ...(type === 'jpeg' ? { quality: options.quality ?? 90 } : {}),
          animations: options.animations,
        })
      } finally {
        await page.close()
      }
    })
  }

  /** 截取网页为 PNG/JPEG */
  async snapshotUrl(url: string, output?: string, options?: SnapshotOptions): Promise<Buffer> {
    const buffer = await this.#withPage(options ?? {}, async (page) => {
      await page.goto(url, {
        waitUntil: options?.waitUntil ?? 'networkidle',
        timeout: options?.timeout ?? 30_000,
      })
    })
    return save(buffer, output)
  }

  /** 渲染 .vue 单文件组件并截取为 PNG（SFC 内存编译，无中间文件） */
  async snapshotVue(vueFile: string, output?: string, options?: SnapshotOptions): Promise<Buffer> {
    const html = await compileVueToStaticHTML(vueFile, { props: options?.props })
    const buffer = await this.#withPage(options ?? {}, (page) =>
      page.setContent(html, {
        waitUntil: options?.waitUntil ?? 'load',
        timeout: options?.timeout ?? 30_000,
      }),
    )
    return save(buffer, output)
  }

  /** 自动识别来源：http(s):// 开头按网址处理，否则按 .vue 文件路径处理 */
  async snapshot(source: string, output?: string, options?: SnapshotOptions): Promise<Buffer> {
    return /^https?:\/\//i.test(source)
      ? this.snapshotUrl(source, output, options)
      : this.snapshotVue(source, output, options)
  }

  /** 关闭常驻浏览器；之后再截图会自动重启 */
  async close(): Promise<void> {
    this.#launching = null
    const browser = this.#browser
    this.#browser = null
    await browser?.close()
  }
}

/**
 * 创建截图器（推荐入口）：Chrome 路径、并发数、尺寸、清晰度等在这里设置一次，
 * 之后每次截图只传来源和输出路径，个别调用可用第三个参数临时覆盖默认值。
 *
 * @example
 * ```ts
 * const shot = createSnapshotter({ concurrency: 2, width: 1280, deviceScaleFactor: 2 })
 * await shot.snapshotVue('./Showcase.vue', 'output.png')
 * await shot.snapshotUrl('https://example.com', 'web.png')
 * await shot.close()
 * ```
 */
export function createSnapshotter(options: SnapshotterOptions = {}): SnapshotRenderer {
  return new SnapshotRenderer(options)
}

/** 截图落盘（output 为空则只在内存中返回 Buffer） */
async function save(buffer: Buffer, output?: string): Promise<Buffer> {
  if (output) await writeFile(output, buffer)
  return buffer
}

// ---- 无配置快捷方式：不想创建实例时，直接调用这三个函数（走共享常驻浏览器）----

let shared: SnapshotRenderer | null = null

function getShared(): SnapshotRenderer {
  return (shared ??= new SnapshotRenderer())
}

/** 截取网页为 PNG（走共享常驻浏览器，无任何预设） */
export async function snapshotUrl(
  url: string,
  output?: string,
  options?: SnapshotOptions,
): Promise<Buffer> {
  return getShared().snapshotUrl(url, output, options)
}

/** 渲染 .vue 单文件组件并截取为 PNG（走共享常驻浏览器，无任何预设） */
export async function snapshotVue(
  vueFile: string,
  output?: string,
  options?: SnapshotOptions,
): Promise<Buffer> {
  return getShared().snapshotVue(vueFile, output, options)
}

/** 自动识别来源截图：http(s):// 开头按网址，否则按 .vue 文件（走共享常驻浏览器） */
export async function snapshot(
  source: string,
  output?: string,
  options?: SnapshotOptions,
): Promise<Buffer> {
  return getShared().snapshot(source, output, options)
}
