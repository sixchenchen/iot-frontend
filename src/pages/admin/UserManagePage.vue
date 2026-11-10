<template>
  <div class="user-manage-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <h3>用户管理</h3>
          <div class="header-actions">
            <el-button v-permission="'user:create'" type="primary" @click="openCreate">
              新增用户
            </el-button>
            <el-button :loading="loading" @click="fetchUsers">刷新</el-button>
          </div>
        </div>
      </template>

      <el-form :inline="true" class="filter-form" @submit.prevent>
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            placeholder="用户名/昵称/手机号"
            clearable
            style="width: 200px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="全部" clearable style="width: 120px">
            <el-option
              v-for="item in statusOptions"
              :key="item.value"
              :label="item.label"
              :value="Number(item.value)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="query.role" placeholder="全部" clearable style="width: 120px">
            <el-option
              v-for="role in roleOptions"
              :key="role.code"
              :label="role.name"
              :value="role.code"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
          <ColumnSettings
            v-model:hidden="hiddenColumns"
            :columns="USER_COLUMNS"
            @show-all="showAllColumns"
            @reset="resetColumns"
          />
        </el-form-item>
      </el-form>

      <el-table :data="users" v-loading="loading" stripe>
        <template #empty><el-empty description="暂无用户" :image-size="60" /></template>
        <el-table-column v-if="!isHidden('id')" prop="id" label="ID" width="70" />
        <el-table-column v-if="!isHidden('username')" prop="username" label="用户名" min-width="140" />
        <el-table-column v-if="!isHidden('nickname')" label="昵称" min-width="120">
          <template #default="{ row }">{{ row.nickname || '-' }}</template>
        </el-table-column>
        <el-table-column v-if="!isHidden('contact')" label="联系方式" min-width="180">
          <template #default="{ row }">
            <div>{{ row.phone || '-' }}</div>
            <div class="sub-text">{{ row.email || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column v-if="!isHidden('roles')" label="角色" min-width="120">
          <template #default="{ row }">
            <el-tag
              v-for="role in row.roles"
              :key="role"
              size="small"
              :type="role === 'ADMIN' ? 'danger' : 'info'"
              class="tag-gap"
            >
              {{ role }}
            </el-tag>
            <span v-if="!row.roles.length">-</span>
          </template>
        </el-table-column>
        <el-table-column v-if="!isHidden('status')" label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="!isHidden('lastLoginTime')" label="最后登录" width="170">
          <template #default="{ row }">{{ formatDateTime(row.lastLoginTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="270" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row as AdminUserVO)">详情</el-button>
            <el-button v-permission="'user:update'" link type="primary" @click="openEdit(row as AdminUserVO)">
              编辑
            </el-button>
            <el-button
              v-permission="'user:update'"
              link
              :type="row.status === 1 ? 'warning' : 'success'"
              @click="handleToggleStatus(row as AdminUserVO)"
            >
              {{ row.status === 1 ? '禁用' : '启用' }}
            </el-button>
            <el-button v-permission="'user:update'" link type="primary" @click="openRoles(row as AdminUserVO)">
              角色
            </el-button>
            <el-button v-permission="'user:delete'" link type="danger" @click="handleDelete(row as AdminUserVO)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination
          v-model:current-page="query.pageNum"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="handleSearch"
          @current-change="fetchUsers"
        />
      </div>
    </el-card>

    <!-- ============ 详情 + 绑定设备 ============ -->
    <el-drawer v-model="detailVisible" title="用户详情" size="620px">
      <div v-loading="detailLoading">
        <el-descriptions v-if="detail" :column="2" border>
          <el-descriptions-item label="ID">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="用户名">{{ detail.username }}</el-descriptions-item>
          <el-descriptions-item label="昵称">{{ detail.nickname || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            {{ detail.status === 1 ? '启用' : '禁用' }}
          </el-descriptions-item>
          <el-descriptions-item label="手机号">{{ detail.phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="邮箱">{{ detail.email || '-' }}</el-descriptions-item>
          <el-descriptions-item label="角色">{{ detail.roles.join('、') || '-' }}</el-descriptions-item>
          <el-descriptions-item label="绑定设备数">{{ detail.deviceCount }}</el-descriptions-item>
          <el-descriptions-item label="登录次数">{{ detail.loginCount }}</el-descriptions-item>
          <el-descriptions-item label="注册时间">
            {{ formatDateTime(detail.createTime) }}
          </el-descriptions-item>
          <el-descriptions-item label="最后登录">
            {{ formatDateTime(detail.lastLoginTime) }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatDateTime(detail.updateTime) }}
          </el-descriptions-item>
        </el-descriptions>

        <h4 class="section-title">绑定设备</h4>
        <el-table :data="userDevices" v-loading="devicesLoading" stripe size="small">
          <template #empty><el-empty description="暂无绑定设备" :image-size="50" /></template>
          <el-table-column prop="deviceId" label="MAC" width="150" />
          <el-table-column label="设备名" min-width="130">
            <template #default="{ row }">{{ row.deviceName || '-' }}</template>
          </el-table-column>
          <el-table-column label="在线" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="isDeviceOnline(row.online) ? 'success' : 'info'" size="small">
                {{ isDeviceOnline(row.online) ? '在线' : '离线' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button
                v-if="canForceUnbind"
                link
                type="danger"
                @click="handleForceUnbind(row as Device)"
              >
                解绑
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-container">
          <el-pagination
            v-model:current-page="deviceQuery.pageNum"
            v-model:page-size="deviceQuery.pageSize"
            :total="deviceTotal"
            :page-sizes="[5, 10, 20]"
            layout="total, sizes, prev, pager, next"
            @size-change="handleDeviceSearch"
            @current-change="loadUserDevices"
          />
        </div>
      </div>
    </el-drawer>

    <!-- ============ 编辑资料 ============ -->
    <el-dialog v-model="editVisible" title="编辑用户资料" width="480px" :close-on-click-modal="false">
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-width="90px">
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="editForm.nickname" maxlength="64" clearable />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="editForm.email" maxlength="128" clearable />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="editForm.phone" maxlength="11" clearable />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- ============ 分配角色 ============ -->
    <el-dialog v-model="rolesVisible" title="分配角色" width="420px" :close-on-click-modal="false">
      <el-alert
        type="warning"
        :closable="false"
        title="角色为整体替换，至少保留一个角色；修改后用户需重新登录生效。"
        class="dialog-alert"
      />
      <el-checkbox-group v-model="selectedRoles">
        <el-checkbox v-for="role in roleOptions" :key="role.code" :value="role.code">
          {{ role.name }}（{{ role.code }}）
        </el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="rolesVisible = false">取消</el-button>
        <el-button type="primary" :loading="rolesSaving" @click="submitRoles">保存</el-button>
      </template>
    </el-dialog>

    <!-- ============ 新增用户 ============ -->
    <el-dialog
      v-model="createVisible"
      title="新增用户"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="90px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="createForm.username" maxlength="32" placeholder="4-32 位字母/数字/下划线" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="createForm.password"
            type="password"
            show-password
            maxlength="64"
            placeholder="8-64 位，需同时包含字母和数字"
          />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="createForm.nickname" maxlength="64" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="createForm.email" maxlength="128" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="createForm.phone" maxlength="11" />
        </el-form-item>
        <el-form-item label="角色" prop="roleCodes">
          <el-select v-model="createForm.roleCodes" multiple style="width: 100%">
            <el-option
              v-for="role in roleOptions"
              :key="role.code"
              :label="`${role.name}（${role.code}）`"
              :value="role.code"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="createForm.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createSaving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { adminUserApi } from '@/features/admin/api/userApi'
import { roleApi } from '@/features/admin/api/roleApi'
import { commonApi } from '@/features/common/api/commonApi'
import { useAuthStore } from '@/stores/useAuthStore'
import type { DictionaryOption, RoleOption } from '@/types/common'
import type { Device } from '@/types/device'
import type {
  AdminUserCreateRequest,
  AdminUserDetailVO,
  AdminUserQuery,
  AdminUserUpdateRequest,
  AdminUserVO,
  UserRolesUpdateRequest,
  UserStatusUpdateRequest,
} from '@/types/user'
import { formatDateTime, isDeviceOnline } from '@/utils/device'
import ColumnSettings from '@/components/common/ColumnSettings.vue'
import { useColumnSettings, type ColumnOption } from '@/composables/useColumnSettings'

/**
 * ============================================================================
 * 管理端用户管理（文档 8.6）
 * ============================================================================
 * 覆盖列表、详情、编辑、启停、角色分配、绑定设备、强制解绑、删除。
 * 权限码：user:list / user:update / user:delete / device:unbind。
 * ============================================================================
 */

/** 可配置列；操作列固定显示，避免隐藏后无法操作。 */
const USER_COLUMNS: ColumnOption[] = [
  { key: 'id', label: 'ID' },
  { key: 'username', label: '用户名' },
  { key: 'nickname', label: '昵称' },
  { key: 'contact', label: '联系方式' },
  { key: 'roles', label: '角色' },
  { key: 'status', label: '状态' },
  { key: 'lastLoginTime', label: '最后登录' },
  { key: 'actions', label: '操作', fixed: true },
]

const {
  hidden: hiddenColumns,
  isHidden,
  showAll: showAllColumns,
  reset: resetColumns,
} = useColumnSettings('admin-users', USER_COLUMNS)

const authStore = useAuthStore()
const canForceUnbind = computed(() => authStore.hasPermission('device:unbind'))

const users = ref<AdminUserVO[]>([])
const total = ref(0)
const loading = ref(false)
const query = reactive<{
  pageNum: number
  pageSize: number
  keyword: string
  status?: number
  role?: string
}>({
  pageNum: 1,
  pageSize: 10,
  keyword: '',
  status: undefined,
  role: undefined,
})

const roleOptions = ref<RoleOption[]>([
  { code: 'ADMIN', name: '管理员' },
  { code: 'USER', name: '用户' },
])
const statusOptions = ref<DictionaryOption[]>([
  { value: 1, label: '启用' },
  { value: 0, label: '禁用' },
])

const fetchUsers = async () => {
  loading.value = true
  try {
    const params: AdminUserQuery = {
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      keyword: query.keyword.trim() || undefined,
      status: query.status,
      role: query.role,
    }
    const res = await adminUserApi.list(params)
    users.value = res.records || []
    total.value = res.total || 0
  } catch {
    users.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  query.pageNum = 1
  fetchUsers()
}

const handleReset = () => {
  query.keyword = ''
  query.status = undefined
  query.role = undefined
  handleSearch()
}

const loadDictionaries = async () => {
  try {
    const dict = await commonApi.dictionaries()
    if (dict.roles?.length) roleOptions.value = dict.roles
    if (dict.userStatus?.length) statusOptions.value = dict.userStatus
  } catch {
    // 字典失败时保留本地兜底选项
  }

  // 角色下拉以 sys_role 为准（含自定义角色），仅展示启用中的角色。
  try {
    const roles = await roleApi.all()
    const enabled = (roles || [])
      .filter((role) => role.status === 1)
      .map((role) => ({ code: role.roleCode, name: role.roleName }))
    if (enabled.length) roleOptions.value = enabled
  } catch {
    // 角色接口不可用时沿用字典结果
  }
}

// ==================== 详情 ====================
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<AdminUserDetailVO | null>(null)
const userDevices = ref<Device[]>([])
const deviceTotal = ref(0)
const devicesLoading = ref(false)
const deviceQuery = reactive({ pageNum: 1, pageSize: 5 })

const openDetail = async (row: AdminUserVO) => {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  userDevices.value = []
  deviceQuery.pageNum = 1
  try {
    detail.value = await adminUserApi.detail(row.id)
    await loadUserDevices()
  } catch {
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

const loadUserDevices = async () => {
  if (!detail.value) return
  devicesLoading.value = true
  try {
    const res = await adminUserApi.devices(detail.value.id, { ...deviceQuery })
    userDevices.value = res.records || []
    deviceTotal.value = res.total || 0
  } catch {
    userDevices.value = []
    deviceTotal.value = 0
  } finally {
    devicesLoading.value = false
  }
}

const handleDeviceSearch = () => {
  deviceQuery.pageNum = 1
  loadUserDevices()
}

const handleForceUnbind = (device: Device) => {
  if (!detail.value) return
  ElMessageBox.confirm(
    `确定解除用户「${detail.value.nickname || detail.value.username}」与设备 ${device.deviceId} 的绑定吗？`,
    '强制解绑',
    { confirmButtonText: '确定解绑', cancelButtonText: '取消', type: 'warning' },
  )
    .then(async () => {
      try {
        await adminUserApi.forceUnbind(detail.value!.id, { deviceId: device.deviceId })
        ElMessage.success('已解绑')
        loadUserDevices()
        adminUserApi.detail(detail.value!.id).then((res) => (detail.value = res)).catch(() => undefined)
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

// ==================== 编辑 ====================
const editVisible = ref(false)
const editSaving = ref(false)
const editFormRef = ref<FormInstance>()
const editingUser = ref<AdminUserVO | null>(null)
const editForm = reactive({ nickname: '', email: '', phone: '' })

const editRules: FormRules = {
  nickname: [{ max: 64, message: '昵称不能超过 64 位', trigger: 'blur' }],
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
  phone: [{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' }],
}

const openEdit = (row: AdminUserVO) => {
  editingUser.value = row
  editForm.nickname = row.nickname ?? ''
  editForm.email = row.email ?? ''
  editForm.phone = row.phone ?? ''
  editVisible.value = true
}

const submitEdit = async () => {
  if (!editFormRef.value || !editingUser.value) return
  try {
    await editFormRef.value.validate()
  } catch {
    return
  }

  const payload: AdminUserUpdateRequest = {
    nickname: editForm.nickname.trim() || undefined,
    email: editForm.email.trim() || undefined,
    phone: editForm.phone.trim() || undefined,
  }

  editSaving.value = true
  try {
    await adminUserApi.update(editingUser.value.id, payload)
    ElMessage.success('用户资料已更新')
    editVisible.value = false
    fetchUsers()
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    editSaving.value = false
  }
}

// ==================== 启停 ====================
const handleToggleStatus = (row: AdminUserVO) => {
  const targetStatus = row.status === 1 ? 0 : 1
  const action = targetStatus === 1 ? '启用' : '禁用'
  ElMessageBox.confirm(`确定${action}用户「${row.username}」吗？`, `${action}用户`, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      try {
        const payload: UserStatusUpdateRequest = { status: targetStatus === 1 ? 1 : 0 }
        await adminUserApi.updateStatus(row.id, payload)
        ElMessage.success(`已${action}`)
        fetchUsers()
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

// ==================== 角色 ====================
const rolesVisible = ref(false)
const rolesSaving = ref(false)
const editingRolesUser = ref<AdminUserVO | null>(null)
const selectedRoles = ref<string[]>([])

const openRoles = (row: AdminUserVO) => {
  editingRolesUser.value = row
  selectedRoles.value = [...row.roles]
  rolesVisible.value = true
}

const submitRoles = async () => {
  if (!editingRolesUser.value) return
  if (!selectedRoles.value.length) {
    ElMessage.warning('至少保留一个角色')
    return
  }

  const payload: UserRolesUpdateRequest = { roleCodes: selectedRoles.value }
  rolesSaving.value = true
  try {
    await adminUserApi.updateRoles(editingRolesUser.value.id, payload)
    ElMessage.success('角色已更新')
    rolesVisible.value = false
    fetchUsers()
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    rolesSaving.value = false
  }
}

// ==================== 删除 ====================
const handleDelete = (row: AdminUserVO) => {
  ElMessageBox.confirm(
    `确定删除用户「${row.username}」吗？该操作为逻辑删除，删除后用户无法登录。`,
    '删除用户',
    { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' },
  )
    .then(async () => {
      try {
        await adminUserApi.deleteUser(row.id)
        ElMessage.success('用户已删除')
        fetchUsers()
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

// ==================== 新增用户 ====================
const createVisible = ref(false)
const createSaving = ref(false)
const createFormRef = ref<FormInstance>()
const createForm = reactive<{
  username: string
  password: string
  nickname: string
  email: string
  phone: string
  roleCodes: string[]
  status: number
}>({
  username: '',
  password: '',
  nickname: '',
  email: '',
  phone: '',
  roleCodes: ['USER'],
  status: 1,
})

const createRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9_]{4,32}$/,
      message: '4-32 位字母、数字或下划线',
      trigger: 'blur',
    },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    {
      pattern: /^(?=.*[A-Za-z])(?=.*\d)\S{8,64}$/,
      message: '8-64 位且同时包含字母和数字',
      trigger: 'blur',
    },
  ],
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
  phone: [{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' }],
  roleCodes: [
    { required: true, type: 'array', min: 1, message: '至少选择一个角色', trigger: 'change' },
  ],
}

const openCreate = () => {
  createForm.username = ''
  createForm.password = ''
  createForm.nickname = ''
  createForm.email = ''
  createForm.phone = ''
  createForm.roleCodes = ['USER']
  createForm.status = 1
  createVisible.value = true
}

const submitCreate = async () => {
  if (!createFormRef.value) return
  try {
    await createFormRef.value.validate()
  } catch {
    return
  }

  const payload: AdminUserCreateRequest = {
    username: createForm.username.trim(),
    password: createForm.password,
    nickname: createForm.nickname.trim() || undefined,
    email: createForm.email.trim() || undefined,
    phone: createForm.phone.trim() || undefined,
    roleCodes: createForm.roleCodes,
    status: createForm.status === 1 ? 1 : 0,
  }

  createSaving.value = true
  try {
    await adminUserApi.create(payload)
    ElMessage.success('用户已创建')
    createVisible.value = false
    handleSearch()
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    createSaving.value = false
  }
}

onMounted(() => {
  loadDictionaries()
  fetchUsers()
})
</script>

<style scoped>
.user-manage-page {
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
.filter-form {
  margin-bottom: 8px;
}
.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.sub-text {
  font-size: 12px;
  color: #909399;
}
.tag-gap {
  margin-right: 4px;
}
.section-title {
  margin: 22px 0 12px;
  font-size: 15px;
  color: #303133;
}
.dialog-alert {
  margin-bottom: 16px;
}
</style>
