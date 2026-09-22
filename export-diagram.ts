import { chromium } from 'playwright'
import { pathToFileURL } from 'url'
import { copyFile } from 'fs/promises'

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

await page.goto(pathToFileURL('docs/architecture.html').href, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)

// 触发内置导出（下载到默认目录），再拷回 docs/
for (const [format, dest] of [['svg', 'docs/architecture.svg'], ['png', 'docs/architecture.png']] as const) {
  const download = page.waitForEvent('download')
  await page.evaluate((f) => (window as any).Archify.exportMenu.run(f), format)
  const dl = await download
  await dl.saveAs(dest)
  await copyFile(await dl.path(), dest).catch(() => {}) // saveAs 已落盘，忽略
  console.log('exported', dest)
}

await browser.close()
