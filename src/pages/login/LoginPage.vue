<template>
  <!--
    登录 / 注册页（单卡片 + 双 Tab）。
    安全与体验要点：
      - 密码输入框均设置 autocomplete，避免浏览器错误填充/泄露；
      - 注册必须二次确认密码并勾选协议；
      - 登录后回跳地址只允许站内相对路径，防止开放重定向；
      - 登录与注册使用独立 loading，切换 Tab 不会互相影响。
  -->
  <div class="login-container">
    <el-card class="login-card">
      <template #header>
        <div class="login-header">
          <h2>IoT 设备管理平台</h2>
          <p class="subtitle">设备接入 · 状态监控 · 统一管理</p>
        </div>
      </template>

      <el-tabs v-model="activeTab" class="login-tabs">
        <!-- ==================== 登录 ==================== -->
        <el-tab-pane label="登录" name="login">
          <el-form
            ref="loginFormRef"
            :model="loginForm"
            :rules="loginRules"
            label-width="0"
            size="large"
            @submit.prevent="handleLogin"
          >
            <el-form-item prop="username">
              <el-input
                v-model.trim="loginForm.username"
                placeholder="请输入用户名"
                prefix-icon="User"
                autocomplete="username"
                clearable
              />
            </el-form-item>
            <el-form-item prop="password">
              <el-input
                v-model="loginForm.password"
                type="password"
                placeholder="请输入密码"
                prefix-icon="Lock"
                show-password
                autocomplete="current-password"
              />
            </el-form-item>

            <el-form-item>
              <el-checkbox v-model="rememberMe">记住用户名</el-checkbox>
            </el-form-item>

            <el-form-item>
              <el-button
                type="primary"
                class="w-full"
                :loading="loginLoading"
                native-type="submit"
              >
                登 录
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- ==================== 注册 ==================== -->
        <el-tab-pane label="注册" name="register">
          <el-form
            ref="registerFormRef"
            :model="registerForm"
            :rules="registerRules"
            label-width="0"
            size="large"
            @submit.prevent="handleRegister"
          >
            <el-form-item prop="username">
              <el-input
                v-model.trim="registerForm.username"
                placeholder="用户名（4-32 位字母、数字、下划线）"
                prefix-icon="User"
                autocomplete="username"
                clearable
              />
            </el-form-item>

            <el-form-item prop="password">
              <el-input
                v-model="registerForm.password"
                type="password"
                placeholder="密码（8-64 位，需包含字母和数字）"
                prefix-icon="Lock"
                show-password
                autocomplete="new-password"
              />
            </el-form-item>

            <!-- 密码强度提示：仅做即时反馈，最终策略由后端校验 -->
            <div v-if="registerForm.password" class="password-strength">
              <div class="strength-bar">
                <span
                  class="strength-fill"
                  :style="{ width: passwordStrength.width, backgroundColor: passwordStrength.color }"
                />
              </div>
              <span class="strength-text" :style="{ color: passwordStrength.color }">
                {{ passwordStrength.label }}
              </span>
            </div>

            <el-form-item prop="confirmPassword">
              <el-input
                v-model="registerForm.confirmPassword"
                type="password"
                placeholder="请再次输入密码"
                prefix-icon="Lock"
                show-password
                autocomplete="new-password"
              />
            </el-form-item>

            <el-form-item prop="nickname">
              <el-input
                v-model.trim="registerForm.nickname"
                placeholder="昵称（选填）"
                prefix-icon="Avatar"
                autocomplete="nickname"
                clearable
              />
            </el-form-item>

            <el-form-item prop="email">
              <el-input
                v-model.trim="registerForm.email"
                placeholder="邮箱（选填，如 123@qq.com）"
                prefix-icon="Message"
                autocomplete="email"
                clearable
              />
            </el-form-item>

            <el-form-item prop="phone">
              <el-input
                v-model.trim="registerForm.phone"
                placeholder="手机号（选填，如 13800138000）"
                prefix-icon="Iphone"
                autocomplete="tel"
                clearable
              />
            </el-form-item>

            <el-form-item>
              <el-checkbox v-model="agreed">
                我已阅读并同意《用户协议》和《隐私政策》
              </el-checkbox>
            </el-form-item>

            <el-form-item>
              <el-button
                type="success"
                class="w-full"
                :loading="registerLoading"
                native-type="submit"
              >
                注 册
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/useAuthStore'
import { getErrorMessage } from '@/utils/error'
import { clearRememberedUsername, getRememberedUsername, saveRememberedUsername } from '@/lib/auth-storage'

/**
 * ============================================================================
 * 登录页逻辑说明
 * ============================================================================
 * 表单校验只用于体验优化：密码复杂度、账号唯一性、登录失败次数限制等
 * 必须由后端判定，前端不可作为安全边界。
 * ============================================================================
 */
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const activeTab = ref('login')

// 登录 / 注册使用独立 loading，避免切换 Tab 时两个按钮互相「转圈」。
const loginLoading = ref(false)
const registerLoading = ref(false)

/** 只接受站内相对路径，拒绝 //evil.com 这类协议相对地址，防开放重定向。 */
function resolveRedirect(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  // 回跳到登录页本身没有意义，且可能造成循环。
  if (value.startsWith('/login')) return null
  return value
}

// ==================== 登录 ====================
const loginFormRef = ref<FormInstance>()
const rememberedUsername = getRememberedUsername()
const rememberMe = ref(Boolean(rememberedUsername))
const loginForm = reactive({
  username: rememberedUsername,
  password: '',
})
const loginRules = reactive<FormRules>({
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
})

const handleLogin = async () => {
  if (!loginFormRef.value) return
  try {
    await loginFormRef.value.validate()
  } catch {
    return // 校验失败，Element Plus 已在表单项上给出提示
  }

  loginLoading.value = true
  try {
    await authStore.login(loginForm.username, loginForm.password)

    if (rememberMe.value) {
      saveRememberedUsername(loginForm.username)
    } else {
      clearRememberedUsername()
    }

    ElMessage.success('登录成功，欢迎回来！')

    // 优先回跳到原始页面；没有则按角色进入对应首页（后端只有 ADMIN / USER）。
    const redirect = resolveRedirect(route.query.redirect)
    const fallback = authStore.hasRole('ADMIN') ? '/device/manage' : '/device/mine'
    await router.replace(redirect ?? fallback)
  } catch (error) {
    // 拦截器对 /auth/login 不自动弹窗，由页面统一展示真实失败原因。
    ElMessage.error(getErrorMessage(error, '登录失败，请稍后重试'))
  } finally {
    loginLoading.value = false
  }
}

// ==================== 注册 ====================
const registerFormRef = ref<FormInstance>()
const agreed = ref(false)
const registerForm = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  nickname: '',
  email: '',
  phone: '',
})

/** 二次确认密码：与后端 DTO 无关，属于纯前端体验校验。 */
function validateConfirmPassword(
  _rule: unknown,
  value: string,
  callback: (error?: Error) => void,
): void {
  if (!value) {
    callback(new Error('请再次输入密码'))
    return
  }
  if (value !== registerForm.password) {
    callback(new Error('两次输入的密码不一致'))
    return
  }
  callback()
}

/** 选填邮箱：为空放行，非空才校验格式。 */
function validateOptionalEmail(
  _rule: unknown,
  value: string,
  callback: (error?: Error) => void,
): void {
  if (!value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    callback()
    return
  }
  callback(new Error('邮箱格式不正确'))
}

/** 选填手机号：为空放行，非空才校验 11 位手机号。 */
function validateOptionalPhone(
  _rule: unknown,
  value: string,
  callback: (error?: Error) => void,
): void {
  if (!value || /^1[3-9]\d{9}$/.test(value)) {
    callback()
    return
  }
  callback(new Error('手机号格式不正确'))
}

// 规则与后端 UserRegisterRequest 保持一致；前端校验仅用于体验。
const registerRules = reactive<FormRules>({
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 4, max: 32, message: '用户名长度需 4-32 位', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字、下划线', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, max: 64, message: '密码长度需 8-64 位', trigger: 'blur' },
    { pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: '密码需同时包含字母和数字', trigger: 'blur' },
  ],
  confirmPassword: [{ validator: validateConfirmPassword, trigger: 'blur' }],
  email: [{ validator: validateOptionalEmail, trigger: 'blur' }],
  phone: [{ validator: validateOptionalPhone, trigger: 'blur' }],
})

/** 密码强度（0-4 分），仅做展示，不改变后端校验策略。 */
const passwordStrength = computed(() => {
  const password = registerForm.password
  let score = 0
  if (password.length >= 8) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^a-zA-Z0-9]/.test(password)) score += 1

  if (score >= 3) return { width: '100%', color: '#67c23a', label: '强度：强' }
  if (score === 2) return { width: '66%', color: '#e6a23c', label: '强度：中' }
  return { width: '33%', color: '#f56c6c', label: '强度：弱' }
})

const handleRegister = async () => {
  if (!registerFormRef.value) return

  // 先校验字段，再校验协议：让用户一次性看到所有填写问题。
  try {
    await registerFormRef.value.validate()
  } catch {
    return
  }

  if (!agreed.value) {
    ElMessage.warning('请先阅读并同意《用户协议》和《隐私政策》')
    return
  }

  registerLoading.value = true
  try {
    await authStore.register({
      username: registerForm.username,
      password: registerForm.password,
      nickname: registerForm.nickname || undefined,
      email: registerForm.email || undefined,
      phone: registerForm.phone || undefined,
    })
    ElMessage.success('注册成功，请使用新账号登录')

    // 注册成功后回到登录页签，并预填用户名，减少重复输入。
    loginForm.username = registerForm.username
    activeTab.value = 'login'
    registerForm.password = ''
    registerForm.confirmPassword = ''
    agreed.value = false
    registerFormRef.value?.clearValidate()
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '注册失败，请稍后重试'))
  } finally {
    registerLoading.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 24px;
  box-sizing: border-box;
  background: linear-gradient(135deg, #2b4b6b 0%, #1f3548 100%);
}
.login-card {
  width: min(440px, 92vw);
  border-radius: 8px;
}
.login-header h2 {
  text-align: center;
  margin: 0;
  color: #303133;
}
.subtitle {
  margin: 8px 0 0;
  text-align: center;
  font-size: 13px;
  color: #909399;
}
.w-full {
  width: 100%;
}
.login-tabs {
  padding: 0 10px;
}
.password-strength {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: -8px 0 10px;
}
.strength-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background-color: #ebeef5;
  overflow: hidden;
}
.strength-fill {
  display: block;
  height: 100%;
  transition: width 0.2s ease;
}
.strength-text {
  font-size: 12px;
  white-space: nowrap;
}
</style>
