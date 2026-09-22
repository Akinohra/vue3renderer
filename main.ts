import { createSnapshotter } from './render.ts'

const shot = createSnapshotter({
  concurrency: 2,
  width: 1280,
  deviceScaleFactor: 2,
})

// 同一模板、两组不同 props，并发渲染互不影响、无状态残留
await Promise.all([
  shot.snapshotVue('./Showcase.vue', 'output.png', {
    props: {
      stats: [
        { label: '日报产量', value: '128 篇', delta: '12%', up: true },
        { label: '平均耗时', value: '3.2s', delta: '8%', up: false },
      ],
      features: [
        { icon: '📊', title: '数据组 A', desc: '第一组数据：Alice 团队的渲染指标。', highlight: true },
      ],
    },
  }),
  shot.snapshotVue('./Showcase.vue', 'output-2.png', {
    props: {
      stats: [
        { label: '周报产量', value: '896 篇', delta: '35%', up: true },
      ],
      features: [
        { icon: '🔧', title: '数据组 B', desc: '第二组数据：Bob 团队的渲染指标。', highlight: true },
        { icon: '🧪', title: '无残留校验', desc: '此截图不应出现第一组的任何文案。' },
      ],
    },
  }),
])

await shot.close()
console.log('done')
