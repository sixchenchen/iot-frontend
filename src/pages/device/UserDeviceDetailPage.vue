<template>
  <div class="device-detail-page">
    <el-card v-loading="detailLoading" shadow="never">
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
            <el-button :disabled="!detail || !online" @click="controlVisible = true">
              控制设备
            </el-button>
            <el-button :disabled="!detail" @click="openBatchDialog">批量控制</el-button>
            <el-button :disabled="!detail" @click="handleOtaCheck">检查更新</el-button>
            <el-button :disabled="!detail" @click="openEditDialog">修改信息</el-button>
            <el-button :loading="detailLoading" @click="refreshAll">刷新</el-button>
          </div>
        </div>
      </template>

      <el-alert
        v-if="detail?.offlineReason"
        type="warning"
        :closable="false"
        :title="`离线原因：${detail.offlineReason}`"
        class="page-alert"
      />

      <template v-if="detail">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="设备 MAC">{{ detail.deviceId }}</el-descriptions-item>
          <el-descriptions-item label="产品型号">{{ detail.product || '-' }}</el-descriptions-item>
          <el-descriptions-item label="固件版本">{{ detail.firmware || '-' }}</el-descriptions-item>
          <el-descriptions-item label="安装位置">{{ detail.location || '-' }}</el-descriptions-item>
          <el-descriptions-item label="最后心跳">
            {{ formatDateTime(detail.lastHeartbeatTime) }}
          </el-descriptions-item>
          <el-descriptions-item label="运行时长">{{ formatUptime(detail.uptime) }}</el-descriptions-item>
          <el-descriptions-item label="最后在线">
            {{ formatDateTime(detail.lastOnlineTime) }}
          </el-descriptions-item>
          <el-descriptions-item label="绑定时间">
            {{ formatDateTime(detail.bindTime) }}
          </el-descriptions-item>
          <el-descriptions-item label="配置版本">
            {{ detail.configVersion ?? '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <DeviceStatePanel
          :device="detail"
          :states="realtimeStates"
          :live="realtimeConnected"
          mode="user"
        />

        <el-row :gutter="16" class="stat-row">
          <el-col :xs="24" :md="12">
            <el-card shadow="never" class="inner-card">
              <h4>OTA 进度</h4>
              <div v-if="otaProgress?.otaState" class="ota-progress">
                <el-tag :type="otaTagType">
                  {{ otaProgress.otaStateText || OTA_STATE_LABELS[otaProgress.otaState] || otaProgress.otaState }}
                </el-tag>
                <el-progress
                  :percentage="Math.min(Math.max(otaProgress.otaProgress ?? 0, 0), 100)"
                  :status="otaProgress.otaState === 'failed' ? 'exception' : undefined"
                  class="progress-bar"
                />
                <div class="ota-meta">
                  目标版本：{{ otaProgress.otaVersion || '-' }} ·
                  {{ formatDateTime(otaProgress.otaUpdateTime) }}
                </div>
                <div v-if="otaProgress.errorMsg" class="ota-meta ota-error">
                  {{ otaProgress.errorMsg }}
                </div>
              </div>
              <el-empty v-else description="暂无 OTA 进度" :image-size="48" />
              <div v-if="otaProgress?.otaState === 'failed'" class="ota-actions">
                <el-button size="small" :loading="otaRetrying" @click="handleOtaRetry">
                  失败重试
                </el-button>
                <span class="ota-retry-hint">
                  {{ otaRetrying ? '重试已受理，正在等待设备回执…' : '重试将重新下发升级指令' }}
                </span>
              </div>
            </el-card>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-card shadow="never" class="inner-card">
              <h4>指令统计</h4>
              <div class="stat-tags">
                <el-tag type="info">待下发 {{ commandStats?.pending ?? 0 }}</el-tag>
                <el-tag type="primary">已下发 {{ commandStats?.sent ?? 0 }}</el-tag>
                <el-tag type="success">成功 {{ commandStats?.success ?? 0 }}</el-tag>
                <el-tag type="danger">失败 {{ commandStats?.failed ?? 0 }}</el-tag>
                <el-tag type="warning">超时 {{ commandStats?.timeout ?? 0 }}</el-tag>
                <el-tag type="info">已取消 {{ commandStats?.cancelled ?? 0 }}</el-tag>
                <el-tag type="primary">总计 {{ commandStats?.total ?? 0 }}</el-tag>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <el-tabs v-model="activeTab" class="detail-tabs">
          <!-- ==================== 指令 ==================== -->
          <el-tab-pane label="指令历史" name="commands">
            <div class="tab-toolbar">
              <el-select
                v-model="commandQuery.status"
                placeholder="全部状态"
                clearable
                style="width: 160px"
                @change="handleCommandSearch"
              >
                <el-option
                  v-for="(label, value) in COMMAND_STATUS_LABELS"
                  :key="value"
                  :label="label"
                  :value="Number(value)"
                />
              </el-select>
              <el-button :loading="commandsLoading" @click="loadCommands">刷新</el-button>
              <ColumnSettings
                v-model:hidden="hiddenCommandColumns"
                :columns="DEVICE_COMMAND_COLUMNS"
                @show-all="showAllCommandColumns"
                @reset="resetCommandColumns"
              />
            </div>
            <el-table :data="commands" v-loading="commandsLoading" stripe>
              <template #empty><el-empty description="暂无指令" :image-size="60" /></template>
              <el-table-column
                v-if="!isCommandHidden('commandId')"
                prop="commandId"
                label="指令 ID"
                min-width="200"
                show-overflow-tooltip
              />
              <el-table-column v-if="!isCommandHidden('actionTarget')" label="动作/目标" width="150">
                <template #default="{ row }">
                  {{ row.action }} / {{ CONTROL_TARGET_LABELS[row.target] || row.target }}
                  <span v-if="row.channel != null">#{{ row.channel }}</span>
                </template>
              </el-table-column>
              <el-table-column v-if="!isCommandHidden('status')" label="状态" width="110" align="center">
                <template #default="{ row }">
                  <el-tag :type="COMMAND_STATUS_TAG_TYPES[row.status] || 'info'" size="small">
                    {{ COMMAND_STATUS_LABELS[row.status] || row.status }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column v-if="!isCommandHidden('createTime')" label="创建时间" width="170">
                <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="140" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openCommandDetail(row as DeviceCommand)">
                    详情
                  </el-button>
                  <el-button
                    v-if="row.status === 0"
                    link
                    type="danger"
                    @click="handleCancelCommand(row as DeviceCommand)"
                  >
                    取消
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
            <div class="pagination-container">
              <el-pagination
                v-model:current-page="commandQuery.pageNum"
                v-model:page-size="commandQuery.pageSize"
                :total="commandTotal"
                :page-sizes="[10, 20, 50]"
                layout="total, sizes, prev, pager, next"
                @size-change="handleCommandSearch"
                @current-change="loadCommands"
              />
            </div>
          </el-tab-pane>

          <!-- ==================== 传感器 ==================== -->
          <el-tab-pane label="传感器" name="sensors">
            <div class="latest-sensors">
              <el-tag v-for="item in latestSensors" :key="item.sensorKey" type="info">
                {{ item.sensorName || item.sensorKey }}：{{ item.value ?? '-' }}{{ item.unit || '' }}
              </el-tag>
              <span v-if="!latestSensors.length" class="muted">暂无最新传感器数据</span>
            </div>
            <div class="tab-toolbar">
              <el-input
                v-model="sensorQuery.sensorKey"
                placeholder="传感器键"
                clearable
                style="width: 180px"
                @keyup.enter="handleSensorSearch"
              />
              <el-input
                v-model="sensorQuery.type"
                placeholder="传感器类型"
                clearable
                style="width: 180px"
                @keyup.enter="handleSensorSearch"
              />
              <el-button type="primary" @click="handleSensorSearch">查询</el-button>
              <el-button :loading="sensorsLoading" @click="loadSensors">刷新</el-button>
              <ColumnSettings
                v-model:hidden="hiddenSensorColumns"
                :columns="DEVICE_SENSOR_COLUMNS"
                @show-all="showAllSensorColumns"
                @reset="resetSensorColumns"
              />
            </div>
            <el-table :data="sensors" v-loading="sensorsLoading" stripe>
              <template #empty><el-empty description="暂无传感器记录" :image-size="60" /></template>
              <el-table-column
                v-if="!isSensorHidden('sensorKey')"
                prop="sensorKey"
                label="传感器键"
                min-width="140"
                show-overflow-tooltip
              />
              <el-table-column v-if="!isSensorHidden('sensorType')" prop="sensorType" label="类型" width="130">
                <template #default="{ row }">{{ row.sensorType || '-' }}</template>
              </el-table-column>
              <el-table-column v-if="!isSensorHidden('value')" label="数值" width="120">
                <template #default="{ row }">{{ row.sensorValue }}{{ row.unit || '' }}</template>
              </el-table-column>
              <el-table-column v-if="!isSensorHidden('collectTime')" label="采集时间" width="170">
                <template #default="{ row }">{{ formatDateTime(row.timestamp || row.createTime) }}</template>
              </el-table-column>
            </el-table>
            <div class="pagination-container">
              <el-pagination
                v-model:current-page="sensorQuery.pageNum"
                v-model:page-size="sensorQuery.pageSize"
                :total="sensorTotal"
                :page-sizes="[10, 20, 50]"
                layout="total, sizes, prev, pager, next"
                @size-change="handleSensorSearch"
                @current-change="loadSensors"
              />
            </div>
          </el-tab-pane>

          <!-- ==================== 事件 ==================== -->
          <el-tab-pane label="设备事件" name="events">
            <div class="tab-toolbar">
              <el-input
                v-model="eventQuery.type"
                placeholder="事件类型"
                clearable
                style="width: 180px"
                @keyup.enter="handleEventSearch"
              />
              <el-button type="primary" @click="handleEventSearch">查询</el-button>
              <el-button :loading="eventsLoading" @click="loadEvents">刷新</el-button>
              <ColumnSettings
                v-model:hidden="hiddenEventColumns"
                :columns="DEVICE_EVENT_COLUMNS"
                @show-all="showAllEventColumns"
                @reset="resetEventColumns"
              />
            </div>
            <el-table :data="events" v-loading="eventsLoading" stripe>
              <template #empty><el-empty description="暂无事件" :image-size="60" /></template>
              <el-table-column v-if="!isEventHidden('type')" prop="type" label="类型" width="130" />
              <el-table-column v-if="!isEventHidden('event')" prop="event" label="事件" width="130" />
              <el-table-column v-if="!isEventHidden('code')" prop="code" label="编码" width="100" />
              <el-table-column
                v-if="!isEventHidden('message')"
                prop="message"
                label="描述"
                min-width="180"
                show-overflow-tooltip
              />
              <el-table-column v-if="!isEventHidden('targetChannel')" label="目标/通道" width="130">
                <template #default="{ row }">
                  {{ row.target || '-' }}<span v-if="row.channel != null">#{{ row.channel }}</span>
                </template>
              </el-table-column>
              <el-table-column v-if="!isEventHidden('time')" label="时间" width="170">
                <template #default="{ row }">{{ formatDateTime(row.timestamp || row.createTime) }}</template>
              </el-table-column>
            </el-table>
            <div class="pagination-container">
              <el-pagination
                v-model:current-page="eventQuery.pageNum"
                v-model:page-size="eventQuery.pageSize"
                :total="eventTotal"
                :page-sizes="[10, 20, 50]"
                layout="total, sizes, prev, pager, next"
                @size-change="handleEventSearch"
                @current-change="loadEvents"
              />
            </div>
          </el-tab-pane>

          <!-- ==================== 状态 ==================== -->
          <el-tab-pane label="状态历史" name="states">
            <div class="tab-toolbar">
              <el-button :loading="statesLoading" @click="loadStates">刷新</el-button>
              <ColumnSettings
                v-model:hidden="hiddenStateColumns"
                :columns="DEVICE_STATE_COLUMNS"
                @show-all="showAllStateColumns"
                @reset="resetStateColumns"
              />
            </div>
            <el-table :data="states" v-loading="statesLoading" stripe>
              <template #empty><el-empty description="暂无状态记录" :image-size="60" /></template>
              <el-table-column v-if="!isStateHidden('target')" label="目标" width="150">
                <template #default="{ row }">
                  {{ CONTROL_TARGET_LABELS[row.target] || row.target }}
                </template>
              </el-table-column>
              <el-table-column v-if="!isStateHidden('channel')" label="通道" width="90" align="center">
                <template #default="{ row }">{{ row.channel ?? '全部' }}</template>
              </el-table-column>
              <el-table-column v-if="!isStateHidden('params')" label="参数" min-width="200">
                <template #default="{ row }">
                  <span class="mono">{{ row.params ? JSON.stringify(row.params) : '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column v-if="!isStateHidden('time')" label="时间" width="170">
                <template #default="{ row }">{{ formatDateTime(row.timestamp || row.createTime) }}</template>
              </el-table-column>
            </el-table>
            <div class="pagination-container">
              <el-pagination
                v-model:current-page="stateQuery.pageNum"
                v-model:page-size="stateQuery.pageSize"
                :total="stateTotal"
                :page-sizes="[10, 20, 50]"
                layout="total, sizes, prev, pager, next"
                @size-change="handleStateSearch"
                @current-change="loadStates"
              />
            </div>
          </el-tab-pane>

          <!-- ==================== 告警 ==================== -->
          <el-tab-pane label="设备告警" name="alerts">
            <div class="tab-toolbar">
              <el-select
                v-model="alertQuery.status"
                placeholder="全部状态"
                clearable
                style="width: 160px"
                @change="handleAlertSearch"
              >
                <el-option
                  v-for="(label, value) in ALERT_STATUS_LABELS"
                  :key="value"
                  :label="label"
                  :value="Number(value)"
                />
              </el-select>
              <el-button :loading="alertsLoading" @click="loadAlerts">刷新</el-button>
              <ColumnSettings
                v-model:hidden="hiddenAlertColumns"
                :columns="DEVICE_ALERT_COLUMNS"
                @show-all="showAllAlertColumns"
                @reset="resetAlertColumns"
              />
            </div>
            <el-table :data="alerts" v-loading="alertsLoading" stripe>
              <template #empty><el-empty description="暂无告警" :image-size="60" /></template>
              <el-table-column v-if="!isAlertHidden('alertLevel')" label="级别" width="90" align="center">
                <template #default="{ row }">
                  <el-tag :type="ALERT_LEVEL_TAG_TYPES[row.alertLevel] || 'info'" size="small">
                    {{ ALERT_LEVEL_LABELS[row.alertLevel] || row.alertLevel }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column v-if="!isAlertHidden('alertType')" prop="alertType" label="类型" width="130">
                <template #default="{ row }">{{ row.alertType || '-' }}</template>
              </el-table-column>
              <el-table-column
                v-if="!isAlertHidden('message')"
                prop="message"
                label="内容"
                min-width="180"
                show-overflow-tooltip
              />
              <el-table-column v-if="!isAlertHidden('valueThreshold')" label="数值/阈值" width="130">
                <template #default="{ row }">{{ row.value ?? '-' }} / {{ row.threshold ?? '-' }}</template>
              </el-table-column>
              <el-table-column v-if="!isAlertHidden('status')" label="状态" width="100" align="center">
                <template #default="{ row }">
                  <el-tag :type="ALERT_STATUS_TAG_TYPES[row.status ?? 0] || 'info'" size="small">
                    {{ ALERT_STATUS_LABELS[row.status ?? 0] || row.status }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column v-if="!isAlertHidden('time')" label="时间" width="170">
                <template #default="{ row }">{{ formatDateTime(row.timestamp || row.createTime) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="100" fixed="right">
                <template #default="{ row }">
                  <el-button
                    v-if="row.id != null && row.status !== 1"
                    link
                    type="primary"
                    :disabled="row.status === 2"
                    @click="handleAckAlert(row as DeviceAlertRecord)"
                  >
                    确认
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
            <div class="pagination-container">
              <el-pagination
                v-model:current-page="alertQuery.pageNum"
                v-model:page-size="alertQuery.pageSize"
                :total="alertTotal"
                :page-sizes="[10, 20, 50]"
                layout="total, sizes, prev, pager, next"
                @size-change="handleAlertSearch"
                @current-change="loadAlerts"
              />
            </div>
          </el-tab-pane>

          <!-- ==================== OTA 记录 ==================== -->
          <el-tab-pane label="OTA 记录" name="ota">
            <div class="tab-toolbar">
              <el-button :loading="otaRecordsLoading" @click="loadOtaRecords">刷新</el-button>
              <ColumnSettings
                v-model:hidden="hiddenOtaColumns"
                :columns="DEVICE_OTA_COLUMNS"
                @show-all="showAllOtaColumns"
                @reset="resetOtaColumns"
              />
            </div>
            <el-table :data="otaRecords" v-loading="otaRecordsLoading" stripe>
              <template #empty><el-empty description="暂无升级记录" :image-size="60" /></template>
              <el-table-column v-if="!isOtaHidden('version')" prop="version" label="目标版本" width="120" />
              <el-table-column v-if="!isOtaHidden('commandStatus')" label="指令状态" width="110" align="center">
                <template #default="{ row }">
                  <el-tag :type="COMMAND_STATUS_TAG_TYPES[row.status] || 'info'" size="small">
                    {{ row.statusText || COMMAND_STATUS_LABELS[row.status] || row.status }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column v-if="!isOtaHidden('otaStage')" label="OTA 阶段" width="110">
                <template #default="{ row }">
                  {{ row.otaState ? OTA_STATE_LABELS[row.otaState] || row.otaState : '-' }}
                </template>
              </el-table-column>
              <el-table-column v-if="!isOtaHidden('progress')" label="进度" width="120">
                <template #default="{ row }">{{ row.progress ?? 0 }}%</template>
              </el-table-column>
              <el-table-column
                v-if="!isOtaHidden('errorMsg')"
                prop="errorMsg"
                label="失败原因"
                min-width="160"
                show-overflow-tooltip
              >
                <template #default="{ row }">{{ row.errorMsg || '-' }}</template>
              </el-table-column>
              <el-table-column v-if="!isOtaHidden('createTime')" label="创建时间" width="170">
                <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="100" fixed="right">
                <template #default="{ row }">
                  <el-button
                    v-if="[3, 4, 5].includes(row.status)"
                    link
                    type="primary"
                    @click="handleOtaRetry"
                  >
                    重试
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
            <div class="pagination-container">
              <el-pagination
                v-model:current-page="otaQuery.pageNum"
                v-model:page-size="otaQuery.pageSize"
                :total="otaTotal"
                :page-sizes="[10, 20, 50]"
                layout="total, sizes, prev, pager, next"
                @size-change="handleOtaSearch"
                @current-change="loadOtaRecords"
              />
            </div>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-card>

    <DeviceControlDialog
      v-model="controlVisible"
      :device="detail"
      mode="user"
      @success="handleControlSuccess"
    />

    <!-- ============ 批量控制 ============ -->
    <el-dialog
      v-model="batchVisible"
      title="批量控制"
      width="720px"
      :close-on-click-modal="false"
    >
      <el-alert
        type="info"
        :closable="false"
        title="后端会按顺序逐条下发，任意一条失败将整体回滚。"
        class="dialog-alert"
      />
      <div v-for="(row, index) in batchRows" :key="index" class="batch-row">
        <el-select v-model="row.action" style="width: 110px">
          <el-option v-for="action in CONTROL_ACTIONS" :key="action" :label="action" :value="action" />
        </el-select>
        <el-select
          v-model="row.target"
          style="width: 130px"
          @change="handleBatchTargetChange(row)"
        >
          <el-option
            v-for="target in controlTargets"
            :key="target"
            :label="CONTROL_TARGET_LABELS[target] || target"
            :value="target"
          />
        </el-select>
        <el-input-number
          v-if="supportsChannel(row.target)"
          v-model="row.channel"
          :min="0"
          :max="channelCountOf(detail ?? {}, row.target)"
          style="width: 100px"
        />
        <span v-if="supportsChannel(row.target)" class="batch-channel-hint">
          通道 0~{{ channelCountOf(detail ?? {}, row.target) }}
        </span>
        <el-input
          v-model="row.paramsText"
          placeholder='{"state":1}'
          class="batch-params"
        />
        <el-button
          link
          type="danger"
          :disabled="batchRows.length === 1"
          @click="removeBatchRow(index)"
        >
          删除
        </el-button>
      </div>
      <el-button link type="primary" @click="addBatchRow">+ 添加一条指令</el-button>
      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchSubmitting" @click="submitBatch">
          批量下发
        </el-button>
      </template>
    </el-dialog>

    <!-- ============ 修改设备信息 ============ -->
    <el-dialog
      v-model="editVisible"
      title="修改设备信息"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-width="90px">
        <el-form-item label="设备名称" prop="deviceName">
          <el-input v-model="editForm.deviceName" maxlength="64" clearable />
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

    <!-- ============ 指令详情 ============ -->
    <el-drawer v-model="commandDetailVisible" title="指令详情" size="480px">
      <template v-if="selectedCommand">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="指令 ID">{{ selectedCommand.commandId }}</el-descriptions-item>
          <el-descriptions-item label="设备">{{ selectedCommand.deviceId }}</el-descriptions-item>
          <el-descriptions-item label="动作/目标">
            {{ selectedCommand.action }} / {{ selectedCommand.target }}
            <span v-if="selectedCommand.channel != null">#{{ selectedCommand.channel }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            {{ COMMAND_STATUS_LABELS[selectedCommand.status] || selectedCommand.status }}
          </el-descriptions-item>
          <el-descriptions-item label="来源">
            {{ selectedCommand.source ? COMMAND_SOURCE_LABELS[selectedCommand.source] || selectedCommand.source : '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="操作人">{{ selectedCommand.operator || '-' }}</el-descriptions-item>
          <el-descriptions-item label="重试次数">
            {{ selectedCommand.retryCount }} / {{ selectedCommand.maxRetry }}
          </el-descriptions-item>
          <el-descriptions-item label="错误信息">{{ selectedCommand.errorMsg || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDateTime(selectedCommand.createTime) }}</el-descriptions-item>
          <el-descriptions-item label="下发时间">{{ formatDateTime(selectedCommand.sendTime) }}</el-descriptions-item>
          <el-descriptions-item label="确认时间">{{ formatDateTime(selectedCommand.ackTime) }}</el-descriptions-item>
        </el-descriptions>
        <h4 class="json-title">请求参数</h4>
        <pre class="json-box">{{ prettyJSON(selectedCommand.params) }}</pre>
        <h4 class="json-title">设备响应</h4>
        <pre class="json-box">{{ selectedCommand.responsePayload || '暂无' }}</pre>
      </template>
    </el-drawer>

    <!-- ============ OTA 检查 ============ -->
    <el-dialog v-model="otaVisible" title="固件更新" width="540px">
      <div v-loading="otaChecking" class="ota-body">
        <template v-if="otaCheckResult">
          <el-result
            v-if="!otaCheckResult.hasNewVersion"
            icon="success"
            title="当前已是最新版本"
            sub-title="无需升级"
          />
          <el-descriptions v-else :column="1" border>
            <el-descriptions-item label="最新版本">
              {{ otaCheckResult.latestVersion || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="固件大小">
              {{ otaCheckResult.size != null ? formatBytes(otaCheckResult.size) : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="更新说明">
              {{ otaCheckResult.releaseNotes || '无' }}
            </el-descriptions-item>
          </el-descriptions>
        </template>
        <el-empty v-else description="正在检查更新" />
      </div>
      <template #footer>
        <el-button @click="otaVisible = false">关闭</el-button>
        <el-button
          v-if="otaCheckResult?.hasNewVersion"
          type="primary"
          :loading="otaChecking"
          @click="handleOtaStart"
        >
          立即升级
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { deviceApi } from '@/features/device/api/deviceApi'
import { commandApi } from '@/features/command/api/commandApi'
import { otaApi } from '@/features/ota/api/otaApi'
import { alertApi } from '@/features/alert/api/alertApi'
import { sensorApi } from '@/features/sensor/api/sensorApi'
import DeviceControlDialog from '@/components/device/DeviceControlDialog.vue'
import DeviceStatePanel from '@/components/device/DeviceStatePanel.vue'
import { useDeviceRealtimeStore } from '@/stores/useDeviceRealtimeStore'
import type { DeviceCommand, CommandStatsVO } from '@/types/command'
import type { DeviceDetailVO, DeviceOnlineVO, UserDeviceUpdateRequest } from '@/types/device'
import type { OtaCheckResponse, OtaProgressVO, OtaRecordVO } from '@/types/ota'
import type { DeviceEventRecord, DeviceStateRecord, SensorLatestVO } from '@/types/sensor'
import type { DeviceAlertRecord, DeviceSensorRecord } from '@/types/ws'
import {
  CONTROL_ACTIONS,
  CONTROL_TARGET_LABELS,
  OTA_STATE_LABELS,
  availableControlTargets,
  channelCountOf,
  defaultControlParams,
  formatBytes,
  formatDateTime,
  formatUptime,
  isDeviceOnline,
  prettyJSON,
  supportsChannel,
} from '@/utils/device'
import {
  ALERT_LEVEL_LABELS,
  ALERT_LEVEL_TAG_TYPES,
  ALERT_STATUS_LABELS,
  ALERT_STATUS_TAG_TYPES,
  COMMAND_SOURCE_LABELS,
  COMMAND_STATUS_LABELS,
  COMMAND_STATUS_TAG_TYPES,
} from '@/utils/status'
import ColumnSettings from '@/components/common/ColumnSettings.vue'
import { useColumnSettings, type ColumnOption } from '@/composables/useColumnSettings'

/**
 * ============================================================================
 * 用户设备详情页（文档 8.2 / 8.3 / 8.4 / 8.5）
 * ============================================================================
 * 覆盖用户侧设备详情、在线查询、编辑、指令历史/统计/批量控制、
 * 传感器历史/最新值、事件、状态历史、告警确认、OTA 进度/记录/重试。
 *
 * 页面按 Tab 懒加载，避免一次性发起 6 个分页请求。
 * ============================================================================
 */

// ==================== 列显隐 ====================
/** 指令历史：操作列固定显示。 */
const DEVICE_COMMAND_COLUMNS: ColumnOption[] = [
  { key: 'commandId', label: '指令 ID' },
  { key: 'actionTarget', label: '动作/目标' },
  { key: 'status', label: '状态' },
  { key: 'createTime', label: '创建时间' },
  { key: 'actions', label: '操作', fixed: true },
]

const {
  hidden: hiddenCommandColumns,
  isHidden: isCommandHidden,
  showAll: showAllCommandColumns,
  reset: resetCommandColumns,
} = useColumnSettings('device-detail-commands', DEVICE_COMMAND_COLUMNS)

/** 传感器记录。 */
const DEVICE_SENSOR_COLUMNS: ColumnOption[] = [
  { key: 'sensorKey', label: '传感器键' },
  { key: 'sensorType', label: '类型' },
  { key: 'value', label: '数值' },
  { key: 'collectTime', label: '采集时间' },
]

const {
  hidden: hiddenSensorColumns,
  isHidden: isSensorHidden,
  showAll: showAllSensorColumns,
  reset: resetSensorColumns,
} = useColumnSettings('device-detail-sensors', DEVICE_SENSOR_COLUMNS)

/** 设备事件。 */
const DEVICE_EVENT_COLUMNS: ColumnOption[] = [
  { key: 'type', label: '类型' },
  { key: 'event', label: '事件' },
  { key: 'code', label: '编码' },
  { key: 'message', label: '描述' },
  { key: 'targetChannel', label: '目标/通道' },
  { key: 'time', label: '时间' },
]

const {
  hidden: hiddenEventColumns,
  isHidden: isEventHidden,
  showAll: showAllEventColumns,
  reset: resetEventColumns,
} = useColumnSettings('device-detail-events', DEVICE_EVENT_COLUMNS)

/** 状态历史。 */
const DEVICE_STATE_COLUMNS: ColumnOption[] = [
  { key: 'target', label: '目标' },
  { key: 'channel', label: '通道' },
  { key: 'params', label: '参数' },
  { key: 'time', label: '时间' },
]

const {
  hidden: hiddenStateColumns,
  isHidden: isStateHidden,
  showAll: showAllStateColumns,
  reset: resetStateColumns,
} = useColumnSettings('device-detail-states', DEVICE_STATE_COLUMNS)

/** 设备告警：操作列固定显示。 */
const DEVICE_ALERT_COLUMNS: ColumnOption[] = [
  { key: 'alertLevel', label: '级别' },
  { key: 'alertType', label: '类型' },
  { key: 'message', label: '内容' },
  { key: 'valueThreshold', label: '数值/阈值' },
  { key: 'status', label: '状态' },
  { key: 'time', label: '时间' },
  { key: 'actions', label: '操作', fixed: true },
]

const {
  hidden: hiddenAlertColumns,
  isHidden: isAlertHidden,
  showAll: showAllAlertColumns,
  reset: resetAlertColumns,
} = useColumnSettings('device-detail-alerts', DEVICE_ALERT_COLUMNS)

/** OTA 记录：操作列固定显示。 */
const DEVICE_OTA_COLUMNS: ColumnOption[] = [
  { key: 'version', label: '目标版本' },
  { key: 'commandStatus', label: '指令状态' },
  { key: 'otaStage', label: 'OTA 阶段' },
  { key: 'progress', label: '进度' },
  { key: 'errorMsg', label: '失败原因' },
  { key: 'createTime', label: '创建时间' },
  { key: 'actions', label: '操作', fixed: true },
]

const {
  hidden: hiddenOtaColumns,
  isHidden: isOtaHidden,
  showAll: showAllOtaColumns,
  reset: resetOtaColumns,
} = useColumnSettings('device-detail-ota-records', DEVICE_OTA_COLUMNS)

const route = useRoute()
const router = useRouter()
const realtimeStore = useDeviceRealtimeStore()

const deviceId = computed(() => String(route.params.deviceId ?? ''))

const detail = ref<DeviceDetailVO | null>(null)
const detailLoading = ref(false)
const onlineState = ref<DeviceOnlineVO | null>(null)
const online = computed(() => onlineState.value?.online ?? isDeviceOnline(detail.value?.online))
/** 能力集/current_state 面板：快照 + /state 实时增量合并。 */
const realtimeStates = computed(() => realtimeStore.getStates(deviceId.value))
const realtimeConnected = computed(() => realtimeStore.connectionStatus === 'connected')
/** OTA 实时进度（/topic/device/{mac}/ota），为空时回退到 REST 快照。 */
const realtimeOtaProgress = computed(() => realtimeStore.getOtaProgress(deviceId.value))

const otaProgress = ref<OtaProgressVO | null>(null)
/** 失败重试后的轮询状态：成功前按钮保持 loading，避免“像又失败了”的错觉。 */
const otaRetrying = ref(false)
let otaRetryTimer: ReturnType<typeof setTimeout> | null = null
/** 3s 一次、最多 20 次（约 1 分钟），覆盖设备重试到成功的最长链路。 */
const OTA_RETRY_POLL_INTERVAL = 3000
const OTA_RETRY_MAX_ATTEMPTS = 20
const commandStats = ref<CommandStatsVO | null>(null)
const latestSensors = ref<SensorLatestVO[]>([])
const activeTab = ref('commands')

const loadedTabs = new Set<string>(['commands'])
const controlVisible = ref(false)
const controlTargets = computed(() =>
  detail.value ? availableControlTargets(detail.value) : Object.keys(CONTROL_TARGET_LABELS),
)

const otaTagType = computed<'success' | 'warning' | 'danger' | 'info'>(() => {
  const state = otaProgress.value?.otaState
  if (state === 'success') return 'success'
  if (state === 'failed') return 'danger'
  if (state) return 'warning'
  return 'info'
})

const goBack = () => {
  router.push({ name: 'MyDevices' })
}

const refreshAll = async () => {
  detailLoading.value = true
  try {
    detail.value = await deviceApi.detailMine(deviceId.value)
  } catch {
    detail.value = null
  } finally {
    detailLoading.value = false
  }
  if (!detail.value) return

  const tasks = [
    deviceApi.onlineMine(deviceId.value).then((res) => (onlineState.value = res)).catch(() => undefined),
    sensorApi.latest(deviceId.value).then((res) => (latestSensors.value = res || [])).catch(() => undefined),
    otaApi.progress(deviceId.value).then((res) => applyOtaSnapshot(res)).catch(() => undefined),
    deviceApi.commandStats(deviceId.value).then((res) => (commandStats.value = res)).catch(() => undefined),
  ]
  await Promise.all(tasks)
  realtimeStore.syncDevices([deviceId.value])
  loadCommands()
}

// ==================== 指令 ====================
const commands = ref<DeviceCommand[]>([])
const commandTotal = ref(0)
const commandsLoading = ref(false)
const commandQuery = reactive<{ pageNum: number; pageSize: number; status?: number }>({
  pageNum: 1,
  pageSize: 10,
  status: undefined,
})

const loadCommands = async () => {
  commandsLoading.value = true
  try {
    const res = await deviceApi.listCommands(deviceId.value, {
      pageNum: commandQuery.pageNum,
      pageSize: commandQuery.pageSize,
      status: commandQuery.status,
    })
    commands.value = res.records || []
    commandTotal.value = res.total || 0
  } catch {
    commands.value = []
    commandTotal.value = 0
  } finally {
    commandsLoading.value = false
  }
}

const handleCommandSearch = () => {
  commandQuery.pageNum = 1
  loadCommands()
}

// ==================== 传感器 ====================
const sensors = ref<DeviceSensorRecord[]>([])
const sensorTotal = ref(0)
const sensorsLoading = ref(false)
const sensorQuery = reactive({
  pageNum: 1,
  pageSize: 10,
  sensorKey: '',
  type: '',
})

const loadSensors = async () => {
  sensorsLoading.value = true
  try {
    const res = await sensorApi.listSensors(deviceId.value, {
      pageNum: sensorQuery.pageNum,
      pageSize: sensorQuery.pageSize,
      sensorKey: sensorQuery.sensorKey.trim() || undefined,
      type: sensorQuery.type.trim() || undefined,
    })
    sensors.value = res.records || []
    sensorTotal.value = res.total || 0
  } catch {
    sensors.value = []
    sensorTotal.value = 0
  } finally {
    sensorsLoading.value = false
  }
}

const handleSensorSearch = () => {
  sensorQuery.pageNum = 1
  loadSensors()
}

// ==================== 事件 ====================
const events = ref<DeviceEventRecord[]>([])
const eventTotal = ref(0)
const eventsLoading = ref(false)
const eventQuery = reactive({ pageNum: 1, pageSize: 10, type: '' })

const loadEvents = async () => {
  eventsLoading.value = true
  try {
    const res = await sensorApi.listEvents(deviceId.value, {
      pageNum: eventQuery.pageNum,
      pageSize: eventQuery.pageSize,
      type: eventQuery.type.trim() || undefined,
    })
    events.value = res.records || []
    eventTotal.value = res.total || 0
  } catch {
    events.value = []
    eventTotal.value = 0
  } finally {
    eventsLoading.value = false
  }
}

const handleEventSearch = () => {
  eventQuery.pageNum = 1
  loadEvents()
}

// ==================== 状态历史 ====================
const states = ref<DeviceStateRecord[]>([])
const stateTotal = ref(0)
const statesLoading = ref(false)
const stateQuery = reactive({ pageNum: 1, pageSize: 10 })

const loadStates = async () => {
  statesLoading.value = true
  try {
    const res = await sensorApi.listStates(deviceId.value, {
      pageNum: stateQuery.pageNum,
      pageSize: stateQuery.pageSize,
    })
    states.value = res.records || []
    stateTotal.value = res.total || 0
  } catch {
    states.value = []
    stateTotal.value = 0
  } finally {
    statesLoading.value = false
  }
}

const handleStateSearch = () => {
  stateQuery.pageNum = 1
  loadStates()
}

// ==================== 告警 ====================
const alerts = ref<DeviceAlertRecord[]>([])
const alertTotal = ref(0)
const alertsLoading = ref(false)
const alertQuery = reactive<{ pageNum: number; pageSize: number; status?: number }>({
  pageNum: 1,
  pageSize: 10,
  status: undefined,
})

const loadAlerts = async () => {
  alertsLoading.value = true
  try {
    const res = await alertApi.listMine({
      pageNum: alertQuery.pageNum,
      pageSize: alertQuery.pageSize,
      deviceId: deviceId.value,
      status: alertQuery.status,
    })
    alerts.value = res.records || []
    alertTotal.value = res.total || 0
  } catch {
    alerts.value = []
    alertTotal.value = 0
  } finally {
    alertsLoading.value = false
  }
}

const handleAlertSearch = () => {
  alertQuery.pageNum = 1
  loadAlerts()
}

const handleAckAlert = async (row: DeviceAlertRecord) => {
  if (row.id == null) return
  try {
    await alertApi.ack(row.id)
    ElMessage.success('告警已确认')
    loadAlerts()
  } catch {
    // 失败原因由统一请求层提示
  }
}

// ==================== OTA 记录 ====================
const otaRecords = ref<OtaRecordVO[]>([])
const otaTotal = ref(0)
const otaRecordsLoading = ref(false)
const otaQuery = reactive({ pageNum: 1, pageSize: 10 })

const loadOtaRecords = async () => {
  otaRecordsLoading.value = true
  try {
    const res = await otaApi.records({
      pageNum: otaQuery.pageNum,
      pageSize: otaQuery.pageSize,
      deviceId: deviceId.value,
    })
    otaRecords.value = res.records || []
    otaTotal.value = res.total || 0
  } catch {
    otaRecords.value = []
    otaTotal.value = 0
  } finally {
    otaRecordsLoading.value = false
  }
}

const handleOtaSearch = () => {
  otaQuery.pageNum = 1
  loadOtaRecords()
}

const stopOtaRetryPolling = () => {
  if (otaRetryTimer) {
    clearTimeout(otaRetryTimer)
    otaRetryTimer = null
  }
}

/**
 * 重试后轮询进度，直到成功或达到上限。
 * 说明：重试后后端状态可能仍短暂为 failed（设备尚未开始），
 * 因此不能收到 failed 就停，必须等到 success 或轮询窗口结束。
 */
const pollOtaRetryProgress = async (attempt = 0) => {
  if (!otaRetrying.value) return

  try {
    const progress = await otaApi.progress(deviceId.value)
    applyOtaSnapshot(progress)
    if (progress?.otaState === 'success') {
      otaRetrying.value = false
      // 升级已成功，清空旧的“发现新版本”结果，避免继续展示“立即升级”。
      otaCheckResult.value = null
      loadOtaRecords()
      return
    }
  } catch {
    // 单次查询失败不中断轮询，最终由上限兜底
  }

  if (attempt >= OTA_RETRY_MAX_ATTEMPTS) {
    otaRetrying.value = false
    return
  }
  otaRetryTimer = setTimeout(() => {
    void pollOtaRetryProgress(attempt + 1)
  }, OTA_RETRY_POLL_INTERVAL)
}

const handleOtaRetry = async () => {
  if (otaRetrying.value) return
  otaRetrying.value = true
  try {
    await otaApi.retry(deviceId.value)
    ElMessage.success('重试指令已下发')
    loadOtaRecords()
    stopOtaRetryPolling()
    void pollOtaRetryProgress()
  } catch {
    otaRetrying.value = false
    // 非失败/超时/取消状态由统一请求层提示
  }
}

// ==================== OTA 检查/升级 ====================
const otaVisible = ref(false)
const otaChecking = ref(false)
const otaCheckResult = ref<OtaCheckResponse | null>(null)

const handleOtaCheck = async () => {
  otaCheckResult.value = null
  otaVisible.value = true
  otaChecking.value = true
  try {
    otaCheckResult.value = await otaApi.check(deviceId.value)
  } catch {
    otaVisible.value = false
  } finally {
    otaChecking.value = false
  }
}

const handleOtaStart = async () => {
  otaChecking.value = true
  try {
    await otaApi.start(deviceId.value)
    ElMessage.success('升级指令已下发，进度将在设备状态更新后同步')
    otaVisible.value = false
    loadOtaRecords()
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    otaChecking.value = false
  }
}

// ==================== 编辑设备 ====================
const editVisible = ref(false)
const editSaving = ref(false)
const editFormRef = ref<FormInstance>()
const editForm = reactive({ deviceName: '', location: '' })

const editRules: FormRules = {
  deviceName: [{ max: 64, message: '设备名称不能超过 64 位', trigger: 'blur' }],
  location: [{ max: 128, message: '位置不能超过 128 位', trigger: 'blur' }],
}

const openEditDialog = () => {
  editForm.deviceName = detail.value?.deviceName ?? ''
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

  const payload: UserDeviceUpdateRequest = {
    deviceName: editForm.deviceName.trim() || undefined,
    location: editForm.location.trim() || undefined,
  }

  editSaving.value = true
  try {
    await deviceApi.updateMine(deviceId.value, payload)
    ElMessage.success('设备信息已更新')
    editVisible.value = false
    refreshAll()
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    editSaving.value = false
  }
}

// ==================== 批量控制 ====================
interface BatchRow {
  action: string
  target: string
  channel: number
  paramsText: string
}

const batchVisible = ref(false)
const batchSubmitting = ref(false)
const batchRows = ref<BatchRow[]>([])

const addBatchRow = () => {
  const target = controlTargets.value[0] ?? 'mos'
  batchRows.value.push({
    action: 'set',
    target,
    channel: 0,
    paramsText: JSON.stringify(defaultControlParams(target)),
  })
}

/**
 * 切换控制目标时重置通道与参数：
 *   - 通道上限随 capabilities 变化（如 led:3 → 0~3），避免残留越界通道号；
 *   - 参数恢复为该目标的默认结构（开关 state / 舵机 angle）。
 */
const handleBatchTargetChange = (row: BatchRow) => {
  row.channel = 0
  row.paramsText = JSON.stringify(defaultControlParams(row.target))
}

const removeBatchRow = (index: number) => {
  batchRows.value.splice(index, 1)
}

const openBatchDialog = () => {
  batchRows.value = []
  addBatchRow()
  addBatchRow()
  batchVisible.value = true
}

const submitBatch = async () => {
  const items = []
  for (const row of batchRows.value) {
    let params: unknown
    try {
      params = JSON.parse(row.paramsText)
    } catch {
      ElMessage.warning('每条指令的参数都必须是合法 JSON')
      return
    }
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      ElMessage.warning('参数必须是 JSON 对象，如 {"state":1}')
      return
    }
    // 通道下发规则与单条控制一致：只有按通道操作的物理目标才携带 channel。
    items.push({
      action: row.action,
      target: row.target,
      channel: supportsChannel(row.target) ? row.channel : undefined,
      params: params as Record<string, unknown>,
    })
  }

  batchSubmitting.value = true
  try {
    const commandIds = await deviceApi.batchControl(deviceId.value, { items })
    ElMessage.success(`批量指令已下发（${commandIds?.length ?? 0} 条）`)
    batchVisible.value = false
    loadCommands()
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    batchSubmitting.value = false
  }
}

// ==================== 指令详情/取消 ====================
const commandDetailVisible = ref(false)
const selectedCommand = ref<DeviceCommand | null>(null)

const openCommandDetail = (command: DeviceCommand) => {
  selectedCommand.value = command
  commandDetailVisible.value = true
}

const handleCancelCommand = (command: DeviceCommand) => {
  ElMessageBox.confirm('确定取消该未下发指令吗？', '取消指令', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      try {
        const cancelled = await commandApi.cancel(command.commandId)
        if (cancelled) {
          ElMessage.success('指令已取消')
          loadCommands()
        } else {
          ElMessage.warning('该指令已下发或已进入终态，无法取消')
        }
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

watch(activeTab, (tab) => {
  // 首次进入某个 Tab 时才发起对应分页请求，避免页面初始 6 个请求并发。
  if (loadedTabs.has(tab)) return
  loadedTabs.add(tab)
  if (tab === 'sensors') loadSensors()
  else if (tab === 'events') loadEvents()
  else if (tab === 'states') loadStates()
  else if (tab === 'alerts') loadAlerts()
  else if (tab === 'ota') loadOtaRecords()
})

const handleControlSuccess = () => {
  loadCommands()
  deviceApi.commandStats(deviceId.value).then((res) => (commandStats.value = res)).catch(() => undefined)
}

/**
 * 快照 / 实时合并：终态优先，其次进度更大者。
 * 避免页面刷新拿到的旧快照把 WS 已推送的更新进度覆盖回去。
 *
 * 注意：后端在指令 TIMEOUT 时会清空 device_info 的 OTA 字段且**不推送**，
 * 因此 REST 返回 `otaState=null` 时以快照为准，防止页面永久停留在「升级中」。
 */
const applyOtaSnapshot = (snapshot: OtaProgressVO | null) => {
  if (snapshot && !snapshot.otaState) {
    otaProgress.value = null
    return
  }

  const pushed = realtimeOtaProgress.value
  if (!pushed) {
    otaProgress.value = snapshot
    return
  }
  if (
    !snapshot ||
    pushed.finished ||
    (!snapshot.finished && (pushed.otaProgress ?? 0) >= (snapshot.otaProgress ?? 0))
  ) {
    otaProgress.value = pushed
    return
  }
  otaProgress.value = snapshot
}

/** 终态副作用：停止轮询、刷新记录、成功时同步设备版本号并清理升级入口。 */
const handleOtaResult = (result: OtaProgressVO) => {
  if (!result.finished) return

  stopOtaRetryPolling()
  otaRetrying.value = false

  if (result.otaState === 'success') {
    otaCheckResult.value = null
    if (detail.value && result.otaVersion) {
      detail.value = { ...detail.value, firmware: result.otaVersion }
    }
  }
  void loadOtaRecords()
}

/**
 * 升级进行中兜底轮询（文档 11.5）：WS 为主通道，每 2s 拉一次 /progress。
 * 覆盖两类 WS 无法覆盖的场景：
 *   1. 指令 TIMEOUT：后端清空 OTA 字段但不推送；
 *   2. 断线重连期间丢失的中间阶段。
 */
const OTA_FALLBACK_POLL_INTERVAL = 2000
let otaFallbackTimer: ReturnType<typeof setTimeout> | null = null

const stopOtaFallbackPolling = () => {
  if (otaFallbackTimer) {
    clearTimeout(otaFallbackTimer)
    otaFallbackTimer = null
  }
}

const pollOtaProgressFallback = async () => {
  otaFallbackTimer = null
  if (!deviceId.value) return

  try {
    applyOtaSnapshot(await otaApi.progress(deviceId.value))
  } catch {
    // 单次失败不终止轮询，由下一次重试继续
  }

  const current = otaProgress.value
  if (current?.finished) handleOtaResult(current)
  if (current?.running) scheduleOtaFallbackPolling()
}

function scheduleOtaFallbackPolling() {
  if (otaFallbackTimer) return
  otaFallbackTimer = setTimeout(() => void pollOtaProgressFallback(), OTA_FALLBACK_POLL_INTERVAL)
}

/** 实时推送驱动的页面更新：进度/阶段即时刷新，无需手动点「刷新」。 */
watch(realtimeOtaProgress, (pushed) => {
  if (!pushed) return
  applyOtaSnapshot(pushed)
  handleOtaResult(pushed)
})

/** 仅在升级进行中才启动兜底轮询，终态立即停止，避免无意义的空转请求。 */
watch(
  () => otaProgress.value?.running === true,
  (running) => {
    if (running) scheduleOtaFallbackPolling()
    else stopOtaFallbackPolling()
  },
)

/** 断线重连后先拉一次快照补齐丢失的阶段（文档 11.4 / 11.5）。 */
let wsEverConnected = false
watch(
  () => realtimeStore.connectionStatus,
  (status) => {
    if (status !== 'connected') return
    if (wsEverConnected) {
      otaApi.progress(deviceId.value).then((res) => applyOtaSnapshot(res)).catch(() => undefined)
    }
    wsEverConnected = true
  },
)

onMounted(async () => {
  realtimeStore.connect()
  await refreshAll()
})

onUnmounted(() => {
  stopOtaRetryPolling()
  stopOtaFallbackPolling()
  realtimeStore.disconnect()
})
</script>

<style scoped>
.device-detail-page {
  padding: 10px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
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
.page-alert {
  margin-bottom: 16px;
}
.stat-row {
  margin-top: 16px;
}
.inner-card h4 {
  margin: 0 0 12px;
  font-size: 14px;
  color: #303133;
}
.ota-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.progress-bar {
  width: 100%;
}
.ota-meta {
  font-size: 12px;
  color: #909399;
}
.ota-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.ota-retry-hint {
  font-size: 12px;
  color: #909399;
}
.stat-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.detail-tabs {
  margin-top: 20px;
}
.tab-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.latest-sensors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.muted {
  font-size: 12px;
  color: #909399;
}
.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.batch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.batch-params {
  flex: 1;
}
.batch-channel-hint {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
}
.dialog-alert {
  margin-bottom: 16px;
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
.mono {
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 12px;
}
.ota-body {
  min-height: 160px;
}
</style>
