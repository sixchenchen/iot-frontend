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
              {{ OTA_STATE_LABELS[progress.otaState] || progress.otaState }}
            </el-tag>
            <el-tag v-else type="info">无进行中的升级</el-tag>
          </div>
          <el-progress
            :percentage="Math.min(Math.max(progress?.otaProgress ?? 0, 0), 100)"
            :status="progress?.otaState === 'failed' ? 'exception' : undefined"
          />
          <div class="progress-meta">
            目标版本：{{ progress?.otaVersion || '-' }} ·
            {{ formatDateTime(progress?.updateTime) }}
          </div>
        </el-card>

        <el-table :data="records" v-loading="recordsLoading" stripe>
          <template #empty><el-empty description="暂无升级记录" :image-size="60" /></template>
          <el-table-column prop="version" label="目标版本" width="120" />
          <el-table-column label="指令状态" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="COMMAND_STATUS_TAG_TYPES[row.status] || 'info'" size="small">
                {{ row.statusText || COMMAND_STATUS_LABELS[row.status] || row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="OTA 阶段" width="110">
            <template #default="{ row }">
              {{ row.otaState ? OTA_STATE_LABELS[row.otaState] || row.otaState : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="进度" width="110">
            <template #default="{ row }">{{ row.progress ?? 0 }}%</template>
          </el-table-column>
          <el-table-column prop="errorMsg" label="失败原因" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.errorMsg || '-' }}</template>
          </el-table-column>
          <el-table-column label="创建时间" width="170">
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
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { deviceApi } from '@/features/device/api/deviceApi'
import { otaApi } from '@/features/ota/api/otaApi'
import type { Device } from '@/types/device'
import type { OtaProgressVO, OtaRecordVO } from '@/types/ota'
import { OTA_STATE_LABELS, formatDateTime } from '@/utils/device'
import { COMMAND_STATUS_LABELS, COMMAND_STATUS_TAG_TYPES } from '@/utils/status'

/**
 * ============================================================================
 * 用户 OTA 升级记录（文档 8.5）
 * ============================================================================
 * devices 来自 GET /user/devices/my（pageSize 100，足以覆盖个人设备）。
 * 记录接口 deviceId 必填，因此未选择设备时不发请求。
 * ============================================================================
 */
const devices = ref<Device[]>([])
const devicesLoading = ref(false)
const selectedDeviceId = ref('')

const records = ref<OtaRecordVO[]>([])
const total = ref(0)
const recordsLoading = ref(false)
const progress = ref<OtaProgressVO | null>(null)
const query = reactive({ pageNum: 1, pageSize: 10 })

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
    progress.value = await otaApi.progress(selectedDeviceId.value)
  } catch {
    progress.value = null
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
  await loadDevices()
  if (!selectedDeviceId.value) return
  await handleDeviceChange()
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
.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
