<template>
  <div class="user-center-page">
    <el-row :gutter="16">
      <el-col :xs="24" :lg="10">
        <el-card v-loading="profileLoading" shadow="never" class="profile-card">
          <template #header>
            <div class="card-header">
              <h3>个人资料</h3>
              <el-button link type="primary" @click="openPasswordDialog">修改密码</el-button>
            </div>
          </template>

          <div class="avatar-block">
            <el-avatar :size="88" :src="avatarUrl || undefined">
              <el-icon :size="36"><UserFilled /></el-icon>
            </el-avatar>
            <el-upload
              :show-file-list="false"
              :http-request="handleAvatarUpload"
              :before-upload="beforeAvatarUpload"
              accept="image/jpeg,image/png,image/webp"
            >
              <el-button type="primary" plain :loading="avatarUploading">更换头像</el-button>
            </el-upload>
            <p class="hint">
              仅支持 JPG / PNG / WebP，且不超过 2MB。头像会保存到账号，清除浏览器数据后重新登录仍会显示。
            </p>
          </div>

          <el-descriptions v-if="profile" :column="1" border class="account-info">
            <el-descriptions-item label="用户名">{{ profile.username }}</el-descriptions-item>
            <el-descriptions-item label="账号状态">
              <el-tag :type="profile.status === 1 ? 'success' : 'danger'">
                {{ profile.status === 1 ? '启用' : '禁用' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="角色">
              <el-tag v-for="role in profile.roles" :key="role" size="small" class="tag-gap">
                {{ role }}
              </el-tag>
              <span v-if="!profile.roles.length">-</span>
            </el-descriptions-item>
            <el-descriptions-item label="注册时间">
              {{ formatDateTime(profile.createTime) }}
            </el-descriptions-item>
            <el-descriptions-item label="上次登录">
              {{ formatDateTime(profile.lastLoginTime) }}
            </el-descriptions-item>
          </el-descriptions>

          <el-form
            ref="profileFormRef"
            :model="profileForm"
            :rules="profileRules"
            label-width="80px"
            class="profile-form"
          >
            <el-form-item label="昵称" prop="nickname">
              <el-input v-model="profileForm.nickname" maxlength="64" clearable />
            </el-form-item>
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="profileForm.email" maxlength="128" clearable />
            </el-form-item>
            <el-form-item label="手机号" prop="phone">
              <el-input v-model="profileForm.phone" maxlength="11" clearable />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="saving" @click="submitProfile">保存修改</el-button>
              <el-button @click="resetProfileForm">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="14">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <h3>登录记录</h3>
              <div class="header-actions">
                <el-button :loading="logsLoading" @click="fetchLoginLogs">刷新</el-button>
                <ColumnSettings
                  v-model:hidden="hiddenLogColumns"
                  :columns="LOGIN_LOG_COLUMNS"
                  @show-all="showAllLogColumns"
                  @reset="resetLogColumns"
                />
              </div>
            </div>
          </template>

          <el-table :data="loginLogs" v-loading="logsLoading" stripe>
            <template #empty>
              <el-empty description="暂无登录记录" :image-size="60" />
            </template>
            <el-table-column v-if="!isLogHidden('loginTime')" label="登录时间" width="170">
              <template #default="{ row }">{{ formatDateTime(row.loginTime) }}</template>
            </el-table-column>
            <el-table-column v-if="!isLogHidden('status')" label="结果" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
                  {{ row.status === 1 ? '成功' : '失败' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column v-if="!isLogHidden('ip')" prop="ip" label="IP" width="140">
              <template #default="{ row }">{{ row.ip || '-' }}</template>
            </el-table-column>
            <el-table-column v-if="!isLogHidden('client')" label="客户端" min-width="180">
              <template #default="{ row }">
                <el-tooltip v-if="row.userAgent" :content="row.userAgent" placement="top">
                  <span class="ellipsis">{{ row.userAgent }}</span>
                </el-tooltip>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column v-if="!isLogHidden('message')" prop="message" label="说明" min-width="140">
              <template #default="{ row }">{{ row.message || '-' }}</template>
            </el-table-column>
          </el-table>

          <div class="pagination-container">
            <el-pagination
              v-model:current-page="logQuery.pageNum"
              v-model:page-size="logQuery.pageSize"
              :total="logTotal"
              :page-sizes="[10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              @size-change="handleLogSearch"
              @current-change="fetchLoginLogs"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog
      v-model="passwordVisible"
      title="修改密码"
      width="480px"
      :close-on-click-modal="false"
      @closed="resetPasswordForm"
    >
      <el-alert
        type="warning"
        :closable="false"
        title="密码修改成功后，所有登录凭证会被撤销，需要重新登录。"
        class="dialog-alert"
      />
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-width="90px"
      >
        <el-form-item label="原密码" prop="oldPassword">
          <el-input v-model="passwordForm.oldPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="passwordForm.newPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">取消</el-button>
        <el-button type="primary" :loading="passwordSubmitting" @click="submitPassword">
          确认修改
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules, type UploadRequestOptions } from 'element-plus'
import { UserFilled } from '@element-plus/icons-vue'
import { userApi } from '@/features/user/api/userApi'
import { commonApi } from '@/features/common/api/commonApi'
import { useAuthStore } from '@/stores/useAuthStore'
import { AUTH_STORAGE_KEYS, writeJSON } from '@/lib/auth-storage'
import type { LoginLogVO, UserProfileVO } from '@/types/user'
import { formatDateTime } from '@/utils/device'
import ColumnSettings from '@/components/common/ColumnSettings.vue'
import { useColumnSettings, type ColumnOption } from '@/composables/useColumnSettings'

/**
 * ============================================================================
 * 个人中心（文档 8.1 / 8.10）
 * ============================================================================
 * 接口：GET/PUT /user/profile、PUT /user/password、GET /user/login-logs、
 *       POST /common/upload/avatar。
 *
 * 头像已由后端 `sys_user.avatar` 持久化（文档 8.10）：
 *   1. POST /common/upload/avatar 拿到 `/files/avatar/{uuid}.{ext}`；
 *   2. PUT /user/profile 提交 `{ avatar: url }` 落库；
 *   3. 登录响应与资料接口都会回传该地址，清除浏览器数据后依然可恢复。
 * ============================================================================
 */
const router = useRouter()
const authStore = useAuthStore()

const profile = ref<UserProfileVO | null>(null)
const profileLoading = ref(false)
const saving = ref(false)
const profileFormRef = ref<FormInstance>()
const profileForm = reactive({
  nickname: '',
  email: '',
  phone: '',
})

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^1[3-9]\d{9}$/

const validateEmail = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (!value) return callback()
  if (!EMAIL_PATTERN.test(value)) return callback(new Error('邮箱格式不正确'))
  callback()
}

const validatePhone = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (!value) return callback()
  if (!PHONE_PATTERN.test(value)) return callback(new Error('手机号格式不正确'))
  callback()
}

const profileRules: FormRules = {
  nickname: [
    { required: true, message: '昵称不能为空', trigger: 'blur' },
    { max: 64, message: '昵称不能超过 64 位', trigger: 'blur' },
  ],
  email: [{ validator: validateEmail, trigger: 'blur' }],
  phone: [{ validator: validatePhone, trigger: 'blur' }],
}

/**
 * 把后端资料同步到 Header 与本地快照：
 * 头像/昵称以数据库为准，避免「资料页已更新、顶部仍是旧值」。
 */
const syncAuthUser = (source: Pick<UserProfileVO, 'username' | 'nickname' | 'avatar'>) => {
  const userInfo = {
    username: source.username,
    nickname: source.nickname || source.username,
    avatar: source.avatar ?? null,
  }
  authStore.user = userInfo
  writeJSON(AUTH_STORAGE_KEYS.userInfo, userInfo)
}

const fetchProfile = async () => {
  profileLoading.value = true
  try {
    profile.value = await userApi.getProfile()
    resetProfileForm()
    syncAuthUser(profile.value)
  } catch {
    profile.value = null
  } finally {
    profileLoading.value = false
  }
}

const resetProfileForm = () => {
  profileForm.nickname = profile.value?.nickname ?? ''
  profileForm.email = profile.value?.email ?? ''
  profileForm.phone = profile.value?.phone ?? ''
}

const submitProfile = async () => {
  if (!profileFormRef.value) return
  try {
    await profileFormRef.value.validate()
  } catch {
    return
  }

  saving.value = true
  try {
    const updated = await userApi.updateProfile({
      nickname: profileForm.nickname.trim(),
      email: profileForm.email.trim() || null,
      phone: profileForm.phone.trim() || null,
    })
    profile.value = updated
    resetProfileForm()
    syncAuthUser(updated)

    ElMessage.success('资料已更新')
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    saving.value = false
  }
}

// ==================== 头像（数据库持久化） ====================
/** 资料接口优先；首屏资料未返回时回退登录响应里的 avatar，避免闪烁。 */
const avatarUrl = computed(() => profile.value?.avatar || authStore.user?.avatar || '')
const avatarUploading = ref(false)

const beforeAvatarUpload = (file: File): boolean => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type)) {
    ElMessage.error('头像仅支持 JPG / PNG / WebP 格式')
    return false
  }
  if (file.size > 2 * 1024 * 1024) {
    ElMessage.error('头像不能超过 2MB')
    return false
  }
  return true
}

const handleAvatarUpload = async (options: UploadRequestOptions) => {
  avatarUploading.value = true
  try {
    // 1. 上传文件 → 拿到后端静态地址；2. 写入资料落库，登录/刷新都会回传。
    const upload = await commonApi.uploadAvatar(options.file)
    const updated = await userApi.updateProfile({ avatar: upload.url })
    profile.value = updated
    syncAuthUser(updated)
    ElMessage.success('头像已保存到账号')
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    avatarUploading.value = false
  }
}

// ==================== 登录记录 ====================
/** 登录记录：无可操作列，全部列均可隐藏。 */
const LOGIN_LOG_COLUMNS: ColumnOption[] = [
  { key: 'loginTime', label: '登录时间' },
  { key: 'status', label: '结果' },
  { key: 'ip', label: 'IP' },
  { key: 'client', label: '客户端' },
  { key: 'message', label: '说明' },
]

const {
  hidden: hiddenLogColumns,
  isHidden: isLogHidden,
  showAll: showAllLogColumns,
  reset: resetLogColumns,
} = useColumnSettings('profile-login-logs', LOGIN_LOG_COLUMNS)

const loginLogs = ref<LoginLogVO[]>([])
const logsLoading = ref(false)
const logTotal = ref(0)
const logQuery = reactive({ pageNum: 1, pageSize: 10 })

const fetchLoginLogs = async () => {
  logsLoading.value = true
  try {
    const res = await userApi.loginLogs({ ...logQuery })
    loginLogs.value = res.records || []
    logTotal.value = res.total || 0
  } catch {
    loginLogs.value = []
    logTotal.value = 0
  } finally {
    logsLoading.value = false
  }
}

const handleLogSearch = () => {
  logQuery.pageNum = 1
  fetchLoginLogs()
}

// ==================== 修改密码 ====================
const passwordVisible = ref(false)
const passwordSubmitting = ref(false)
const passwordFormRef = ref<FormInstance>()
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const validateNewPassword = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (!value) return callback(new Error('请输入新密码'))
  if (value.length < 8 || value.length > 64) {
    return callback(new Error('密码长度需为 8~64 位'))
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return callback(new Error('密码必须同时包含字母和数字'))
  }
  callback()
}

const validateConfirmPassword = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (value !== passwordForm.newPassword) return callback(new Error('两次输入的新密码不一致'))
  callback()
}

const passwordRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [{ validator: validateNewPassword, trigger: 'blur' }],
  confirmPassword: [{ validator: validateConfirmPassword, trigger: 'blur' }],
}

const openPasswordDialog = () => {
  passwordVisible.value = true
}

const resetPasswordForm = () => {
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  passwordFormRef.value?.clearValidate()
}

const submitPassword = async () => {
  if (!passwordFormRef.value) return
  try {
    await passwordFormRef.value.validate()
  } catch {
    return
  }

  passwordSubmitting.value = true
  try {
    await userApi.changePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    })
    passwordVisible.value = false
    ElMessage.success('密码修改成功，请重新登录')
    authStore.reset()
    await router.replace({ name: 'Login' })
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    passwordSubmitting.value = false
  }
}

fetchProfile()
fetchLoginLogs()
</script>

<style scoped>
.user-center-page {
  padding: 10px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-header h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.avatar-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 8px 0 20px;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: #909399;
  text-align: center;
}
.account-info {
  margin-bottom: 20px;
}
.tag-gap {
  margin-right: 6px;
}
.profile-form {
  margin-top: 4px;
}
.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
.dialog-alert {
  margin-bottom: 16px;
}
.ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
</style>
