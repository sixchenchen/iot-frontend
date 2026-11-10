<template>
  <div class="alert-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <h3>{{ isAdmin ? '告警管理' : '我的告警' }}</h3>
          <el-button :loading="loading" @click="fetchAlerts">刷新</el-button>
        </div>
      </template>

      <el-form :inline="true" class="filter-form" @submit.prevent>
        <el-form-item label="设备 MAC">
          <el-input
            v-model="query.deviceId"
            placeholder="可选，完整 MAC"
            clearable
            style="width: 190px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="级别">
          <el-select v-model="query.level" placeholder="全部" clearable style="width: 120px">
            <el-option
              v-for="(label, value) in ALERT_LEVEL_LABELS"
              :key="value"
              :label="label"
              :value="Number(value)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="全部" clearable style="width: 120px">
            <el-option
              v-for="(label, value) in ALERT_STATUS_LABELS"
              :key="value"
              :label="label"
              :value="Number(value)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            value-format="YYYY-MM-DDTHH:mm:ss"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            style="width: 340px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
          <ColumnSettings
            v-model:hidden="hiddenColumns"
            :columns="ALERT_COLUMNS"
            @show-all="showAllColumns"
            @reset="resetColumns"
          />
        </el-form-item>
      </el-form>

      <el-table :data="alerts" v-loading="loading" stripe>
        <template #empty><el-empty description="暂无告警" :image-size="60" /></template>
        <el-table-column v-if="!isHidden('level')" label="级别" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="ALERT_LEVEL_TAG_TYPES[row.alertLevel] || 'info'" size="small">
              {{ ALERT_LEVEL_LABELS[row.alertLevel] || row.alertLevel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="!isHidden('deviceId')" prop="deviceId" label="设备 MAC" width="150" />
        <el-table-column v-if="!isHidden('alertType')" prop="alertType" label="类型" width="130">
          <template #default="{ row }">{{ row.alertType || '-' }}</template>
        </el-table-column>
        <el-table-column
          v-if="!isHidden('message')"
          prop="message"
          label="告警内容"
          min-width="180"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.message || '-' }}</template>
        </el-table-column>
        <el-table-column v-if="!isHidden('valueThreshold')" label="数值/阈值" width="130">
          <template #default="{ row }">{{ row.value ?? '-' }} / {{ row.threshold ?? '-' }}</template>
        </el-table-column>
        <el-table-column v-if="!isHidden('status')" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="ALERT_STATUS_TAG_TYPES[row.status ?? 0] || 'info'" size="small">
              {{ ALERT_STATUS_LABELS[row.status ?? 0] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="!isHidden('occurredTime')" label="发生时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.timestamp || row.createTime) }}</template>
        </el-table-column>
        <el-table-column v-if="isAdmin && !isHidden('handledBy')" label="处理人" width="110">
          <template #default="{ row }">{{ row.handledBy || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="!isAdmin && row.id != null && (row.status ?? 0) === 0"
              link
              type="primary"
              @click="handleAck(row as DeviceAlertRecord)"
            >
              确认
            </el-button>
            <template v-if="isAdmin && row.id != null">
              <el-button
                v-if="(row.status ?? 0) === 0"
                link
                type="primary"
                @click="handleUpdateStatus(row as DeviceAlertRecord, 1)"
              >
                确认
              </el-button>
              <el-button
                v-if="(row.status ?? 0) !== 2"
                link
                type="success"
                @click="handleUpdateStatus(row as DeviceAlertRecord, 2)"
              >
                解决
              </el-button>
            </template>
            <span
              v-if="row.id == null || (row.status ?? 0) === 2"
              class="muted"
            >
              -
            </span>
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
          @current-change="fetchAlerts"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { alertApi } from '@/features/alert/api/alertApi'
import type { AlertQuery } from '@/types/sensor'
import type { DeviceAlertRecord } from '@/types/ws'
import { formatDateTime } from '@/utils/device'
import {
  ALERT_LEVEL_LABELS,
  ALERT_LEVEL_TAG_TYPES,
  ALERT_STATUS_LABELS,
  ALERT_STATUS_TAG_TYPES,
} from '@/utils/status'
import ColumnSettings from '@/components/common/ColumnSettings.vue'
import { useColumnSettings, type ColumnOption } from '@/composables/useColumnSettings'

/**
 * ============================================================================
 * 告警中心（文档 8.4 / 8.9）
 * ============================================================================
 * 用户模式：GET /user/alerts、POST /user/alerts/{id}/ack
 * 管理模式：GET /admin/alerts、PUT /admin/alerts/{id}/status（1 确认 / 2 解决）
 * ============================================================================
 */

/** 可配置列；操作列固定显示，「我的/全局」两个路由共用同一份配置。 */
const ALERT_COLUMNS: ColumnOption[] = [
  { key: 'level', label: '级别' },
  { key: 'deviceId', label: '设备 MAC' },
  { key: 'alertType', label: '类型' },
  { key: 'message', label: '告警内容' },
  { key: 'valueThreshold', label: '数值/阈值' },
  { key: 'status', label: '状态' },
  { key: 'occurredTime', label: '发生时间' },
  { key: 'handledBy', label: '处理人' },
  { key: 'actions', label: '操作', fixed: true },
]

const {
  hidden: hiddenColumns,
  isHidden,
  showAll: showAllColumns,
  reset: resetColumns,
} = useColumnSettings('alert-list', ALERT_COLUMNS)

const route = useRoute()
const isAdmin = computed(() => route.name === 'AdminAlerts')

const alerts = ref<DeviceAlertRecord[]>([])
const total = ref(0)
const loading = ref(false)
const dateRange = ref<[string, string] | null>(null)
const query = reactive<{
  pageNum: number
  pageSize: number
  deviceId: string
  status?: number
  level?: number
}>({
  pageNum: 1,
  pageSize: 10,
  deviceId: '',
  status: undefined,
  level: undefined,
})

const buildParams = (): AlertQuery => {
  const params: AlertQuery = {
    pageNum: query.pageNum,
    pageSize: query.pageSize,
    deviceId: query.deviceId.trim() || undefined,
    status: query.status,
    level: query.level,
  }
  if (dateRange.value) {
    params.from = dateRange.value[0]
    params.to = dateRange.value[1]
  }
  return params
}

const fetchAlerts = async () => {
  loading.value = true
  try {
    const params = buildParams()
    const res = isAdmin.value ? await alertApi.listAdmin(params) : await alertApi.listMine(params)
    alerts.value = res.records || []
    total.value = res.total || 0
  } catch {
    alerts.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  query.pageNum = 1
  fetchAlerts()
}

const handleReset = () => {
  query.deviceId = ''
  query.status = undefined
  query.level = undefined
  dateRange.value = null
  handleSearch()
}

const handleAck = async (row: DeviceAlertRecord) => {
  if (row.id == null) return
  try {
    await alertApi.ack(row.id)
    ElMessage.success('告警已确认')
    fetchAlerts()
  } catch {
    // 失败原因由统一请求层提示
  }
}

const handleUpdateStatus = (row: DeviceAlertRecord, status: 1 | 2) => {
  if (row.id == null) return
  const action = status === 1 ? '确认' : '标记为解决'
  ElMessageBox.confirm(`确定${action}该告警吗？`, action, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      try {
        await alertApi.updateStatus(row.id as number, status)
        ElMessage.success(`已${action}`)
        fetchAlerts()
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

onMounted(fetchAlerts)
</script>

<style scoped>
.alert-page {
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
.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.muted {
  color: #909399;
}
</style>
