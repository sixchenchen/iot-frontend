import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'

export function setupGuards(router: Router) {
  router.beforeEach((to) => {
    const auth = useAuthStore()
    
    // 1. 公开页面直接放行
    if (to.meta.public) {
      // 如果已经登录了，还去访问登录页，可以直接踢回首页
      if (to.name === 'Login' && auth.isLoggedIn) return { name: 'MyDevices' }
      return true
    }

    // 2. 没登录且没 Token，去登录页
    const token = localStorage.getItem('access_token')
    if (!token) {
      return { name: 'Login', query: { redirect: to.fullPath } }
    }

    // 3. 校验角色
    const roles = to.meta.roles as string[] | undefined
    if (roles && !roles.some(r => auth.hasRole(r))) {
      return { name: 'Forbidden' }
    }

    // 4. 校验权限码
    const perm = to.meta.permission as string | undefined
    if (perm && !auth.hasPermission(perm)) {
      return { name: 'Forbidden' }
    }

    return true
  })
}