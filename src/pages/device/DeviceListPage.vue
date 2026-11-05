<template>
  <div class="device-list-page">
    <el-card shadow="never">
      <div class="toolbar">
        <h3>{{ isManageMode ? '设备管理' : '我的设备' }}</h3>
        <div class="actions">
          <template v-if="isManageMode">
            <el-input
              v-model="query.keyword"
              placeholder="搜索设备名称/ID"
              style="width: 240px"
              clearable
              @keyup.enter="handleSearch"
            >
              <template #append>
                <el-button :icon="Search" @click="handleSearch" />
              </template>
            </el-input>
            <el-button v-permission="'device:create'" type="primary" @click="openAddDialog">
              新增设备
            </el-button>
            <el-button :icon="DataLine" @click="openOnlineStats">在线统计</el-button>
            <el-button :icon="Download" :loading="exporting" @click="handleExport">导出 CSV</el-button>
          </template>
          <template v-else>
            <el-button type="primary" @click="openBindDialog">绑定设备</el-button>
          </template>

          <el-tooltip :content="wsTooltip" placement="top">
            <el-tag size="small" :type="wsStatusTagType" effect="plain">
              {{ wsStatusLabel }}
            </el-tag>
          </el-tooltip>
          <el-button :loading="loading" @click="fetchData">刷新</el-button>
        </div>
      </div>

      <el-table :data="tableData" v-loading="loading" stripe style="width: 100%">
        <template #empty>
          <el-empty :description="loadError ? '设备加载失败，请重试' : '暂无设备数据'">
            <el-button v-if="loadError" type="primary" @click="fetchData">重新加载</el-button>
            <el-button v-else-if="!isManageMode" type="primary" @click="openBindDialog">
              去绑定设备
            </el-button>
          </el-empty>
        </template>

        <el-table-column prop="deviceId" label="设备ID (MAC)" width="180" />
        <el-table-column prop="deviceName" label="设备名称" min-width="140">
          <template #default="{ row }">{{ row.deviceName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="product" label="产品型号" width="140">
          <template #default="{ row }">{{ row.product || '-' }}</template>
        </el-table-column>
        <el-table-column prop="firmware" label="固件版本" width="120">
          <template #default="{ row }">{{ row.firmware || '-' }}</template>
        </el-table-column>
        <el-table-column label="在线状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="isDeviceOnline(row.online) ? 'success' : 'info'">
              {{ isDeviceOnline(row.online) ? '在线' : '离线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="实时状态" min-width="220">
          <template #default="{ row }">
            <div v-if="realtimeStore.getStates(row.deviceId).length" class="realtime-states">
              <el-tag
                v-for="item in realtimeStore.getStates(row.deviceId).slice(-4)"
                :key="`${item.target}-${item.channel}`"
                size="small"
                :type="item.state === 1 ? 'success' : 'info'"
              >
                {{ formatStateEntry(item) }}
              </el-tag>
            </div>
            <span v-else class="realtime-empty">等待推送</span>
            <div v-if="getLatestSensorText(row.deviceId)" class="sensor-line">
              {{ getLatestSensorText(row.deviceId) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="OTA 状态" width="120" align="center">
          <template #default="{ row }">
            <span v-if="row.otaState">
              {{ OTA_STATE_LABELS[row.otaState] || row.otaState }}
              <template v-if="row.otaProgress != null">（{{ row.otaProgress }}%）</template>
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="最后心跳时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.lastHeartbeatTime) }}</template>
        </el-table-column>

        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row as Device)">详情</el-button>

            <template v-if="isManageMode">
              <el-button
                v-permission="'device:delete'"
                link
                type="danger"
                @click="handleDelete(row as Device)"
              >
                删除
              </el-button>
            </template>

            <template v-else>
              <el-button
                link
                type="primary"
                :disabled="!isDeviceOnline(row.online)"
                @click="openControl(row as Device)"
              >
                控制
              </el-button>
              <el-button link type="primary" @click="handleOtaCheck(row as Device)">
                检查更新
              </el-button>
              <el-button link type="danger" @click="handleUnbind(row as Device)">解绑</el-button>
            </template>
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
          @current-change="fetchData"
        />
      </div>
    </el-card>

    <!-- ============ 绑定设备（用户端） ============ -->
    <el-dialog v-model="bindVisible" title="绑定设备" width="480px" :close-on-click-modal="false">
      <el-alert
        type="info"
        :closable="false"
        title="请输入设备机身上的 MAC 地址与二维码绑定码，绑定后即可控制该设备。"
        class="dialog-alert"
      />
      <el-form ref="bindFormRef" :model="bindForm" :rules="bindRules" label-width="90px">
        <el-form-item label="设备 MAC" prop="deviceId">
          <el-input
            v-model="bindForm.deviceId"
            placeholder="12 位十六进制，如 B4BFE90CDBA1"
            clearable
          />
        </el-form-item>
        <el-form-item label="绑定码" prop="bindCode">
          <el-input
            v-model="bindForm.bindCode"
            maxlength="6"
            placeholder="机身二维码上的 6 位绑定码"
            clearable
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bindVisible = false">取消</el-button>
        <el-button type="primary" :loading="bindLoading" @click="submitBind">确定绑定</el-button>
      </template>
    </el-dialog>

    <!-- ============ OTA 检查 / 升级（用户端） ============ -->
    <el-dialog v-model="otaVisible" title="固件更新" width="540px">
      <div v-loading="otaLoading" class="ota-body">
        <template v-if="otaResult">
          <el-result
            v-if="!otaResult.hasNewVersion"
            icon="success"
            title="当前已是最新版本"
            sub-title="无需升级"
          />
          <el-descriptions v-else :column="1" border>
            <el-descriptions-item label="设备">
              {{ otaDevice?.deviceName || otaDevice?.deviceId }}
            </el-descriptions-item>
            <el-descriptions-item label="最新版本">
              {{ otaResult.latestVersion || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="固件大小">
              {{ otaResult.size != null ? formatBytes(otaResult.size) : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="更新说明">
              {{ otaResult.releaseNotes || '无' }}
            </el-descriptions-item>
          </el-descriptions>
        </template>
        <el-empty v-else description="正在检查更新" />
      </div>
      <template #footer>
        <el-button @click="otaVisible = false">关闭</el-button>
        <el-button
          v-if="otaResult?.hasNewVersion"
          type="primary"
          :loading="otaLoading"
          @click="handleOtaStart"
        >
          立即升级
        </el-button>
      </template>
    </el-dialog>

    <!-- ============ 新增设备（管理端） ============ -->
    <el-dialog v-model="addVisible" title="新增设备" width="500px" :close-on-click-modal="false">
      <el-form ref="addFormRef" :model="addForm" :rules="addRules" label-width="100px">
        <el-form-item label="设备ID(MAC)" prop="deviceId">
          <el-input v-model="addForm.deviceId" placeholder="如 B4BFE90CDBA1" />
        </el-form-item>
        <el-form-item label="设备名称" prop="deviceName">
          <el-input v-model="addForm.deviceName" placeholder="如 阳台大灯" />
        </el-form-item>
        <el-form-item label="产品型号" prop="product">
          <el-input v-model="addForm.product" placeholder="如 SmartHome-v1" />
        </el-form-item>
        <el-form-item label="设备位置" prop="location">
          <el-input v-model="addForm.location" placeholder="如 一楼阳台" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addVisible = false">取消</el-button>
        <el-button type="primary" :loading="addLoading" @click="submitAdd">确定</el-button>
      </template>
    </el-dialog>

    <!-- ============ 在线统计（管理端） ============ -->
    <el-dialog v-model="statsVisible" title="设备在线统计" width="420px">
      <div v-loading="statsLoading">
        <el-row :gutter="12">
          <el-col :span="6">
            <div class="stat-cell">总数<br /><strong>{{ stats?.total ?? 0 }}</strong></div>
          </el-col>
          <el-col :span="6">
            <div class="stat-cell">在线<br /><strong class="text-success">{{ stats?.online ?? 0 }}</strong></div>
          </el-col>
          <el-col :span="6">
            <div class="stat-cell">离线<br /><strong>{{ stats?.offline ?? 0 }}</strong></div>
          </el-col>
          <el-col :span="6">
            <div class="stat-cell">异常<br /><strong class="text-danger">{{ stats?.abnormal ?? 0 }}</strong></div>
          </el-col>
        </el-row>
        <p class="stats-tip">「异常」表示标记在线但心跳已超时的设备。</p>
      </div>
      <template #footer>
        <el-button @click="statsVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- ============ 控制设备（用户端） ============ -->
    <DeviceControlDialog
      v-model="controlVisible"
      :device="controlDevice"
      mode="user"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DataLine, Download, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { deviceApi } from '@/features/device/api/deviceApi'
import { otaApi } from '@/features/ota/api/otaApi'
import DeviceControlDialog from '@/components/device/DeviceControlDialog.vue'
import { useDeviceRealtimeStore } from '@/stores/useDeviceRealtimeStore'
import type { RealtimeStateEntry } from '@/lib/ws/realtime-state'
import type { DeviceAlertRecord, DeviceSensorRecord } from '@/types/ws'
import type { OtaCheckResponse } from '@/types/ota'
import type { Device, DeviceOnlineStatsVO } from '@/types/device'
import {
  CONTROL_TARGET_LABELS,
  OTA_STATE_LABELS,
  formatBytes,
  formatDateTime,
  isDeviceOnline,
  isValidBindCode,
  isValidMac,
  normalizeMac,
} from '@/utils/device'
import { downloadBlob, timestampedFilename } from '@/utils/download'

/**
 * ============================================================================
 * 设备列表页（同一组件复用于「我的设备」与「设备管理」两种模式）
 * ============================================================================
 * 模式判定：route.name === 'DeviceManage' → 管理端；否则用户端。
 *
 * 本页对接接口：
 *   - 管理端：GET/POST /admin/devices、DELETE /admin/devices/{id}、
 *             GET /admin/devices/online-stats、GET /admin/devices/export
 *   - 用户端：GET /user/devices/my、POST bind/unbind/control
 *   - OTA：GET /user/ota/check/{deviceId}、POST /user/ota/start/{deviceId}
 *
 * 详细状态、指令、传感器、事件、告警与 OTA 记录在「设备详情」页展示，
 * 列表页只负责概览与入口，避免单个页面职责过重。
 * ============================================================================
 */
const route = useRoute()
const router = useRouter()
const isManageMode = computed(() => route.name === 'DeviceManage')
const realtimeStore = useDeviceRealtimeStore()

const loading = ref(false)
const loadError = ref(false)
const tableData = ref<Device[]>([])
const total = ref(0)

const query = reactive({
  pageNum: 1,
  pageSize: 10,
  keyword: '',
})

const fetchData = async () => {
  loading.value = true
  loadError.value = false
  try {
    const res = isManageMode.value
      ? await deviceApi.listManage({
          pageNum: query.pageNum,
          pageSize: query.pageSize,
          keyword: query.keyword.trim() || undefined,
        })
      : await deviceApi.listMine({ pageNum: query.pageNum, pageSize: query.pageSize })

    tableData.value = res.records || []
    total.value = res.total || 0
    realtimeStore.syncDevices(tableData.value.map((item) => item.deviceId))
  } catch {
    // 失败提示由统一请求层弹出，这里只切换到「加载失败」空态。
    tableData.value = []
    total.value = 0
    loadError.value = true
    realtimeStore.syncDevices([])
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  query.pageNum = 1
  fetchData()
}

// ==================== 导出 / 在线统计（管理端） ====================
const exporting = ref(false)

const handleExport = async () => {
  exporting.value = true
  try {
    const blob = await deviceApi.exportCsv({ keyword: query.keyword.trim() || undefined })
    downloadBlob(blob, timestampedFilename('devices', 'csv'))
    ElMessage.success('导出成功')
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    exporting.value = false
  }
}

const statsVisible = ref(false)
const statsLoading = ref(false)
const stats = ref<DeviceOnlineStatsVO | null>(null)

const openOnlineStats = async () => {
  statsVisible.value = true
  statsLoading.value = true
  try {
    stats.value = await deviceApi.onlineStats()
  } catch {
    stats.value = null
  } finally {
    statsLoading.value = false
  }
}

// ==================== WebSocket 实时状态 ====================
const wsStatusLabel = computed(() => {
  switch (realtimeStore.connectionStatus) {
    case 'connected':
      return '实时已连接'
    case 'connecting':
      return '实时连接中'
    case 'reconnecting':
      return '实时重连中'
    case 'disabled':
      return '实时未启用'
    case 'disconnected':
      return '实时已断开'
    default:
      return '实时未连接'
  }
})

const wsStatusTagType = computed<'success' | 'warning' | 'info'>(() => {
  switch (realtimeStore.connectionStatus) {
    case 'connected':
      return 'success'
    case 'connecting':
    case 'reconnecting':
      return 'warning'
    default:
      return 'info'
  }
})

const wsTooltip = computed(() => {
  switch (realtimeStore.connectionStatus) {
    case 'connected':
      return realtimeStore.lastMessageAt
        ? `实时通道已连接，最近推送 ${formatTime(realtimeStore.lastMessageAt)}`
        : '实时通道已连接，等待设备推送'
    case 'reconnecting':
      return '实时通道已断开，正在按指数退避自动重连'
    case 'disabled':
      return '未配置 VITE_WS_URL，实时状态未启用'
    default:
      return '实时状态通过 STOMP /topic/device/{MAC}/state 推送'
  }
})

const formatTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })

const formatStateEntry = (entry: RealtimeStateEntry): string => {
  const label = CONTROL_TARGET_LABELS[entry.target] || entry.target
  const channel = entry.channel != null ? `#${entry.channel}` : ''
  return `${label}${channel} = ${entry.state}`
}

const sensorText = (sensor: DeviceSensorRecord): string => {
  const name = sensor.sensorKey || sensor.sensorType || '传感器'
  return `${name} ${sensor.sensorValue}${sensor.unit || ''}`
}

const getLatestSensorText = (deviceId: string): string => {
  const sensor = realtimeStore.getLatestSensor(deviceId)
  return sensor ? sensorText(sensor) : ''
}

const alertText = (alert: DeviceAlertRecord): string => {
  if (alert.message) return alert.message
  return `${alert.sensorKey || '设备'} ${alert.alertType || '告警'}`
}

// ==================== 删除（管理端） ====================
const handleDelete = (row: Device) => {
  ElMessageBox.confirm(
    `确定要删除设备 "${row.deviceName || row.deviceId}" 吗？删除后已绑定用户会失去该设备。`,
    '删除设备',
    { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' },
  )
    .then(async () => {
      try {
        await deviceApi.deleteDevice(row.id)
        ElMessage.success('删除成功')
        fetchData()
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

// ==================== 新增（管理端） ====================
const addVisible = ref(false)
const addLoading = ref(false)
const addFormRef = ref<FormInstance>()
const addForm = reactive({
  deviceId: '',
  deviceName: '',
  product: '',
  location: '',
})

const addRules: FormRules = {
  deviceId: [
    {
      validator: (_rule, value: string, callback: (error?: Error) => void) => {
        if (!value) return callback(new Error('请输入设备 MAC 地址'))
        if (!isValidMac(value)) return callback(new Error('MAC 格式错误（需 12 位十六进制）'))
        callback()
      },
      trigger: 'blur',
    },
  ],
}

const openAddDialog = () => {
  addForm.deviceId = ''
  addForm.deviceName = ''
  addForm.product = ''
  addForm.location = ''
  addVisible.value = true
}

const submitAdd = async () => {
  if (!addFormRef.value) return
  try {
    await addFormRef.value.validate()
  } catch {
    return
  }

  addLoading.value = true
  try {
    await deviceApi.addDevice({
      deviceId: normalizeMac(addForm.deviceId),
      deviceName: addForm.deviceName || undefined,
      product: addForm.product || undefined,
      location: addForm.location || undefined,
    })
    ElMessage.success('新增设备成功')
    addVisible.value = false
    fetchData()
  } catch {
    // 4204/4212 由统一请求层提示
  } finally {
    addLoading.value = false
  }
}

// ==================== 绑定（用户端） ====================
const bindVisible = ref(false)
const bindLoading = ref(false)
const bindFormRef = ref<FormInstance>()
const bindForm = reactive({
  deviceId: '',
  bindCode: '',
})

const bindRules: FormRules = {
  deviceId: [
    {
      validator: (_rule, value: string, callback: (error?: Error) => void) => {
        if (!value) return callback(new Error('请输入设备 MAC 地址'))
        if (!isValidMac(value)) return callback(new Error('MAC 格式错误（需 12 位十六进制）'))
        callback()
      },
      trigger: 'blur',
    },
  ],
  bindCode: [
    {
      validator: (_rule, value: string, callback: (error?: Error) => void) => {
        if (!value) return callback(new Error('请输入绑定码'))
        if (!isValidBindCode(value)) return callback(new Error('绑定码为 6 位字母或数字'))
        callback()
      },
      trigger: 'blur',
    },
  ],
}

const openBindDialog = () => {
  bindForm.deviceId = ''
  bindForm.bindCode = ''
  bindVisible.value = true
}

const submitBind = async () => {
  if (!bindFormRef.value) return
  try {
    await bindFormRef.value.validate()
  } catch {
    return
  }

  bindLoading.value = true
  try {
    await deviceApi.bindDevice({
      deviceId: normalizeMac(bindForm.deviceId),
      bindCode: bindForm.bindCode.trim(),
    })
    ElMessage.success('设备绑定成功')
    bindVisible.value = false
    handleSearch()
  } catch {
    // 4205/4206/4207 由统一请求层提示
  } finally {
    bindLoading.value = false
  }
}

// ==================== 解绑（用户端） ====================
const handleUnbind = (row: Device) => {
  ElMessageBox.confirm(
    `确定要解绑设备 "${row.deviceName || row.deviceId}" 吗？解绑后将无法继续控制该设备。`,
    '解绑设备',
    { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' },
  )
    .then(async () => {
      try {
        await deviceApi.unbindDevice({ deviceId: row.deviceId })
        ElMessage.success('已解绑设备')
        fetchData()
      } catch {
        // 4209 由统一请求层提示
      }
    })
    .catch(() => undefined)
}

// ==================== 控制（用户端） ====================
const controlVisible = ref(false)
const controlDevice = ref<Device | null>(null)

const openControl = (row: Device) => {
  if (!isDeviceOnline(row.online)) {
    ElMessage.warning('设备当前离线，请检查电源后重试')
    return
  }
  controlDevice.value = row
  controlVisible.value = true
}

// ==================== OTA（用户端） ====================
const otaVisible = ref(false)
const otaLoading = ref(false)
const otaDevice = ref<Device | null>(null)
const otaResult = ref<OtaCheckResponse | null>(null)

const handleOtaCheck = async (row: Device) => {
  otaDevice.value = row
  otaResult.value = null
  otaVisible.value = true
  otaLoading.value = true
  try {
    otaResult.value = await otaApi.check(row.deviceId)
  } catch {
    // 4200/4210/4104/4302 由统一请求层提示；关闭弹窗避免停留在空态
    otaVisible.value = false
  } finally {
    otaLoading.value = false
  }
}

const handleOtaStart = async () => {
  if (!otaDevice.value) return
  otaLoading.value = true
  try {
    await otaApi.start(otaDevice.value.deviceId)
    ElMessage.success('升级指令已下发，进度将在设备状态更新后同步')
    otaVisible.value = false
  } catch {
    // 4201/4300/4301/4302/4303 由统一请求层提示
  } finally {
    otaLoading.value = false
  }
}

// ==================== 详情 ====================
const openDetail = (row: Device) => {
  if (isManageMode.value) {
    router.push({ name: 'AdminDeviceDetail', params: { id: row.id } })
  } else {
    router.push({ name: 'UserDeviceDetail', params: { deviceId: row.deviceId } })
  }
}

// 路由切换（我的设备 ↔ 设备管理）时重置页码并重新加载。
watch(
  () => route.name,
  (newName) => {
    if (newName === 'DeviceManage' || newName === 'MyDevices') {
      query.pageNum = 1
      query.keyword = ''
      fetchData()
    }
  },
  { immediate: true },
)

// 进入设备页建立实时连接；离开时断开，避免后台空转消耗连接与心跳。
onMounted(() => {
  realtimeStore.connect()
})

onUnmounted(() => {
  realtimeStore.disconnect()
})

// 新的告警通过 WebSocket 推送到达时给出轻提示（数据同时保留在设备详情页）。
watch(
  () => realtimeStore.lastAlertAt,
  () => {
    const alert = realtimeStore.lastAlert
    if (!alert) return
    ElMessage({
      type: 'warning',
      message: `设备告警：${alertText(alert)}`,
      duration: 5000,
      grouping: true,
    })
  },
)
</script>

<style scoped>
.device-list-page {
  padding: 10px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 12px;
  flex-wrap: wrap;
}
.toolbar h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
.dialog-alert {
  margin-bottom: 16px;
}
.ota-body {
  min-height: 160px;
}
.realtime-states {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.realtime-empty {
  font-size: 12px;
  color: #909399;
}
.sensor-line {
  margin-top: 4px;
  font-size: 12px;
  color: #606266;
}
.stat-cell {
  padding: 14px 8px;
  text-align: center;
  background: #f5f7fa;
  border-radius: 6px;
  font-size: 13px;
  color: #606266;
}
.stat-cell strong {
  display: block;
  margin-top: 6px;
  font-size: 22px;
  color: #303133;
}
.text-success {
  color: #67c23a !important;
}
.text-danger {
  color: #f56c6c !important;
}
.stats-tip {
  margin: 14px 0 0;
  font-size: 12px;
  color: #909399;
}
</style>
