import { chromium } from 'playwright'
import { pathToFileURL } from 'url'
import { writeFile } from 'fs/promises'

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

await page.goto(pathToFileURL('docs/architecture.html').href, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)

// 截获导出 Blob（hook createObjectURL + 屏蔽锚点点击，不触发浏览器下载），
// 以 base64 带回 Node 后一次性写出，全程不落临时文件
async function exportAs(page: import('playwright').Page, format: string): Promise<string> {
  return page.evaluate(async (f) => {
    const blobs: Blob[] = []
    const origCreate = URL.createObjectURL.bind(URL)
    const origClick = HTMLAnchorElement.prototype.click
    URL.createObjectURL = (b: Blob) => { blobs.push(b); return origCreate(b) }
    HTMLAnchorElement.prototype.click = function () { /* 阻止下载 */ }
    try {
      await (window as any).Archify.exportMenu.run(f)
    } finally {
      URL.createObjectURL = origCreate
      HTMLAnchorElement.prototype.click = origClick
    }
    const blob = blobs[blobs.length - 1]
    if (!blob) throw new Error('export produced no blob: ' + f)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return btoa(bin)
  }, format)
}

for (const [format, dest] of [['svg', 'docs/architecture.svg'], ['png', 'docs/architecture.png']] as const) {
  const b64 = await exportAs(page, format)
  await writeFile(dest, Buffer.from(b64, 'base64'))
  console.log('exported', dest)
}

await browser.close()
