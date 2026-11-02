import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/features/auth/api/authApi'

export const useAuthStore = defineStore('auth', () => {
  // 初始化时从 localStorage 读取数据
  const user = ref<{ username: string; nickname: string } | null>(
    JSON.parse(localStorage.getItem('user_info') || 'null')
  )
  const roles = ref<string[]>(
    JSON.parse(localStorage.getItem('user_roles') || '[]')
  )
  const permCodes = ref<string[]>(
    JSON.parse(localStorage.getItem('user_perms') || '[]')
  )

  const isLoggedIn = computed(() => !!user.value)
  const isAdmin = computed(() => roles.value.includes('ADMIN'))
  const isOps = computed(() => roles.value.includes('OPS'))
  const isUser = computed(() => roles.value.includes('USER'))

  // 🌟 加上 Array.isArray 防御，防止变成 undefined 报错
  function hasRole(role: string) {
    return Array.isArray(roles.value) && roles.value.includes(role)
  }

  function hasPermission(code: string) {
    return Array.isArray(permCodes.value) && permCodes.value.includes(code)
  }

  async function login(username: string, password: string) {
    const res = await authApi.login({ username, password })
    console.log('登录接口返回:', res) // 🌟 看看有没有返回 roles 和 permissions

    localStorage.setItem('access_token', res.token)
    localStorage.setItem('refresh_token', res.refreshToken)

    const userInfo = { username: res.username, nickname: res.nickname }
    user.value = userInfo
    roles.value = res.roles || []
    permCodes.value = res.permissions || []

    localStorage.setItem('user_info', JSON.stringify(userInfo))
    localStorage.setItem('user_roles', JSON.stringify(res.roles || []))
    localStorage.setItem('user_perms', JSON.stringify(res.permissions || []))

    console.log('存完后的内存权限:', permCodes.value) // 🌟 看看是否为空
  }

  async function fetchMe() {
    try {
      const me = await authApi.me()
      if (!me) return

      // 🌟 只有拿到非空数据才覆盖，防止把已有的权限清空
      if (me.user) {
        user.value = me.user
        localStorage.setItem('user_info', JSON.stringify(me.user))
      }
      if (me.roles && me.roles.length > 0) {
        roles.value = me.roles
        localStorage.setItem('user_roles', JSON.stringify(me.roles))
      }
      if (me.permissions && me.permissions.length > 0) {
        permCodes.value = me.permissions
        localStorage.setItem('user_perms', JSON.stringify(me.permissions))
      }
    } catch (error) {
      console.warn('获取最新用户信息失败，继续使用本地缓存', error)
    }
  }

  function reset() {
    user.value = null
    roles.value = []
    permCodes.value = []
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_info')
    localStorage.removeItem('user_roles')
    localStorage.removeItem('user_perms')
  }

  return {
    user, roles, permCodes, isLoggedIn, isAdmin, isOps, isUser,
    hasRole, hasPermission, login, fetchMe, reset
  }
})