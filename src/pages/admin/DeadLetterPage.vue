<template>
  <div class="dead-letter-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <h3>死信管理</h3>
          <el-button :loading="loading" @click="fetchDeadLetters">刷新</el-button>
        </div>
      </template>

      <el-alert
        type="info"
        :closable="false"
        title="死信来自消息消费失败的重试队列；已忽略的死信不可再次重放。"
        class="page-alert"
      />

      <el-table :data="deadLetters" v-loading="loading" stripe>
        <template #empty><el-empty description="暂无死信" :image-size="60" /></template>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="topic" label="Topic" min-width="200" show-overflow-tooltip />
        <el-table-column prop="errorMsg" label="错误信息" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.errorMsg || '-' }}</template>
        </el-table-column>
        <el-table-column label="可重试" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.isRetryable === 1 ? 'success' : 'danger'" size="small">
              {{ row.isRetryable === 1 ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="DEAD_LETTER_STATUS_TAG_TYPES[row.status] || 'info'" size="small">
              {{ DEAD_LETTER_STATUS_LABELS[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="retryCount" label="重试次数" width="90" align="center" />
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row as DeadLetter)">详情</el-button>
            <el-button
              v-if="row.status === 0 && row.isRetryable === 1"
              link
              type="primary"
              @click="handleReplay(row as DeadLetter)"
            >
              重放
            </el-button>
            <el-button
              v-if="row.status === 0"
              link
              type="danger"
              @click="handleIgnore(row as DeadLetter)"
            >
              忽略
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
          @current-change="fetchDeadLetters"
        />
      </div>
    </el-card>

    <el-drawer v-model="detailVisible" title="死信详情" size="520px">
      <template v-if="detail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="ID">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="Topic">{{ detail.topic }}</el-descriptions-item>
          <el-descriptions-item label="可重试">{{ detail.isRetryable === 1 ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            {{ DEAD_LETTER_STATUS_LABELS[detail.status] || detail.status }}
          </el-descriptions-item>
          <el-descriptions-item label="重试次数">{{ detail.retryCount }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDateTime(detail.createTime) }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatDateTime(detail.updateTime) }}
          </el-descriptions-item>
          <el-descriptions-item label="错误信息">{{ detail.errorMsg || '-' }}</el-descriptions-item>
        </el-descriptions>
        <h4 class="section-title">消息体</h4>
        <pre class="payload-box">{{ formatPayload(detail.payload) }}</pre>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deadLetterApi } from '@/features/admin/api/deadLetterApi'
import type { DeadLetter } from '@/types/deadLetter'
import { formatDateTime } from '@/utils/device'
import {
  DEAD_LETTER_STATUS_LABELS,
  DEAD_LETTER_STATUS_TAG_TYPES,
} from '@/utils/status'

/**
 * 管理端死信管理（文档 5.19 / 5.20 / 8.9）。
 * 支持查看详情、重放、忽略；重放与忽略都只针对未处理记录。
 */
const deadLetters = ref<DeadLetter[]>([])
const total = ref(0)
const loading = ref(false)
const query = reactive({ pageNum: 1, pageSize: 10 })

const fetchDeadLetters = async () => {
  loading.value = true
  try {
    const res = await deadLetterApi.list({ ...query })
    deadLetters.value = res.records || []
    total.value = res.total || 0
  } catch {
    deadLetters.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  query.pageNum = 1
  fetchDeadLetters()
}

const detailVisible = ref(false)
const detail = ref<DeadLetter | null>(null)

const openDetail = async (row: DeadLetter) => {
  try {
    detail.value = await deadLetterApi.detail(row.id)
  } catch {
    detail.value = row
  }
  detailVisible.value = true
}

const formatPayload = (payload: string | null): string => {
  if (!payload) return '暂无'
  try {
    return JSON.stringify(JSON.parse(payload), null, 2)
  } catch {
    return payload
  }
}

const handleReplay = (row: DeadLetter) => {
  ElMessageBox.confirm(`确定重放死信 #${row.id} 吗？`, '重放死信', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      try {
        await deadLetterApi.replay(row.id)
        ElMessage.success('重放成功')
        fetchDeadLetters()
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

const handleIgnore = (row: DeadLetter) => {
  ElMessageBox.confirm(
    `确定忽略死信 #${row.id} 吗？忽略后将不再支持重放。`,
    '忽略死信',
    { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' },
  )
    .then(async () => {
      try {
        await deadLetterApi.ignore(row.id)
        ElMessage.success('已忽略')
        fetchDeadLetters()
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

onMounted(fetchDeadLetters)
</script>

<style scoped>
.dead-letter-page {
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
.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.section-title {
  margin: 18px 0 8px;
  font-size: 14px;
  color: #303133;
}
.payload-box {
  margin: 0;
  padding: 12px;
  max-height: 360px;
  overflow: auto;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
