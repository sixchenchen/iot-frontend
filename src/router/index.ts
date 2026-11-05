import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import { routes } from './routes'
import { setupGuards } from './guards'

/**
 * 路由实例。
 *
 * 部署注意：
 *   - history 模式需要 Nginx 配置 `try_files $uri $uri/ /index.html;`，
 *     否则刷新非根路径会 404；
 *   - BASE_URL 来自 Vite 的 base 配置，子路径部署时会自动带上前缀。
 * ============================================================================
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

/**
 * 全局导航错误捕获。
 * 最常见来源是「发布后旧页面懒加载 chunk 404」：此时提示用户刷新即可，
 * 不建议自动无限刷新，避免版本回滚时反复失败。
 */
router.onError((error) => {
  const message = String((error as Error)?.message ?? error)
  if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(message)) {
    ElMessage.error('页面资源已更新，请刷新浏览器后重试')
    return
  }
  console.error('路由导航发生错误:', error)
  ElMessage.error('页面加载失败，请稍后重试')
})

// 挂载路由守卫（必须只调用一次，重复调用会注册多个同名守卫）。
setupGuards(router)

export default router
