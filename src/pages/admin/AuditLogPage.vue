<template>
  <div class="audit-log-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <h3>指令审计</h3>
          <el-button :loading="loading" @click="fetchLogs">刷新</el-button>
        </div>
      </template>

      <el-alert
        type="info"
        :closable="false"
        title="项目暂无独立审计表，本页展示的是指令流水（device_command），只覆盖指令类操作。"
        class="page-alert"
      />

      <el-form :inline="true" class="filter-form" @submit.prevent>
        <el-form-item label="设备 MAC">
          <el-input
            v-model="query.deviceId"
            placeholder="可选"
            clearable
            style="width: 190px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="操作人">
          <el-input v-model="query.operator" placeholder="可选" clearable style="width: 150px" />
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="query.source" placeholder="全部" clearable style="width: 130px">
            <el-option
              v-for="(label, value) in COMMAND_SOURCE_LABELS"
              :key="value"
              :label="label"
              :value="value"
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
            :columns="AUDIT_LOG_COLUMNS"
            @show-all="showAllColumns"
            @reset="resetColumns"
          />
        </el-form-item>
      </el-form>

      <el-table :data="logs" v-loading="loading" stripe>
        <template #empty><el-empty description="暂无审计记录" :image-size="60" /></template>
        <el-table-column v-if="!isHidden('createTime')" prop="createTime" label="时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column v-if="!isHidden('operator')" prop="operator" label="操作人" width="120">
          <template #default="{ row }">{{ row.operator || 'SYSTEM' }}</template>
        </el-table-column>
        <el-table-column v-if="!isHidden('source')" label="来源" width="100">
          <template #default="{ row }">
            {{ row.source ? COMMAND_SOURCE_LABELS[row.source] || row.source : '-' }}
          </template>
        </el-table-column>
        <el-table-column v-if="!isHidden('deviceId')" prop="deviceId" label="设备 MAC" width="150" />
        <el-table-column v-if="!isHidden('actionTarget')" label="动作/目标" width="160">
          <template #default="{ row }">
            {{ row.action }} / {{ CONTROL_TARGET_LABELS[row.target] || row.target }}
            <span v-if="row.channel != null">#{{ row.channel }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="!isHidden('status')" label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="COMMAND_STATUS_TAG_TYPES[row.status] || 'info'" size="small">
              {{ COMMAND_STATUS_LABELS[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          v-if="!isHidden('commandId')"
          prop="commandId"
          label="指令 ID"
          min-width="200"
          show-overflow-tooltip
        />
        <el-table-column v-if="!isHidden('params')" label="参数" min-width="180">
          <template #default="{ row }">
            <span class="mono">{{ row.params ? JSON.stringify(row.params) : '-' }}</span>
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
          @current-change="fetchLogs"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { opsApi } from '@/features/admin/api/opsApi'
import type { DeviceCommand } from '@/types/command'
import { CONTROL_TARGET_LABELS, formatDateTime } from '@/utils/device'
import {
  COMMAND_SOURCE_LABELS,
  COMMAND_STATUS_LABELS,
  COMMAND_STATUS_TAG_TYPES,
} from '@/utils/status'
import ColumnSettings from '@/components/common/ColumnSettings.vue'
import { useColumnSettings, type ColumnOption } from '@/composables/useColumnSettings'

/**
 * 管理端指令审计（GET /admin/audit-logs）。
 * 复用 DeviceCommand 结构；筛选字段与后端 Query 参数一一对应。
 */

/** 可配置列；本表无操作列。 */
const AUDIT_LOG_COLUMNS: ColumnOption[] = [
  { key: 'createTime', label: '时间' },
  { key: 'operator', label: '操作人' },
  { key: 'source', label: '来源' },
  { key: 'deviceId', label: '设备 MAC' },
  { key: 'actionTarget', label: '动作/目标' },
  { key: 'status', label: '状态' },
  { key: 'commandId', label: '指令 ID' },
  { key: 'params', label: '参数' },
]

const {
  hidden: hiddenColumns,
  isHidden,
  showAll: showAllColumns,
  reset: resetColumns,
} = useColumnSettings('admin-audit-logs', AUDIT_LOG_COLUMNS)

const logs = ref<DeviceCommand[]>([])
const total = ref(0)
const loading = ref(false)
const dateRange = ref<[string, string] | null>(null)
const query = reactive({
  pageNum: 1,
  pageSize: 10,
  deviceId: '',
  operator: '',
  source: '',
})

const fetchLogs = async () => {
  loading.value = true
  try {
    const res = await opsApi.auditLogs({
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      deviceId: query.deviceId.trim() || undefined,
      operator: query.operator.trim() || undefined,
      source: query.source || undefined,
      from: dateRange.value?.[0],
      to: dateRange.value?.[1],
    })
    logs.value = res.records || []
    total.value = res.total || 0
  } catch {
    logs.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  query.pageNum = 1
  fetchLogs()
}

const handleReset = () => {
  query.deviceId = ''
  query.operator = ''
  query.source = ''
  dateRange.value = null
  handleSearch()
}

onMounted(fetchLogs)
</script>

<style scoped>
.audit-log-page {
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
.page-alert {
  margin-bottom: 16px;
}
.filter-form {
  margin-bottom: 8px;
}
.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.mono {
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 12px;
}
</style>
