import { createSnapshotter } from './render.ts'

const shot = createSnapshotter()

// 场景 1：系统已安装的字体（Arial 在 Windows 上必有）
await shot.snapshotVue('./Showcase.vue', 'font-ok.png', { fontFamily: 'Arial' })

// 场景 2：未安装的字体 —— 应回退到兜底字体链并打印警告，不抛错
await shot.snapshotVue('./Showcase.vue', 'font-fallback.png', {
  fontFamily: 'Definitely-Not-Installed-Font',
})

// 场景 3：用户自带完整字体链（含逗号），原样使用、不做检查
await shot.snapshotVue('./Showcase.vue', 'font-stack.png', {
  fontFamily: 'Georgia, "Microsoft YaHei", serif',
})

await shot.close()
console.log('done')
