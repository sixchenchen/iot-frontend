import { createApp } from 'vue'
import { createPinia } from 'pinia'

// 手动 import 的 ElMessage / ElMessageBox 不经过 unplugin resolver，
// 必须显式引入样式，否则生产构建会出现「有弹窗、无样式」的问题。
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'

import App from './App.vue'
import router from './router'
import { permissionDirective } from './directives/permission'
import { logError } from './utils/error'

/**
 * ============================================================================
 * 应用入口
 * ============================================================================
 * 初始化顺序：
 *   1. 校验必填环境变量（缺失直接中止，避免生产请求打到错误地址）；
 *   2. createApp；
 *   3. 注册全局错误处理与全局指令；
 *   4. use(Pinia) → use(Router)；
 *   5. mount。
 * ============================================================================
 */

/** 必填环境变量：缺失时 fail-fast，而不是静默运行到线上才暴露。 */
function assertRequiredEnv(): void {
  const missing = (['VITE_API_BASE_URL'] as const).filter((key) => !import.meta.env[key])
  if (missing.length > 0) {
    throw new Error(`[启动失败] 缺少环境变量：${missing.join(', ')}，请检查 .env 配置`)
  }
}

assertRequiredEnv()

const app = createApp(App)

/**
 * 全局错误边界：
 *   - 组件渲染/生命周期异常统一落到这里，便于接入监控平台；
 *   - 生产环境不展示技术细节给用户，只记录并提示。
 */
app.config.errorHandler = (error, _instance, info) => {
  logError('vue-error', error, { info })
}

/** 未处理的 Promise 异常（如业务代码忘记 catch）同样纳入监控。 */
window.addEventListener('unhandledrejection', (event) => {
  logError('unhandled-rejection', event.reason)
})

// 按钮级权限指令：<el-button v-permission="'device:manage'">
app.directive('permission', permissionDirective)

app.use(createPinia()) // 状态管理必须先于 Router（守卫内会读取 Store）
app.use(router)
app.mount('#app')
