<template>
  <div class="role-panel">
    <div class="panel-toolbar">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            placeholder="角色编码/名称"
            clearable
            style="width: 200px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="全部" clearable style="width: 120px">
            <el-option label="启用" :value="1" />
            <el-option label="禁用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
          <ColumnSettings
            v-model:hidden="hiddenRoleColumns"
            :columns="ROLE_COLUMNS"
            @show-all="showAllRoleColumns"
            @reset="resetRoleColumns"
          />
        </el-form-item>
      </el-form>
      <el-button v-permission="'role:create'" type="primary" @click="openCreate">新增角色</el-button>
    </div>

    <el-table :data="roles" v-loading="loading" stripe>
      <template #empty><el-empty description="暂无角色" :image-size="60" /></template>
      <el-table-column v-if="!isRoleHidden('roleCode')" prop="roleCode" label="角色编码" width="150" />
      <el-table-column v-if="!isRoleHidden('roleName')" prop="roleName" label="角色名称" min-width="140" />
      <el-table-column v-if="!isRoleHidden('type')" label="类型" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.builtIn === 1 ? 'danger' : 'info'" size="small">
            {{ row.builtIn === 1 ? '内置' : '自定义' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="!isRoleHidden('description')" label="描述" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.description || '-' }}</template>
      </el-table-column>
      <el-table-column
        v-if="!isRoleHidden('userCount')"
        prop="userCount"
        label="用户数"
        width="90"
        align="center"
      />
      <el-table-column
        v-if="!isRoleHidden('permissionCount')"
        prop="permissionCount"
        label="权限数"
        width="90"
        align="center"
      />
      <el-table-column v-if="!isRoleHidden('status')" label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
            {{ row.status === 1 ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="!isRoleHidden('createTime')" label="创建时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button
            v-permission="'role:assign-permission'"
            link
            type="primary"
            @click="openAssign(row as AdminRoleVO)"
          >
            授权
          </el-button>
          <el-button v-permission="'role:update'" link type="primary" @click="openEdit(row as AdminRoleVO)">
            编辑
          </el-button>
          <el-button
            v-permission="'role:update'"
            link
            :type="row.status === 1 ? 'warning' : 'success'"
            :disabled="row.builtIn === 1"
            :title="row.builtIn === 1 ? '内置角色不允许禁用' : ''"
            @click="handleToggleStatus(row as AdminRoleVO)"
          >
            {{ row.status === 1 ? '禁用' : '启用' }}
          </el-button>
          <el-button
            v-permission="'role:delete'"
            link
            type="danger"
            :disabled="row.builtIn === 1"
            :title="row.builtIn === 1 ? '内置角色不允许删除' : ''"
            @click="handleDelete(row as AdminRoleVO)"
          >
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
        @current-change="fetchRoles"
      />
    </div>

    <!-- ============ 新增/编辑角色 ============ -->
    <el-dialog
      v-model="formVisible"
      :title="editingRole ? '编辑角色' : '新增角色'"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="角色编码" prop="roleCode">
          <el-input
            v-model="form.roleCode"
            :disabled="isBuiltInEdit"
            maxlength="32"
            placeholder="如 AUDITOR，大写字母开头"
            @input="form.roleCode = form.roleCode.toUpperCase()"
          />
          <div v-if="isBuiltInEdit" class="field-hint">内置角色编码不允许修改</div>
        </el-form-item>
        <el-form-item label="角色名称" prop="roleName">
          <el-input v-model="form.roleName" maxlength="64" placeholder="如 审计员" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="formSaving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <!-- ============ 角色授权 ============ -->
    <el-dialog v-model="assignVisible" title="角色授权" width="560px" :close-on-click-modal="false">
      <el-alert
        type="info"
        :closable="false"
        title="授权为覆盖式保存，未勾选的权限将被移除；保存后相关用户需重新登录生效。"
        class="dialog-alert"
      />
      <div class="assign-summary">
        <span>角色：{{ assigningRole?.roleName }}（{{ assigningRole?.roleCode }}）</span>
        <span>已选 {{ checkedCount }} 项</span>
      </div>
      <div v-loading="assignLoading" class="perm-tree-wrapper">
        <el-tree
          ref="treeRef"
          :data="permTree"
          show-checkbox
          node-key="key"
          :props="{ label: 'label', children: 'children' }"
          default-expand-all
          @check="updateCheckedCount"
        />
      </div>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" :loading="assignSaving" @click="submitAssign">保存授权</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, ElTree, type FormInstance, type FormRules } from 'element-plus'
import { permissionApi } from '@/features/admin/api/permissionApi'
import { roleApi } from '@/features/admin/api/roleApi'
import type {
  AdminPermissionVO,
  AdminRoleQuery,
  AdminRoleSaveRequest,
  AdminRoleVO,
} from '@/types/access'
import { formatDateTime } from '@/utils/device'
import ColumnSettings from '@/components/common/ColumnSettings.vue'
import { useColumnSettings, type ColumnOption } from '@/composables/useColumnSettings'

/**
 * ============================================================================
 * 角色管理面板（文档 8.11）
 * ============================================================================
 * 覆盖分页、新增、编辑、启停、删除、覆盖式授权。
 * 内置角色保护在前端显式置灰，后端仍会二次校验（不可依赖前端约束）。
 * ============================================================================
 */
/** 可配置列；操作列固定显示，避免隐藏后失去授权/编辑入口。 */
const ROLE_COLUMNS: ColumnOption[] = [
  { key: 'roleCode', label: '角色编码' },
  { key: 'roleName', label: '角色名称' },
  { key: 'type', label: '类型' },
  { key: 'description', label: '描述' },
  { key: 'userCount', label: '用户数' },
  { key: 'permissionCount', label: '权限数' },
  { key: 'status', label: '状态' },
  { key: 'createTime', label: '创建时间' },
  { key: 'actions', label: '操作', fixed: true },
]

const {
  hidden: hiddenRoleColumns,
  isHidden: isRoleHidden,
  showAll: showAllRoleColumns,
  reset: resetRoleColumns,
} = useColumnSettings('admin-roles', ROLE_COLUMNS)

const roles = ref<AdminRoleVO[]>([])
const total = ref(0)
const loading = ref(false)
const query = reactive<AdminRoleQuery>({ pageNum: 1, pageSize: 10, keyword: '', status: undefined })

const fetchRoles = async () => {
  loading.value = true
  try {
    const res = await roleApi.list({
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      status: query.status,
    })
    roles.value = res.records || []
    total.value = res.total || 0
  } catch {
    roles.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  query.pageNum = 1
  fetchRoles()
}

const handleReset = () => {
  query.keyword = ''
  query.status = undefined
  handleSearch()
}

// ==================== 新增 / 编辑 ====================
const formVisible = ref(false)
const formSaving = ref(false)
const formRef = ref<FormInstance>()
const editingRole = ref<AdminRoleVO | null>(null)
const form = reactive<{ roleCode: string; roleName: string; description: string; status: number }>({
  roleCode: '',
  roleName: '',
  description: '',
  status: 1,
})

/** 内置角色只允许改名称/描述，编码与启停由后端锁定。 */
const isBuiltInEdit = computed(() => editingRole.value?.builtIn === 1)

const formRules: FormRules = {
  roleCode: [
    { required: true, message: '请输入角色编码', trigger: 'blur' },
    {
      pattern: /^[A-Z][A-Z0-9_]{2,31}$/,
      message: '3-32 位，以大写字母开头，仅含大写字母、数字、下划线',
      trigger: 'blur',
    },
  ],
  roleName: [
    { required: true, message: '请输入角色名称', trigger: 'blur' },
    { max: 64, message: '角色名称不能超过 64 位', trigger: 'blur' },
  ],
}

const openCreate = () => {
  editingRole.value = null
  form.roleCode = ''
  form.roleName = ''
  form.description = ''
  form.status = 1
  formVisible.value = true
}

const openEdit = (row: AdminRoleVO) => {
  editingRole.value = row
  form.roleCode = row.roleCode
  form.roleName = row.roleName
  form.description = row.description ?? ''
  form.status = row.status
  formVisible.value = true
}

const submitForm = async () => {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  const payload: AdminRoleSaveRequest = {
    roleCode: form.roleCode.trim(),
    roleName: form.roleName.trim(),
    description: form.description.trim() || undefined,
    status: form.status === 1 ? 1 : 0,
  }

  formSaving.value = true
  try {
    if (editingRole.value) {
      await roleApi.update(editingRole.value.id, payload)
      ElMessage.success('角色已更新')
    } else {
      await roleApi.create(payload)
      ElMessage.success('角色已创建')
    }
    formVisible.value = false
    fetchRoles()
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    formSaving.value = false
  }
}

// ==================== 启停 / 删除 ====================
const handleToggleStatus = (row: AdminRoleVO) => {
  if (row.builtIn === 1) return
  const targetStatus = row.status === 1 ? 0 : 1
  const action = targetStatus === 1 ? '启用' : '禁用'
  ElMessageBox.confirm(`确定${action}角色「${row.roleName}」吗？`, `${action}角色`, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      try {
        await roleApi.updateStatus(row.id, { status: targetStatus === 1 ? 1 : 0 })
        ElMessage.success(`已${action}`)
        fetchRoles()
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

const handleDelete = (row: AdminRoleVO) => {
  if (row.builtIn === 1) return
  ElMessageBox.confirm(
    `确定删除角色「${row.roleName}」吗？若仍有用户绑定该角色，需先解除绑定。`,
    '删除角色',
    { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' },
  )
    .then(async () => {
      try {
        await roleApi.remove(row.id)
        ElMessage.success('角色已删除')
        fetchRoles()
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

// ==================== 角色授权 ====================
interface PermTreeNode {
  key: string
  label: string
  children?: PermTreeNode[]
}

const assignVisible = ref(false)
const assignLoading = ref(false)
const assignSaving = ref(false)
const assigningRole = ref<AdminRoleVO | null>(null)
const allPermissions = ref<AdminPermissionVO[]>([])
const checkStorage = ref<string[]>([])
const treeRef = ref<InstanceType<typeof ElTree>>()

/** 按 resource 分组的授权树：父节点仅用于分组，提交时只取叶子权限 ID。 */
const permTree = computed<PermTreeNode[]>(() => {
  const groups = new Map<string, AdminPermissionVO[]>()
  allPermissions.value.forEach((item) => {
    const resource = item.resource || '其它'
    const list = groups.get(resource)
    if (list) list.push(item)
    else groups.set(resource, [item])
  })

  return [...groups.entries()].map(([resource, items]) => ({
    key: `group-${resource}`,
    label: `${resource}（${items.length}）`,
    children: items.map((item) => ({
      key: `perm-${item.id}`,
      label: `${item.permName}（${item.permCode}）`,
    })),
  }))
})

const checkedCount = computed(() => checkStorage.value.length)

const updateCheckedCount = () => {
  const keys = treeRef.value?.getCheckedKeys(true) ?? []
  checkStorage.value = keys.filter((key) => String(key).startsWith('perm-')) as string[]
}

const openAssign = async (row: AdminRoleVO) => {
  assigningRole.value = row
  assignVisible.value = true
  assignLoading.value = true
  checkStorage.value = []
  try {
    const [permissions, detail] = await Promise.all([permissionApi.all(), roleApi.detail(row.id)])
    allPermissions.value = permissions || []
    await nextTick()
    treeRef.value?.setCheckedKeys((detail.permissionIds || []).map((id) => `perm-${id}`))
    updateCheckedCount()
  } catch {
    assignVisible.value = false
  } finally {
    assignLoading.value = false
  }
}

const submitAssign = async () => {
  if (!assigningRole.value) return
  const permissionIds = (treeRef.value?.getCheckedKeys(true) ?? [])
    .map((key) => String(key))
    .filter((key) => key.startsWith('perm-'))
    .map((key) => Number(key.replace('perm-', '')))
    .filter((id) => Number.isFinite(id))

  assignSaving.value = true
  try {
    await roleApi.updatePermissions(assigningRole.value.id, { permissionIds })
    ElMessage.success('授权已保存')
    assignVisible.value = false
    fetchRoles()
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    assignSaving.value = false
  }
}

onMounted(fetchRoles)
</script>

<style scoped>
.panel-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.field-hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
}
.dialog-alert {
  margin-bottom: 12px;
}
.assign-summary {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 13px;
  color: #606266;
}
.perm-tree-wrapper {
  max-height: 420px;
  overflow: auto;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 8px;
}
</style>
