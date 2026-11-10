<template>
  <div class="command-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <h3>{{ isAdmin ? '全局指令' : '我的指令' }}</h3>
          <div class="actions">
            <el-button :loading="loading" @click="fetchCommands">刷新</el-button>
          </div>
        </div>
      </template>

      <el-alert
        v-if="isAdmin"
        type="info"
        :closable="false"
        title="这里展示所有用户的指令流水，仅 ADMIN 可见。"
        class="page-alert"
      />

      <el-form :inline="true" class="filter-form" @submit.prevent>
        <el-form-item label="设备 MAC">
          <el-input
            v-model="query.deviceId"
            placeholder="可选，完整 MAC"
            clearable
            style="width: 200px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="全部" clearable style="width: 150px">
            <el-option
              v-for="(label, value) in COMMAND_STATUS_LABELS"
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
            style="width: 360px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
          <ColumnSettings
            v-model:hidden="hiddenColumns"
            :columns="COMMAND_COLUMNS"
            @show-all="showAllColumns"
            @reset="resetColumns"
          />
        </el-form-item>
      </el-form>

      <el-table :data="commands" v-loading="loading" stripe>
        <template #empty><el-empty description="暂无指令记录" :image-size="60" /></template>
        <el-table-column
          v-if="!isHidden('commandId')"
          prop="commandId"
          label="指令 ID"
          min-width="210"
          show-overflow-tooltip
        />
        <el-table-column
          v-if="isAdmin && !isHidden('deviceId')"
          prop="deviceId"
          label="设备 MAC"
          width="150"
        />
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
        <el-table-column v-if="isAdmin && !isHidden('source')" label="来源" width="100">
          <template #default="{ row }">
            {{ row.source ? COMMAND_SOURCE_LABELS[row.source] || row.source : '-' }}
          </template>
        </el-table-column>
        <el-table-column v-if="isAdmin && !isHidden('operator')" label="操作人" width="120">
          <template #default="{ row }">{{ row.operator || '-' }}</template>
        </el-table-column>
        <el-table-column v-if="!isHidden('createTime')" label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row as DeviceCommand)">详情</el-button>
            <el-button
              v-if="!isAdmin && row.status === 0"
              link
              type="danger"
              @click="handleCancel(row as DeviceCommand)"
            >
              取消
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
          @current-change="fetchCommands"
        />
      </div>
    </el-card>

    <el-drawer v-model="detailVisible" title="指令详情" size="500px">
      <template v-if="detail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="指令 ID">{{ detail.commandId }}</el-descriptions-item>
          <el-descriptions-item label="设备 MAC">{{ detail.deviceId }}</el-descriptions-item>
          <el-descriptions-item label="动作/目标">
            {{ detail.action }} / {{ detail.target }}
            <span v-if="detail.channel != null">#{{ detail.channel }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            {{ COMMAND_STATUS_LABELS[detail.status] || detail.status }}
          </el-descriptions-item>
          <el-descriptions-item label="来源">
            {{ detail.source ? COMMAND_SOURCE_LABELS[detail.source] || detail.source : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="操作人">{{ detail.operator || '-' }}</el-descriptions-item>
          <el-descriptions-item label="重试次数">
            {{ detail.retryCount }} / {{ detail.maxRetry }}
          </el-descriptions-item>
          <el-descriptions-item label="错误信息">{{ detail.errorMsg || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(detail.createTime) }}</el-descriptions-item>
          <el-descriptions-item label="下发时间">{{ formatDateTime(detail.sendTime) }}</el-descriptions-item>
          <el-descriptions-item label="确认时间">{{ formatDateTime(detail.ackTime) }}</el-descriptions-item>
        </el-descriptions>
        <h4 class="json-title">请求参数</h4>
        <pre class="json-box">{{ prettyJSON(detail.params) }}</pre>
        <h4 class="json-title">设备响应</h4>
        <pre class="json-box">{{ detail.responsePayload || '暂无' }}</pre>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { commandApi } from '@/features/command/api/commandApi'
import type { CommandQuery, DeviceCommand } from '@/types/command'
import { CONTROL_TARGET_LABELS, formatDateTime, prettyJSON } from '@/utils/device'
import {
  COMMAND_SOURCE_LABELS,
  COMMAND_STATUS_LABELS,
  COMMAND_STATUS_TAG_TYPES,
} from '@/utils/status'
import ColumnSettings from '@/components/common/ColumnSettings.vue'
import { useColumnSettings, type ColumnOption } from '@/composables/useColumnSettings'

/**
 * ============================================================================
 * 指令中心（文档 8.3 / 8.9）
 * ============================================================================
 * 用户模式：GET /user/commands、GET /user/commands/{id}、POST .../cancel
 * 管理模式：GET /admin/commands（只读）
 * 通过路由名切换模式，避免维护两份几乎相同的页面。
 * ============================================================================
 */

/** 可配置列；操作列固定显示，「我的/全局」两个路由共用同一份配置。 */
const COMMAND_COLUMNS: ColumnOption[] = [
  { key: 'commandId', label: '指令 ID' },
  { key: 'deviceId', label: '设备 MAC' },
  { key: 'actionTarget', label: '动作/目标' },
  { key: 'status', label: '状态' },
  { key: 'source', label: '来源' },
  { key: 'operator', label: '操作人' },
  { key: 'createTime', label: '创建时间' },
  { key: 'actions', label: '操作', fixed: true },
]

const {
  hidden: hiddenColumns,
  isHidden,
  showAll: showAllColumns,
  reset: resetColumns,
} = useColumnSettings('command-list', COMMAND_COLUMNS)

const route = useRoute()
const isAdmin = computed(() => route.name === 'AdminCommands')

const commands = ref<DeviceCommand[]>([])
const total = ref(0)
const loading = ref(false)
const dateRange = ref<[string, string] | null>(null)
const query = reactive<{ pageNum: number; pageSize: number; deviceId: string; status?: number }>({
  pageNum: 1,
  pageSize: 10,
  deviceId: '',
  status: undefined,
})

const buildParams = (): CommandQuery => {
  const params: CommandQuery = {
    pageNum: query.pageNum,
    pageSize: query.pageSize,
    deviceId: query.deviceId.trim() || undefined,
    status: query.status,
  }
  if (dateRange.value) {
    params.from = dateRange.value[0]
    params.to = dateRange.value[1]
  }
  return params
}

const fetchCommands = async () => {
  loading.value = true
  try {
    const params = buildParams()
    const res = isAdmin.value ? await commandApi.listAdmin(params) : await commandApi.listMine(params)
    commands.value = res.records || []
    total.value = res.total || 0
  } catch {
    commands.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  query.pageNum = 1
  fetchCommands()
}

const handleReset = () => {
  query.deviceId = ''
  query.status = undefined
  dateRange.value = null
  handleSearch()
}

// ==================== 详情 ====================
const detailVisible = ref(false)
const detail = ref<DeviceCommand | null>(null)

const openDetail = async (row: DeviceCommand) => {
  if (isAdmin.value) {
    detail.value = row
    detailVisible.value = true
    return
  }
  try {
    detail.value = await commandApi.detail(row.commandId)
    detailVisible.value = true
  } catch {
    // 失败原因由统一请求层提示
  }
}

const handleCancel = (row: DeviceCommand) => {
  ElMessageBox.confirm('确定取消该未下发指令吗？', '取消指令', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      try {
        const cancelled = await commandApi.cancel(row.commandId)
        if (cancelled) {
          ElMessage.success('指令已取消')
          fetchCommands()
        } else {
          ElMessage.warning('该指令已下发或已进入终态，无法取消')
        }
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

onMounted(fetchCommands)
</script>

<style scoped>
.command-page {
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
.json-title {
  margin: 18px 0 8px;
  font-size: 14px;
  color: #303133;
}
.json-box {
  margin: 0;
  padding: 12px;
  max-height: 240px;
  overflow: auto;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
