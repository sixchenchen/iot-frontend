<template>
  <el-card shadow="never" class="state-panel">
    <template #header>
      <div class="panel-header">
        <div class="panel-title">
          <h4>能力集与实时状态</h4>
          <el-tag v-if="live" type="success" size="small" effect="plain">实时</el-tag>
          <el-tag v-else type="info" size="small" effect="plain">快照</el-tag>
        </div>
        <span class="panel-meta">{{ updatedText }}</span>
      </div>
      <div v-if="capabilities.length" class="cap-list">
        <el-tag
          v-for="cap in capabilities"
          :key="cap.key"
          type="info"
          size="small"
          effect="plain"
        >
          {{ cap.label }} {{ cap.count }} 路
        </el-tag>
      </div>
      <div v-if="hasControllable" class="control-hint">
        点击通道状态可直接控制：开关型取反，舵机调整角度
      </div>
    </template>

    <div v-if="view.hasState" class="state-body">
      <div v-for="group in view.groups" :key="group.target" class="state-group">
        <div class="group-title">
          <span>{{ group.label }}</span>
          <span v-if="group.capacity" class="group-count">{{ group.capacity }} 路</span>
        </div>
        <div class="channel-list">
          <div
            v-for="channel in group.channels"
            :key="channel.key"
            class="channel"
            :class="{
              'is-off': describeChannelState(group.target, channel.value).active === false,
              'is-clickable': isControllable(group.target),
            }"
            :role="isControllable(group.target) ? 'button' : undefined"
            :tabindex="isControllable(group.target) ? 0 : undefined"
            :aria-label="
              isControllable(group.target)
                ? `${channelLabel(group, channel)} ${describeChannelState(group.target, channel.value).text}，点击控制`
                : undefined
            "
            @click="handleChannelClick(group.target, channel)"
            @keydown.enter.prevent="handleChannelClick(group.target, channel)"
          >
            <span class="channel-name">
              {{ channelLabel(group, channel) }}
              <i v-if="channel.realtime" class="live-dot" title="实时推送" />
            </span>
            <el-tag v-if="channelPending(channel)" size="small" type="info" effect="plain">
              下发中…
            </el-tag>
            <el-tag
              v-else
              size="small"
              :type="channelTagType(group.target, channel.value)"
              effect="dark"
            >
              {{ describeChannelState(group.target, channel.value).text }}
            </el-tag>
          </div>
        </div>
      </div>

      <div v-if="extraKeys.length" class="state-group is-extra">
        <div class="group-title">
          <span>其他状态</span>
        </div>
        <div class="channel-list">
          <div v-for="key in extraKeys" :key="key" class="channel">
            <span class="channel-name">{{ key }}</span>
            <el-tag size="small" type="info" effect="plain">{{ formatExtra(key) }}</el-tag>
          </div>
        </div>
      </div>
    </div>
    <el-empty v-else description="设备尚未上报状态" :image-size="48" />

    <el-collapse class="raw-collapse">
      <el-collapse-item title="查看原始 JSON" name="raw">
        <div class="raw-grid">
          <div>
            <h5>capabilities</h5>
            <pre class="json-box">{{ prettyJSON(device?.capabilities) }}</pre>
          </div>
          <div>
            <h5>current_state</h5>
            <pre class="json-box">{{ prettyJSON(device?.currentState) }}</pre>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </el-card>

  <el-dialog
    v-model="servoDialog.visible"
    title="调整舵机角度"
    width="360px"
    append-to-body
    :close-on-click-modal="false"
  >
    <el-form label-width="88px">
      <el-form-item :label="servoChannelLabel">
        <el-slider v-model="servoDialog.angle" :min="0" :max="180" show-input />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="servoDialog.visible = false">取消</el-button>
      <el-button type="primary" :loading="servoSubmitting" @click="submitServo">下发</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { deviceApi } from '@/features/device/api/deviceApi'
import { useDeviceRealtimeStore } from '@/stores/useDeviceRealtimeStore'
import type { Device, AdminDeviceCommandRequest } from '@/types/device'
import type { RealtimeStateEntry } from '@/lib/ws/realtime-state'
import { isDeviceOnline } from '@/utils/device'
import {
  STATE_TARGET_LABELS,
  buildDeviceStateView,
  describeChannelState,
  summarizeCapabilities,
  type StateChannel,
  type StateTarget,
  type TargetStateGroup,
} from '@/utils/device-state'
import { prettyJSON } from '@/utils/device'

/**
 * ============================================================================
 * 设备能力集 / 当前状态面板（用户端与管理端详情页共用）
 * ============================================================================
 * 数据来源：
 *   1. `GET /user|admin/devices/{id}` 的 capabilities / currentState 快照；
 *   2. `/topic/device/{mac}/state` 的实时增量（同键覆盖快照）。
 *
 * 展示策略：
 *   - 按 capabilities 的通道数补齐未上报通道，避免「只看到 1 路」的误判；
 *   - 未知 key 不猜测语义，统一放入「其他状态」；
 *   - 原始 JSON 收进折叠面板，便于联调排查。
 * ============================================================================
 */
const props = withDefaults(
  defineProps<{
    device: Device | null
    /** 实时增量状态（store.getStates(deviceId)）。 */
    states?: RealtimeStateEntry[]
    /** WebSocket 是否已连接，仅影响「实时/快照」标签。 */
    live?: boolean
    /** 控制模式：用户端走 /user/control，管理端走 /admin/command。 */
    mode?: 'user' | 'admin'
  }>(),
  { states: () => [], live: false, mode: 'user' },
)

const realtimeStore = useDeviceRealtimeStore()
/** 正在下发中的通道（key 为 target 或 target_channel），防止重复点击。 */
const pendingKeys = ref(new Set<string>())
const servoSubmitting = ref(false)
const servoDialog = reactive({
  visible: false,
  channel: null as number | null,
  key: '',
  angle: 90,
})

const view = computed(() =>
  buildDeviceStateView(props.device?.capabilities, props.device?.currentState, props.states),
)

const capabilities = computed(() => summarizeCapabilities(props.device?.capabilities))

const extraKeys = computed(() => Object.keys(view.value.extra))

const hasControllable = computed(() =>
  view.value.groups.some((group) => isControllable(group.target)),
)

const servoChannelLabel = computed(() =>
  servoDialog.channel === null ? '舵机总控' : `舵机 ${servoDialog.channel}`,
)

/** 只有具备物理执行能力的目标允许点击控制；其他状态保持只读。 */
function isControllable(target: StateTarget): boolean {
  return STATE_TARGET_LABELS[target] !== undefined
}

function channelPending(channel: StateChannel): boolean {
  return pendingKeys.value.has(channel.key)
}

function handleChannelClick(target: StateTarget, channel: StateChannel): void {
  if (!isControllable(target) || channelPending(channel)) return

  const device = props.device
  if (!device) return
  if (!isDeviceOnline(device.online)) {
    ElMessage.warning('设备离线，无法下发控制指令')
    return
  }

  if (target === 'servo') {
    openServoDialog(channel)
    return
  }

  // 开关型：按当前展示值取反，避免依赖后端 toggle 语义差异。
  const display = describeChannelState(target, channel.value)
  const nextState = display.active === true ? 0 : 1
  void dispatchControl(target, channel.channel, { state: nextState }, channel.key)
}

function openServoDialog(channel: StateChannel): void {
  const current = channel.value === null || channel.value === undefined ? 90 : Number(channel.value)
  servoDialog.channel = channel.channel
  servoDialog.key = channel.key
  servoDialog.angle = Number.isFinite(current) ? Math.min(180, Math.max(0, current)) : 90
  servoDialog.visible = true
}

async function submitServo(): Promise<void> {
  servoSubmitting.value = true
  const ok = await dispatchControl(
    'servo',
    servoDialog.channel,
    { angle: servoDialog.angle },
    servoDialog.key,
  )
  servoSubmitting.value = false
  if (ok) servoDialog.visible = false
}

/**
 * 统一下发入口：先订阅再下发；成功后靠 `/state` 刷新权威状态，
 * 仅当收到失败回执时给出错误提示，避免成功路径噪音。
 */
async function dispatchControl(
  target: StateTarget,
  channel: number | null,
  params: Record<string, unknown>,
  key: string,
): Promise<boolean> {
  const device = props.device
  if (!device || pendingKeys.value.has(key)) return false

  pendingKeys.value.add(key)
  try {
    realtimeStore.connect()
    realtimeStore.subscribeDevice(device.deviceId)

    const payload: AdminDeviceCommandRequest = {
      action: 'set',
      target,
      channel: channel ?? 0,
      params,
    }
    const commandId =
      props.mode === 'admin'
        ? await deviceApi.sendCommand(device.id, payload)
        : await deviceApi.controlDevice({ ...payload, deviceId: device.deviceId })

    ElMessage.success(`${STATE_TARGET_LABELS[target]} 指令已下发，等待设备回执`)

    if (commandId) {
      void realtimeStore
        .waitForCommandResult(commandId, {
          deviceId: device.deviceId,
          // 管理端没有按 ID 查询指令的接口，只等推送。
          poll: props.mode === 'admin' ? null : undefined,
        })
        .then((outcome) => {
          const result = outcome.result
          if (result?.success === false) {
            ElMessage.error(
              `设备执行失败：${result.errorMsg || result.statusText || '未知原因'}`,
            )
          }
        })
    }
    return true
  } catch {
    // 统一请求层已提示错误
    return false
  } finally {
    pendingKeys.value.delete(key)
  }
}

const updatedText = computed(() => {
  const latest = props.states.reduce((max, item) => Math.max(max, item.updatedAt), 0)
  if (!latest) return '暂无实时推送'
  return `最后推送 ${new Date(latest).toLocaleTimeString('zh-CN', { hour12: false })}`
})

function channelLabel(group: TargetStateGroup, channel: StateChannel): string {
  if (channel.channel === null) return '总控'
  return `${STATE_TARGET_LABELS[group.target]} ${channel.channel}`
}

function channelTagType(
  target: StateTarget,
  value: unknown,
): 'success' | 'info' | 'warning' {
  const display = describeChannelState(target, value)
  if (display.active === true) return 'success'
  if (display.active === false) return 'info'
  return 'warning'
}

function formatExtra(key: string): string {
  const value = view.value.extra[key]
  if (value === null || value === undefined) return '-'
  return typeof value === 'object' ? prettyJSON(value) : String(value)
}
</script>

<style scoped>
.state-panel {
  margin-top: 16px;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.panel-title h4 {
  margin: 0;
  font-size: 15px;
}
.panel-meta {
  font-size: 12px;
  color: #909399;
}
.cap-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.control-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}
.state-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.state-group {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 12px;
}
.group-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-weight: 600;
  font-size: 13px;
}
.group-count {
  font-weight: 400;
  font-size: 12px;
  color: #909399;
}
.channel-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}
.channel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: 4px;
  background: #f5f7fa;
  font-size: 13px;
}
.channel.is-off {
  background: #fafafa;
  color: #909399;
}
.channel.is-clickable {
  cursor: pointer;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
  border: 1px solid transparent;
}
.channel.is-clickable:hover,
.channel.is-clickable:focus-visible {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.12);
  outline: none;
}
.channel-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #67c23a;
  flex-shrink: 0;
}
.state-group.is-extra .channel-list {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}
.raw-collapse {
  margin-top: 12px;
}
.raw-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}
.raw-grid h5 {
  margin: 0 0 6px;
  font-size: 12px;
  color: #909399;
}
.json-box {
  margin: 0;
  padding: 8px;
  max-height: 220px;
  overflow: auto;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  background: #f5f7fa;
  border-radius: 4px;
}
</style>
