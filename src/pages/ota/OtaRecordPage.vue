<template>
  <div class="ota-record-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <h3>升级记录</h3>
          <el-button :loading="recordsLoading" @click="loadRecords">刷新</el-button>
        </div>
      </template>

      <el-form :inline="true" class="filter-form" @submit.prevent>
        <el-form-item label="设备">
          <el-select
            v-model="selectedDeviceId"
            placeholder="请选择设备"
            filterable
            style="width: 260px"
            @change="handleDeviceChange"
          >
            <el-option
              v-for="item in devices"
              :key="item.deviceId"
              :label="`${item.deviceName || item.deviceId} (${item.deviceId})`"
              :value="item.deviceId"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <ColumnSettings
            v-model:hidden="hiddenColumns"
            :columns="OTA_RECORD_COLUMNS"
            @show-all="showAllColumns"
            @reset="resetColumns"
          />
        </el-form-item>
      </el-form>

      <el-alert
        v-if="!devices.length && !devicesLoading"
        type="warning"
        :closable="false"
        title="当前账号还没有绑定设备，请先在「我的设备」页绑定。"
        class="page-alert"
      />

      <template v-if="selectedDeviceId">
        <el-card shadow="never" class="progress-card">
          <div class="progress-header">
            <span>当前 OTA 状态</span>
            <el-tag v-if="progress?.otaState" :type="progressTagType">
              {{
                progress.otaStateText ||
                OTA_STATE_LABELS[progress.otaState] ||
                progress.otaState
              }}
            </el-tag>
            <el-tag v-else type="info">无进行中的升级</el-tag>
            <el-tag v-if="progress?.running" type="warning" effect="plain" size="small">
              升级进行中
            </el-tag>
          </div>
          <el-progress
            :percentage="Math.min(Math.max(progress?.otaProgress ?? 0, 0), 100)"
            :status="progress?.otaState === 'failed' ? 'exception' : undefined"
          />
          <div class="progress-meta">
            目标版本：{{ progress?.otaVersion || '-' }} ·
            {{ formatDateTime(progress?.otaUpdateTime) }}
          </div>
          <div v-if="progress?.errorMsg" class="progress-meta progress-error">
            {{ progress.errorMsg }}
          </div>
        </el-card>

        <el-table :data="records" v-loading="recordsLoading" stripe>
          <template #empty><el-empty description="暂无升级记录" :image-size="60" /></template>
          <el-table-column v-if="!isHidden('version')" prop="version" label="目标版本" width="120" />
          <el-table-column
            v-if="!isHidden('commandStatus')"
            label="指令状态"
            width="110"
            align="center"
          >
            <template #default="{ row }">
              <el-tag :type="COMMAND_STATUS_TAG_TYPES[row.status] || 'info'" size="small">
                {{ row.statusText || COMMAND_STATUS_LABELS[row.status] || row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column v-if="!isHidden('otaState')" label="OTA 阶段" width="110">
            <template #default="{ row }">
              {{ row.otaState ? OTA_STATE_LABELS[row.otaState] || row.otaState : '-' }}
            </template>
          </el-table-column>
          <el-table-column v-if="!isHidden('progress')" label="进度" width="110">
            <template #default="{ row }">{{ row.progress ?? 0 }}%</template>
          </el-table-column>
          <el-table-column
            v-if="!isHidden('errorMsg')"
            prop="errorMsg"
            label="失败原因"
            min-width="180"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.errorMsg || '-' }}</template>
          </el-table-column>
          <el-table-column v-if="!isHidden('createTime')" label="创建时间" width="170">
            <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="[3, 4, 5].includes(row.status)"
                link
                type="primary"
                @click="handleRetry"
              >
                重试
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
            @current-change="loadRecords"
          />
        </div>
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { deviceApi } from '@/features/device/api/deviceApi'
import { otaApi } from '@/features/ota/api/otaApi'
import { useDeviceRealtimeStore } from '@/stores/useDeviceRealtimeStore'
import type { Device } from '@/types/device'
import type { OtaProgressVO, OtaRecordVO } from '@/types/ota'
import { OTA_STATE_LABELS, formatDateTime } from '@/utils/device'
import { COMMAND_STATUS_LABELS, COMMAND_STATUS_TAG_TYPES } from '@/utils/status'
import ColumnSettings from '@/components/common/ColumnSettings.vue'
import { useColumnSettings, type ColumnOption } from '@/composables/useColumnSettings'

/**
 * ============================================================================
 * 用户 OTA 升级记录
 * ============================================================================
 * devices 来自 GET /user/devices/my（pageSize 100，足以覆盖个人设备）。
 * 记录接口 deviceId 必填，因此未选择设备时不发请求。
 *
 * 实时策略
 *   1. WS 推送 `ota_progress` 为主，进度即时刷新，无需手动点「刷新」；
 *   2. REST `GET /user/ota/progress/{deviceId}` 作为兜底快照（弱网/未连上时）；
 *   3. 合并规则：WS 已进入终态优先；否则取进度更大者，避免旧快照覆盖新进度；
 *   4. 终态到达后自动刷新升级记录列表，并断开该页额外的订阅依赖（页面卸载时统一断开）。
 * ============================================================================
 */

/** 可配置列；操作列固定显示。 */
const OTA_RECORD_COLUMNS: ColumnOption[] = [
  { key: 'version', label: '目标版本' },
  { key: 'commandStatus', label: '指令状态' },
  { key: 'otaState', label: 'OTA 阶段' },
  { key: 'progress', label: '进度' },
  { key: 'errorMsg', label: '失败原因' },
  { key: 'createTime', label: '创建时间' },
  { key: 'actions', label: '操作', fixed: true },
]

const {
  hidden: hiddenColumns,
  isHidden,
  showAll: showAllColumns,
  reset: resetColumns,
} = useColumnSettings('ota-records', OTA_RECORD_COLUMNS)

const realtimeStore = useDeviceRealtimeStore()
const devices = ref<Device[]>([])
const devicesLoading = ref(false)
const selectedDeviceId = ref('')

const records = ref<OtaRecordVO[]>([])
const total = ref(0)
const recordsLoading = ref(false)
const progress = ref<OtaProgressVO | null>(null)
const query = reactive({ pageNum: 1, pageSize: 10 })

/** 当前选中设备的实时 OTA 进度（无推送时为 null，回退 REST 快照）。 */
const realtimeProgress = computed(() => realtimeStore.getOtaProgress(selectedDeviceId.value))

/**
 * 快照 / 实时合并：终态优先，其次进度更大者。
 * 避免页面刷新拿到的旧快照把 WS 已推送的更新进度覆盖回去。
 *
 * 注意：后端在指令 TIMEOUT 时会清空 device_info 的 OTA 字段且**不推送**，
 * 因此 REST 返回 `otaState=null` 时以快照为准，防止页面永久停留在「升级中」。
 */
const applySnapshot = (snapshot: OtaProgressVO | null) => {
  if (snapshot && !snapshot.otaState) {
    progress.value = null
    return
  }

  const pushed = realtimeProgress.value
  if (!pushed) {
    progress.value = snapshot
    return
  }
  if (
    !snapshot ||
    pushed.finished ||
    (!snapshot.finished && (pushed.otaProgress ?? 0) >= (snapshot.otaProgress ?? 0))
  ) {
    progress.value = pushed
    return
  }
  progress.value = snapshot
}

/** 实时推送驱动的进度刷新：终态时同步刷新记录列表。 */
watch(realtimeProgress, (pushed) => {
  if (!pushed) return
  applySnapshot(pushed)
  if (pushed.finished) void loadRecords()
})

/**
 * 升级进行中兜底轮询（文档 11.5）：WS 为主通道，每 2s 拉一次 /progress。
 * 覆盖指令 TIMEOUT（后端清空 OTA 字段且不推送）与断线期间丢失的阶段。
 */
const OTA_FALLBACK_POLL_INTERVAL = 2000
let fallbackTimer: ReturnType<typeof setTimeout> | null = null

const stopFallbackPolling = () => {
  if (fallbackTimer) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }
}

const pollProgressFallback = async () => {
  fallbackTimer = null
  if (!selectedDeviceId.value) return

  try {
    applySnapshot(await otaApi.progress(selectedDeviceId.value))
  } catch {
    // 单次失败不终止轮询，由下一次重试继续
  }

  const current = progress.value
  if (current?.finished) void loadRecords()
  if (current?.running) scheduleFallbackPolling()
}

function scheduleFallbackPolling() {
  if (fallbackTimer) return
  fallbackTimer = setTimeout(() => void pollProgressFallback(), OTA_FALLBACK_POLL_INTERVAL)
}

/** 仅在升级进行中才启动兜底轮询，终态立即停止，避免无意义的空转请求。 */
watch(
  () => progress.value?.running === true,
  (running) => {
    if (running) scheduleFallbackPolling()
    else stopFallbackPolling()
  },
)

/** 断线重连后先拉一次快照补齐丢失的阶段（文档 11.4 / 11.5）。 */
let wsEverConnected = false
watch(
  () => realtimeStore.connectionStatus,
  (status) => {
    if (status !== 'connected') return
    if (wsEverConnected) void loadProgress()
    wsEverConnected = true
  },
)

const progressTagType = computed<'success' | 'warning' | 'danger' | 'info'>(() => {
  const state = progress.value?.otaState
  if (state === 'success') return 'success'
  if (state === 'failed') return 'danger'
  if (state) return 'warning'
  return 'info'
})

const loadDevices = async () => {
  devicesLoading.value = true
  try {
    const res = await deviceApi.listMine({ pageNum: 1, pageSize: 100 })
    devices.value = res.records || []
    const first = devices.value[0]
    if (!selectedDeviceId.value && first) {
      selectedDeviceId.value = first.deviceId
    }
  } catch {
    devices.value = []
  } finally {
    devicesLoading.value = false
  }
}

const loadProgress = async () => {
  if (!selectedDeviceId.value) return
  try {
    applySnapshot(await otaApi.progress(selectedDeviceId.value))
  } catch {
    // 兜底快照失败时保留 WS 已推送的数据，避免进度卡片闪回空态。
    if (!realtimeProgress.value) progress.value = null
  }
}

const loadRecords = async () => {
  if (!selectedDeviceId.value) return
  recordsLoading.value = true
  try {
    const res = await otaApi.records({
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      deviceId: selectedDeviceId.value,
    })
    records.value = res.records || []
    total.value = res.total || 0
  } catch {
    records.value = []
    total.value = 0
  } finally {
    recordsLoading.value = false
  }
}

const handleSearch = () => {
  query.pageNum = 1
  loadRecords()
}

const handleDeviceChange = async () => {
  query.pageNum = 1
  // 切换设备时先登记订阅，保证后续 ACK/进度推送不丢失（未连接时仅登记）。
  if (selectedDeviceId.value) realtimeStore.syncDevices([selectedDeviceId.value])
  // 清空上一台设备的进度并停止兜底轮询，避免串号展示。
  stopFallbackPolling()
  progress.value = null
  await Promise.all([loadProgress(), loadRecords()])
}

const handleRetry = async () => {
  try {
    await otaApi.retry(selectedDeviceId.value)
    ElMessage.success('重试指令已下发')
    await handleDeviceChange()
  } catch {
    // 失败原因由统一请求层提示
  }
}

onMounted(async () => {
  realtimeStore.connect()
  await loadDevices()
  if (!selectedDeviceId.value) return
  await handleDeviceChange()
})

onUnmounted(() => {
  stopFallbackPolling()
  realtimeStore.disconnect()
})
</script>

<style scoped>
.ota-record-page {
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
.filter-form {
  margin-bottom: 8px;
}
.page-alert {
  margin-bottom: 16px;
}
.progress-card {
  margin-bottom: 16px;
  background: #fafbfc;
}
.progress-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 14px;
  color: #303133;
}
.progress-meta {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}
.progress-error {
  color: #f56c6c;
}
.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
