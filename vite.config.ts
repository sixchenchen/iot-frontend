import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

/**
 * ============================================================================
 * Vite 构建配置
 * ============================================================================
 * 能力：Vue 插件、DevTools、自动导入（vue/vue-router + Element Plus API）、
 *       组件与指令按需注册、@ 别名、开发环境接口代理。
 *
 * 说明：
 *   - 开发环境 baseURL 使用相对路径 /api，由 server.proxy 转发到后端，
 *     浏览器始终同源，避免 CORS；
 *   - 未配置 scss 全局注入。如需引入公共变量，请在真实创建变量文件后再
 *     additionalData，且应使用 @use 而非 @import；
 *   - 手动 import 的 ElMessage / ElMessageBox 不经过 resolver，样式在 main.ts
 *     中显式引入（见 P0-7）。
 * ============================================================================
 */
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    AutoImport({
      imports: ['vue', 'vue-router'],
      resolvers: [ElementPlusResolver()],
      dts: './src/auto-imports.d.ts',
      eslintrc: {
        enabled: true,
        filepath: './.eslintrc-auto-import.json',
      },
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: './src/components.d.ts',
    }),
  ],
  /**
   * sockjs-client 是 browserify 产物，内部直接引用 `global`。
   * 浏览器/ESM 环境没有该变量，不映射会在模块加载阶段抛
   * "global is not defined"，导致设备页按需 chunk 加载失败。
   */
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      // 统一用 @ 指向 src，避免深层相对路径。
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 后端服务地址通过环境变量覆盖，默认本地 8080。
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
      // WebSocket / SockJS 代理（/ws 端点，不是 /api/ws）。
      '/ws': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8080',
        ws: true,
        changeOrigin: true,
      },
      // Spring Boot Actuator 健康检查不在 /api 前缀下，单独代理避免跨域。
      '/actuator': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
      // 头像等静态文件由后端 /files/** 提供。
      '/files': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
