<template>
  <div class="admin-device-detail-page">
    <el-card v-loading="loading" shadow="never">
      <template #header>
        <div class="toolbar">
          <div class="title-block">
            <el-button link :icon="ArrowLeft" @click="goBack">返回</el-button>
            <h3>{{ detail?.deviceName || detail?.deviceId || '设备详情' }}</h3>
            <el-tag v-if="detail" :type="online ? 'success' : 'info'" size="small">
              {{ online ? '在线' : '离线' }}
            </el-tag>
          </div>
          <div class="actions">
            <el-button type="primary" :disabled="!detail" @click="controlVisible = true">
              下发指令
            </el-button>
            <el-button :disabled="!detail" @click="openEditDialog">编辑设备</el-button>
            <el-button :loading="loading" @click="refresh">刷新</el-button>
          </div>
        </div>
      </template>

      <template v-if="detail">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="数据库 ID">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="设备 MAC">{{ detail.deviceId }}</el-descriptions-item>
          <el-descriptions-item label="产品型号">{{ detail.product || '-' }}</el-descriptions-item>
          <el-descriptions-item label="固件版本">{{ detail.firmware || '-' }}</el-descriptions-item>
          <el-descriptions-item label="安装位置">{{ detail.location || '-' }}</el-descriptions-item>
          <el-descriptions-item label="绑定码">{{ detail.bindCode || '-' }}</el-descriptions-item>
          <el-descriptions-item label="最后心跳">
            {{ formatDateTime(detail.lastHeartbeatTime) }}
          </el-descriptions-item>
          <el-descriptions-item label="最后在线">
            {{ formatDateTime(detail.lastOnlineTime) }}
          </el-descriptions-item>
          <el-descriptions-item label="离线原因">{{ detail.offlineReason || '-' }}</el-descriptions-item>
          <el-descriptions-item label="运行时长">{{ formatUptime(detail.uptime) }}</el-descriptions-item>
          <el-descriptions-item label="配置版本">{{ detail.configVersion ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDateTime(detail.createTime) }}
          </el-descriptions-item>
        </el-descriptions>

        <DeviceStatePanel
          :device="detail"
          :states="realtimeStates"
          :live="realtimeConnected"
          mode="admin"
        />
      </template>

      <div class="bindings-block">
        <div class="section-header">
          <h4>绑定用户</h4>
          <div>
            <ColumnSettings
              v-model:hidden="hiddenBindingColumns"
              :columns="BINDING_COLUMNS"
              @show-all="showAllBindingColumns"
              @reset="resetBindingColumns"
            />
            <el-button size="small" :loading="bindingsLoading" @click="loadBindings">刷新</el-button>
          </div>
        </div>
        <el-table :data="bindings" v-loading="bindingsLoading" stripe>
          <template #empty><el-empty description="当前无绑定用户" :image-size="60" /></template>
          <el-table-column v-if="!isBindingHidden('username')" prop="username" label="用户名" min-width="140" />
          <el-table-column v-if="!isBindingHidden('nickname')" label="昵称" min-width="140">
            <template #default="{ row }">{{ row.nickname || '-' }}</template>
          </el-table-column>
          <el-table-column v-if="!isBindingHidden('bindTime')" label="绑定时间" width="180">
            <template #default="{ row }">{{ formatDateTime(row.bindTime) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="canUnbind"
                link
                type="danger"
                @click="handleUnbind(row as DeviceBindingVO)"
              >
                强制解绑
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-container">
          <el-pagination
            v-model:current-page="bindingQuery.pageNum"
            v-model:page-size="bindingQuery.pageSize"
            :total="bindingTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @size-change="handleBindingSearch"
            @current-change="loadBindings"
          />
        </div>
      </div>
    </el-card>

    <DeviceControlDialog
      v-model="controlVisible"
      :device="detail"
      mode="admin"
      @success="handleCommandSuccess"
    />

    <el-dialog
      v-model="editVisible"
      title="编辑设备"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-width="90px">
        <el-form-item label="设备名称" prop="deviceName">
          <el-input v-model="editForm.deviceName" maxlength="64" clearable />
        </el-form-item>
        <el-form-item label="产品型号" prop="product">
          <el-input v-model="editForm.product" maxlength="64" clearable />
        </el-form-item>
        <el-form-item label="安装位置" prop="location">
          <el-input v-model="editForm.location" maxlength="128" clearable />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { deviceApi } from '@/features/device/api/deviceApi'
import DeviceControlDialog from '@/components/device/DeviceControlDialog.vue'
import DeviceStatePanel from '@/components/device/DeviceStatePanel.vue'
import { useDeviceRealtimeStore } from '@/stores/useDeviceRealtimeStore'
import type {
  AdminDeviceUpdateRequest,
  Device,
  DeviceBindingVO,
} from '@/types/device'
import { formatDateTime, formatUptime, isDeviceOnline } from '@/utils/device'
import { useAuthStore } from '@/stores/useAuthStore'
import ColumnSettings from '@/components/common/ColumnSettings.vue'
import { useColumnSettings, type ColumnOption } from '@/composables/useColumnSettings'

/**
 * ============================================================================
 * 管理端设备详情页（文档 8.7）
 * ============================================================================
 * 覆盖 GET/PUT /admin/devices/{id}、GET/POST bindings 解绑、
 * POST /admin/devices/{id}/command。
 *
 * 解绑按钮受 device:unbind 权限码控制（v-permission 只能用于按钮组件，
 * 这里在表格内使用函数判断，避免指令在表格插槽内失效）。
 * ============================================================================
 */
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const realtimeStore = useDeviceRealtimeStore()

/** 列配置（storageKey: admin-device-bindings）；操作列固定显示，避免隐藏后无法操作。 */
const BINDING_COLUMNS: ColumnOption[] = [
  { key: 'username', label: '用户名' },
  { key: 'nickname', label: '昵称' },
  { key: 'bindTime', label: '绑定时间' },
  { key: 'actions', label: '操作', fixed: true },
]

const {
  hidden: hiddenBindingColumns,
  isHidden: isBindingHidden,
  showAll: showAllBindingColumns,
  reset: resetBindingColumns,
} = useColumnSettings('admin-device-bindings', BINDING_COLUMNS)

const deviceRowId = computed(() => Number(route.params.id))
const detail = ref<Device | null>(null)
const loading = ref(false)
const controlVisible = ref(false)
const online = computed(() => isDeviceOnline(detail.value?.online))
/** 管理端同样合并 /state 实时增量，便于联调时观察设备真实执行结果。 */
const realtimeStates = computed(() => realtimeStore.getStates(detail.value?.deviceId ?? ''))
const realtimeConnected = computed(() => realtimeStore.connectionStatus === 'connected')
const canUnbind = computed(() => authStore.hasPermission('device:unbind'))

const goBack = () => {
  router.push({ name: 'DeviceManage' })
}

const refresh = async () => {
  if (!Number.isInteger(deviceRowId.value)) {
    ElMessage.error('设备 ID 不合法')
    return
  }
  loading.value = true
  try {
    detail.value = await deviceApi.detailManage(deviceRowId.value)
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
  loadBindings()
}

// ==================== 绑定用户 ====================
const bindings = ref<DeviceBindingVO[]>([])
const bindingTotal = ref(0)
const bindingsLoading = ref(false)
const bindingQuery = reactive({ pageNum: 1, pageSize: 10 })

const loadBindings = async () => {
  if (!Number.isInteger(deviceRowId.value)) return
  bindingsLoading.value = true
  try {
    const res = await deviceApi.listBindings(deviceRowId.value, { ...bindingQuery })
    bindings.value = res.records || []
    bindingTotal.value = res.total || 0
  } catch {
    bindings.value = []
    bindingTotal.value = 0
  } finally {
    bindingsLoading.value = false
  }
}

const handleBindingSearch = () => {
  bindingQuery.pageNum = 1
  loadBindings()
}

const handleUnbind = (row: DeviceBindingVO) => {
  ElMessageBox.confirm(
    `确定解除用户「${row.nickname || row.username}」与该设备的绑定吗？解绑后可转绑其他用户。`,
    '强制解绑',
    { confirmButtonText: '确定解绑', cancelButtonText: '取消', type: 'warning' },
  )
    .then(async () => {
      try {
        await deviceApi.unbindUser(deviceRowId.value, { userId: row.userId })
        ElMessage.success('已解绑')
        loadBindings()
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
const editForm = reactive({ deviceName: '', product: '', location: '' })

const editRules: FormRules = {
  deviceName: [{ max: 64, message: '设备名称不能超过 64 位', trigger: 'blur' }],
  product: [{ max: 64, message: '产品型号不能超过 64 位', trigger: 'blur' }],
  location: [{ max: 128, message: '位置不能超过 128 位', trigger: 'blur' }],
}

const openEditDialog = () => {
  editForm.deviceName = detail.value?.deviceName ?? ''
  editForm.product = detail.value?.product ?? ''
  editForm.location = detail.value?.location ?? ''
  editVisible.value = true
}

const submitEdit = async () => {
  if (!editFormRef.value) return
  try {
    await editFormRef.value.validate()
  } catch {
    return
  }

  const payload: AdminDeviceUpdateRequest = {
    deviceName: editForm.deviceName.trim() || undefined,
    product: editForm.product.trim() || undefined,
    location: editForm.location.trim() || undefined,
  }

  editSaving.value = true
  try {
    await deviceApi.updateDevice(deviceRowId.value, payload)
    ElMessage.success('设备已更新')
    editVisible.value = false
    refresh()
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    editSaving.value = false
  }
}

const handleCommandSuccess = () => {
  ElMessage.success('指令已提交')
}

onMounted(async () => {
  realtimeStore.connect()
  await refresh()
  if (detail.value) realtimeStore.syncDevices([detail.value.deviceId])
})

onUnmounted(() => {
  realtimeStore.disconnect()
})
</script>

<style scoped>
.admin-device-detail-page {
  padding: 10px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.title-block {
  display: flex;
  align-items: center;
  gap: 10px;
}
.title-block h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.bindings-block {
  margin-top: 24px;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.section-header h4 {
  margin: 0;
  font-size: 15px;
  color: #303133;
}
.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
