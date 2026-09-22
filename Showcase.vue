<template>
  <div class="page">
    <!-- Hero -->
    <header class="hero">
      <div class="hero-content">
        <span class="badge">✨ Vue 3 SFC Showcase</span>
        <h1>
          把组件编译成
          <span class="gradient-text">一张开箱即用的网页</span>
        </h1>
        <p class="subtitle">
          这份页面由单个 .vue 文件渲染而来 —— 无构建工具、无脚手架，打开即是成品。
        </p>
        <div class="hero-actions">
          <button class="btn primary" @click="count++">
            已点击 {{ count }} 次
          </button>
          <button class="btn ghost" @click="count = 0">重置</button>
        </div>
      </div>

      <!-- 统计卡片 -->
      <div class="stats">
        <div v-for="stat in stats" :key="stat.label" class="stat-card">
          <span class="stat-value">{{ stat.value }}</span>
          <span class="stat-label">{{ stat.label }}</span>
          <span class="stat-trend" :class="stat.up ? 'up' : 'down'">
            {{ stat.up ? '▲' : '▼' }} {{ stat.delta }}
          </span>
        </div>
      </div>
    </header>

    <!-- 特性区 -->
    <main class="features">
      <h2>核心能力</h2>
      <div class="feature-grid">
        <article
          v-for="feature in features"
          :key="feature.title"
          class="feature-card"
          :class="{ highlighted: feature.highlight }"
        >
          <div class="feature-icon">{{ feature.icon }}</div>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.desc }}</p>
        </article>
      </div>
    </main>

    <!-- 页脚 -->
    <footer class="footer">
      <p>
        渲染模式：<strong>{{ mode }}</strong> ·
        当前时间快照：<strong>{{ renderedAt }}</strong>
      </p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

// 数据由调用方通过 props 传入；以下默认值仅供无参渲染兜底
interface StatItem {
  label: string
  value: string
  delta: string
  up: boolean
}

interface FeatureItem {
  icon: string
  title: string
  desc: string
  highlight?: boolean
}

withDefaults(
  defineProps<{
    stats?: StatItem[]
    features?: FeatureItem[]
  }>(),
  {
    stats: () => [
      { label: '编译速度', value: '160ms', delta: '42%', up: true },
      { label: '缓存命中', value: '<1ms', delta: '99%', up: true },
      { label: '产物体积', value: '0KB JS', delta: '100%', up: true },
      { label: '白屏时间', value: '0ms', delta: '∞', up: false },
    ],
    features: () => [
      { icon: '⚡', title: '秒级静态渲染', desc: '服务端直接输出完整 HTML，截图工具打开即有内容，无需等待 JS 加载。', highlight: true },
      { icon: '🎨', title: 'Scoped 样式', desc: '样式隔离开箱即用，多个组件同页共存互不干扰。' },
      { icon: '🧩', title: '标准 SFC 语法', desc: 'script setup、TS、v-for、computed —— 怎么写 Vue 就怎么渲染。' },
      { icon: '📦', title: '单文件分发', desc: '一个 .html 走天下，邮件、内网、离线环境都能直接打开。' },
    ],
  },
)

// 交互状态（客户端路径可点击，SSR 静态快照渲染初始值）
const count = ref(0)

// 根据 SSR 静态快照与客户端挂载的差异推断当前渲染模式
const mode = computed(() => (typeof window === 'undefined' ? 'SSR 静态快照' : '客户端交互'))

const renderedAt = new Date().toLocaleString('zh-CN', { dateStyle: 'long', timeStyle: 'medium' })
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #0f1220;
  color: #e8eaf6;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Microsoft YaHei', sans-serif;
}

/* ---- Hero ---- */
.hero {
  padding: 72px 24px 40px;
  background:
    radial-gradient(1200px 400px at 20% -10%, rgba(99, 102, 241, 0.25), transparent),
    radial-gradient(800px 300px at 80% 0%, rgba(34, 211, 238, 0.18), transparent);
  text-align: center;
}

.badge {
  display: inline-block;
  padding: 6px 14px;
  border: 1px solid rgba(139, 148, 255, 0.4);
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
  color: #aab2ff;
  font-size: 14px;
  letter-spacing: 0.5px;
}

.hero h1 {
  margin: 20px auto 16px;
  max-width: 720px;
  font-size: clamp(32px, 5vw, 52px);
  line-height: 1.2;
  font-weight: 800;
}

.gradient-text {
  background: linear-gradient(90deg, #818cf8, #22d3ee 60%, #34d399);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.subtitle {
  max-width: 560px;
  margin: 0 auto;
  color: #9aa1c0;
  font-size: 17px;
  line-height: 1.7;
}

.hero-actions {
  display: flex;
  justify-content: center;
  gap: 14px;
  margin-top: 28px;
}

.btn {
  padding: 12px 28px;
  border-radius: 10px;
  border: none;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.btn:hover {
  transform: translateY(-2px);
}

.btn.primary {
  background: linear-gradient(135deg, #6366f1, #22d3ee);
  color: #fff;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);
}

.btn.ghost {
  background: transparent;
  color: #aab2ff;
  border: 1px solid rgba(139, 148, 255, 0.4);
}

/* ---- 统计卡片 ---- */
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  max-width: 860px;
  margin: 48px auto 0;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(6px);
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
}

.stat-label {
  font-size: 13px;
  color: #9aa1c0;
}

.stat-trend {
  font-size: 12px;
  font-weight: 600;
}

.stat-trend.up {
  color: #34d399;
}

.stat-trend.down {
  color: #f87171;
}

/* ---- 特性区 ---- */
.features {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 24px 64px;
}

.features h2 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 24px;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.feature-card {
  padding: 24px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.feature-card:hover {
  border-color: rgba(139, 148, 255, 0.5);
  transform: translateY(-3px);
}

.feature-card.highlighted {
  background: linear-gradient(160deg, rgba(99, 102, 241, 0.14), rgba(255, 255, 255, 0.03));
  border-color: rgba(139, 148, 255, 0.45);
}

.feature-icon {
  font-size: 28px;
  margin-bottom: 12px;
}

.feature-card h3 {
  font-size: 16px;
  margin-bottom: 8px;
}

.feature-card p {
  font-size: 14px;
  line-height: 1.6;
  color: #9aa1c0;
}

/* ---- 页脚 ---- */
.footer {
  padding: 20px 24px 32px;
  text-align: center;
  color: #6b7194;
  font-size: 13px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.footer strong {
  color: #aab2ff;
}
</style>
