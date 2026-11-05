<template>
  <div class="dashboard-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <h3>数据概览</h3>
          <el-button :loading="loading" @click="loadSummary">刷新</el-button>
        </div>
      </template>

      <el-row :gutter="16" v-loading="loading">
        <el-col :xs="12" :sm="8" :lg="6" class="stat-col">
          <div class="stat-card">
            <div class="stat-label">设备总数</div>
            <div class="stat-value">{{ summary?.deviceTotal ?? 0 }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :lg="6" class="stat-col">
          <div class="stat-card stat-online">
            <div class="stat-label">在线设备</div>
            <div class="stat-value">{{ summary?.onlineCount ?? 0 }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :lg="6" class="stat-col">
          <div class="stat-card">
            <div class="stat-label">离线设备</div>
            <div class="stat-value">{{ summary?.offlineCount ?? 0 }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :lg="6" class="stat-col">
          <div class="stat-card stat-warning">
            <div class="stat-label">未处理告警</div>
            <div class="stat-value">{{ summary?.unhandledAlertCount ?? 0 }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :lg="6" class="stat-col">
          <div class="stat-card">
            <div class="stat-label">今日指令</div>
            <div class="stat-value">{{ summary?.todayCommandCount ?? 0 }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :lg="6" class="stat-col">
          <div class="stat-card stat-danger">
            <div class="stat-label">今日失败</div>
            <div class="stat-value">{{ summary?.todayFailedCount ?? 0 }}</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :lg="6" class="stat-col">
          <div class="stat-card">
            <div class="stat-label">失败率</div>
            <div class="stat-value">{{ (summary?.failureRate ?? 0).toFixed(2) }}%</div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :lg="6" class="stat-col">
          <div class="stat-card stat-warning">
            <div class="stat-label">OTA 进行中</div>
            <div class="stat-value">{{ summary?.otaRunningCount ?? 0 }}</div>
          </div>
        </el-col>
      </el-row>

      <div class="quick-links">
        <h4>快捷入口</h4>
        <el-button type="primary" plain @click="router.push({ name: 'DeviceManage' })">
          设备管理
        </el-button>
        <el-button type="warning" plain @click="router.push({ name: 'AdminAlerts' })">
          告警处理
        </el-button>
        <el-button plain @click="router.push({ name: 'AdminCommands' })">指令流水</el-button>
        <el-button plain @click="router.push({ name: 'FirmwareManage' })">固件与任务</el-button>
        <el-button plain @click="router.push({ name: 'AuditLogs' })">指令审计</el-button>
        <el-button plain @click="router.push({ name: 'DeadLetters' })">死信管理</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { opsApi } from '@/features/admin/api/opsApi'
import type { DashboardSummaryVO } from '@/types/admin'

/**
 * 管理端数据概览（GET /admin/dashboard/summary）。
 * 仅做只读汇总展示，不聚合其他分页接口，避免首屏请求风暴。
 */
const router = useRouter()
const summary = ref<DashboardSummaryVO | null>(null)
const loading = ref(false)

const loadSummary = async () => {
  loading.value = true
  try {
    summary.value = await opsApi.summary()
  } catch {
    summary.value = null
  } finally {
    loading.value = false
  }
}

onMounted(loadSummary)
</script>

<style scoped>
.dashboard-page {
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
.stat-col {
  margin-bottom: 16px;
}
.stat-card {
  padding: 18px 20px;
  border-radius: 8px;
  background: linear-gradient(135deg, #f5f7fa 0%, #eef2f7 100%);
  border: 1px solid #ebeef5;
}
.stat-card.stat-online {
  background: linear-gradient(135deg, #eefaf3 0%, #e1f5e8 100%);
  border-color: #d1f0dd;
}
.stat-card.stat-warning {
  background: linear-gradient(135deg, #fff8e6 0%, #fdf0d5 100%);
  border-color: #faecd0;
}
.stat-card.stat-danger {
  background: linear-gradient(135deg, #fff1f0 0%, #fde2e1 100%);
  border-color: #fbd9d8;
}
.stat-label {
  font-size: 13px;
  color: #606266;
}
.stat-value {
  margin-top: 8px;
  font-size: 26px;
  font-weight: 600;
  color: #303133;
  line-height: 1.2;
}
.quick-links {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid #f0f2f5;
}
.quick-links h4 {
  margin: 0 0 12px;
  font-size: 14px;
  color: #303133;
}
.quick-links .el-button {
  margin-bottom: 8px;
}
</style>
