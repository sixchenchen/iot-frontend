<template>
  <div class="permission-panel">
    <div class="panel-toolbar">
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="关键字">
          <el-input
            v-model="query.keyword"
            placeholder="权限编码/名称"
            clearable
            style="width: 190px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.permType" placeholder="全部" clearable style="width: 110px">
            <el-option
              v-for="item in PERMISSION_TYPE_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="资源">
          <el-input
            v-model="query.resource"
            placeholder="如 device"
            clearable
            style="width: 130px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="全部" clearable style="width: 100px">
            <el-option label="启用" :value="1" />
            <el-option label="禁用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
          <ColumnSettings
            v-model:hidden="hiddenPermissionColumns"
            :columns="PERMISSION_COLUMNS"
            @show-all="showAllPermissionColumns"
            @reset="resetPermissionColumns"
          />
        </el-form-item>
      </el-form>
      <el-button v-permission="'permission:create'" type="primary" @click="openCreate">
        新增权限
      </el-button>
    </div>

    <el-table :data="permissions" v-loading="loading" stripe>
      <template #empty><el-empty description="暂无权限项" :image-size="60" /></template>
      <el-table-column
        v-if="!isPermissionHidden('permCode')"
        prop="permCode"
        label="权限编码"
        min-width="170"
        show-overflow-tooltip
      />
      <el-table-column
        v-if="!isPermissionHidden('permName')"
        prop="permName"
        label="权限名称"
        min-width="140"
      />
      <el-table-column v-if="!isPermissionHidden('type')" label="类型" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="PERMISSION_TYPE_TAG_TYPES[row.permType as PermissionType] || 'info'" size="small">
            {{ PERMISSION_TYPE_LABELS[row.permType as PermissionType] || row.permType }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="!isPermissionHidden('resourceAction')" label="资源 / 动作" width="170">
        <template #default="{ row }">{{ row.resource || '-' }} / {{ row.action || '-' }}</template>
      </el-table-column>
      <el-table-column
        v-if="!isPermissionHidden('description')"
        label="描述"
        min-width="160"
        show-overflow-tooltip
      >
        <template #default="{ row }">{{ row.description || '-' }}</template>
      </el-table-column>
      <el-table-column
        v-if="!isPermissionHidden('roleCount')"
        prop="roleCount"
        label="引用角色"
        width="90"
        align="center"
      />
      <el-table-column v-if="!isPermissionHidden('status')" label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
            {{ row.status === 1 ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="!isPermissionHidden('createTime')" label="创建时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <el-button
            v-permission="'permission:update'"
            link
            type="primary"
            @click="openEdit(row as AdminPermissionVO)"
          >
            编辑
          </el-button>
          <el-button
            v-permission="'permission:update'"
            link
            :type="row.status === 1 ? 'warning' : 'success'"
            @click="handleToggleStatus(row as AdminPermissionVO)"
          >
            {{ row.status === 1 ? '禁用' : '启用' }}
          </el-button>
          <el-button
            v-permission="'permission:delete'"
            link
            type="danger"
            @click="handleDelete(row as AdminPermissionVO)"
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
        @current-change="fetchPermissions"
      />
    </div>

    <!-- ============ 新增/编辑权限 ============ -->
    <el-dialog
      v-model="formVisible"
      :title="editingPermission ? '编辑权限' : '新增权限'"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="权限编码" prop="permCode">
          <el-input
            v-model="form.permCode"
            :disabled="Boolean(editingPermission)"
            maxlength="64"
            placeholder="如 report:export"
            @input="form.permCode = form.permCode.toLowerCase()"
          />
          <div class="field-hint">
            {{
              editingPermission
                ? '权限编码创建后不可修改'
                : '格式 resource:action，小写；资源与动作将按编码自动拆分'
            }}
          </div>
        </el-form-item>
        <el-form-item label="权限名称" prop="permName">
          <el-input v-model="form.permName" maxlength="64" placeholder="如 导出报表" />
        </el-form-item>
        <el-form-item label="权限类型" prop="permType">
          <el-select v-model="form.permType" style="width: 100%">
            <el-option
              v-for="item in PERMISSION_TYPE_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
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
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { permissionApi } from '@/features/admin/api/permissionApi'
import {
  PERMISSION_TYPE_LABELS,
  PERMISSION_TYPE_OPTIONS,
  PERMISSION_TYPE_TAG_TYPES,
  type AdminPermissionQuery,
  type AdminPermissionSaveRequest,
  type AdminPermissionVO,
  type PermissionType,
} from '@/types/access'
import { formatDateTime } from '@/utils/device'
import ColumnSettings from '@/components/common/ColumnSettings.vue'
import { useColumnSettings, type ColumnOption } from '@/composables/useColumnSettings'

/**
 * ============================================================================
 * 权限项管理面板（文档 8.12）
 * ============================================================================
 * 覆盖分页、新增、编辑、启停、删除。
 * 关键约束：
 *   - permCode 创建后不可修改，编辑时输入框禁用；
 *   - resource / action 由后端按 permCode 自动拆分，表单不再重复录入；
 *   - 被角色引用时删除会返回 4022，需先在角色授权中移除。
 * ============================================================================
 */
/** 可配置列；操作列固定显示，避免隐藏后失去编辑/删除入口。 */
const PERMISSION_COLUMNS: ColumnOption[] = [
  { key: 'permCode', label: '权限编码' },
  { key: 'permName', label: '权限名称' },
  { key: 'type', label: '类型' },
  { key: 'resourceAction', label: '资源 / 动作' },
  { key: 'description', label: '描述' },
  { key: 'roleCount', label: '引用角色' },
  { key: 'status', label: '状态' },
  { key: 'createTime', label: '创建时间' },
  { key: 'actions', label: '操作', fixed: true },
]

const {
  hidden: hiddenPermissionColumns,
  isHidden: isPermissionHidden,
  showAll: showAllPermissionColumns,
  reset: resetPermissionColumns,
} = useColumnSettings('admin-permissions', PERMISSION_COLUMNS)

const permissions = ref<AdminPermissionVO[]>([])
const total = ref(0)
const loading = ref(false)
const query = reactive<AdminPermissionQuery>({
  pageNum: 1,
  pageSize: 10,
  keyword: '',
  permType: undefined,
  resource: '',
  status: undefined,
})

const fetchPermissions = async () => {
  loading.value = true
  try {
    const res = await permissionApi.list({
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      keyword: query.keyword?.trim() || undefined,
      permType: query.permType,
      resource: query.resource?.trim() || undefined,
      status: query.status,
    })
    permissions.value = res.records || []
    total.value = res.total || 0
  } catch {
    permissions.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  query.pageNum = 1
  fetchPermissions()
}

const handleReset = () => {
  query.keyword = ''
  query.permType = undefined
  query.resource = ''
  query.status = undefined
  handleSearch()
}

// ==================== 新增 / 编辑 ====================
const formVisible = ref(false)
const formSaving = ref(false)
const formRef = ref<FormInstance>()
const editingPermission = ref<AdminPermissionVO | null>(null)
const form = reactive<{
  permCode: string
  permName: string
  permType: PermissionType
  description: string
  status: number
}>({
  permCode: '',
  permName: '',
  permType: 'API',
  description: '',
  status: 1,
})

const formRules: FormRules = {
  permCode: [
    { required: true, message: '请输入权限编码', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/,
      message: '格式为 resource:action，仅小写字母、数字、下划线或中划线',
      trigger: 'blur',
    },
  ],
  permName: [
    { required: true, message: '请输入权限名称', trigger: 'blur' },
    { max: 64, message: '权限名称不能超过 64 位', trigger: 'blur' },
  ],
  permType: [{ required: true, message: '请选择权限类型', trigger: 'change' }],
}

const openCreate = () => {
  editingPermission.value = null
  form.permCode = ''
  form.permName = ''
  form.permType = 'API'
  form.description = ''
  form.status = 1
  formVisible.value = true
}

const openEdit = (row: AdminPermissionVO) => {
  editingPermission.value = row
  form.permCode = row.permCode
  form.permName = row.permName
  form.permType = row.permType
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

  const payload: AdminPermissionSaveRequest = {
    permCode: form.permCode.trim(),
    permName: form.permName.trim(),
    permType: form.permType,
    description: form.description.trim() || undefined,
    status: form.status === 1 ? 1 : 0,
  }

  formSaving.value = true
  try {
    if (editingPermission.value) {
      await permissionApi.update(editingPermission.value.id, payload)
      ElMessage.success('权限已更新')
    } else {
      await permissionApi.create(payload)
      ElMessage.success('权限已创建')
    }
    formVisible.value = false
    fetchPermissions()
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    formSaving.value = false
  }
}

// ==================== 启停 / 删除 ====================
const handleToggleStatus = (row: AdminPermissionVO) => {
  const targetStatus = row.status === 1 ? 0 : 1
  const action = targetStatus === 1 ? '启用' : '禁用'
  ElMessageBox.confirm(`确定${action}权限「${row.permName}」吗？`, `${action}权限`, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      try {
        await permissionApi.updateStatus(row.id, { status: targetStatus === 1 ? 1 : 0 })
        ElMessage.success(`已${action}`)
        fetchPermissions()
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

const handleDelete = (row: AdminPermissionVO) => {
  ElMessageBox.confirm(
    `确定删除权限「${row.permName}」吗？删除为逻辑删除，若仍被角色引用需先移除授权。`,
    '删除权限',
    { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' },
  )
    .then(async () => {
      try {
        await permissionApi.remove(row.id)
        ElMessage.success('权限已删除')
        fetchPermissions()
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

onMounted(fetchPermissions)
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
</style>
