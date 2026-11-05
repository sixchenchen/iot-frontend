<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="(value: boolean) => emit('update:modelValue', value)"
  >
    <el-alert
      type="info"
      :closable="false"
      title="指令为异步下发，接口成功仅代表已受理；设备执行结果将在下方实时回执中展示。"
      class="dialog-alert"
    />
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="动作" prop="action">
        <el-select v-model="form.action" style="width: 100%">
          <el-option
            v-for="action in CONTROL_ACTIONS"
            :key="action"
            :label="ACTION_LABELS[action]"
            :value="action"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="控制目标" prop="target">
        <el-select v-model="form.target" style="width: 100%" @change="handleTargetChange">
          <el-option
            v-for="target in controlTargets"
            :key="target"
            :label="CONTROL_TARGET_LABELS[target] || target"
            :value="target"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="channelVisible" label="通道">
        <el-input-number v-model="form.channel" :min="0" :max="channelMax" />
        <span class="field-hint">
          0 表示全部（{{ CONTROL_TARGET_LABELS[form.target] || form.target }} 共
          {{ channelMax }} 路，编号 1~{{ channelMax }}）
        </span>
      </el-form-item>
      <el-form-item label="参数 (JSON)" prop="paramsText">
        <el-input
          v-model="form.paramsText"
          type="textarea"
          :rows="4"
          class="mono-input"
          placeholder='如 {"state":1}、{"brightness":80}、{"angle":90}'
        />
      </el-form-item>
    </el-form>

    <el-alert
      v-if="tracking"
      type="info"
      :closable="false"
      show-icon
      title="指令已下发，等待设备执行回执…"
      class="result-alert"
    />
    <el-alert
      v-else-if="execution"
      :type="executionAlertType"
      :closable="false"
      show-icon
      :title="executionTitle"
      class="result-alert"
    >
      <p v-if="execution.errorMsg" class="result-error">{{ execution.errorMsg }}</p>
      <div v-if="execution.result?.responsePayload" class="result-payload">
        <span class="result-label">设备返回</span>
        <pre class="mono-block">{{ prettyJSON(execution.result.responsePayload) }}</pre>
      </div>
    </el-alert>

    <template #footer>
      <el-button @click="closeDialog">{{ tracking || execution ? '关闭' : '取消' }}</el-button>
      <el-button type="primary" :disabled="tracking" :loading="submitting" @click="submit">
        下发指令
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { deviceApi } from '@/features/device/api/deviceApi'
import { useDeviceRealtimeStore } from '@/stores/useDeviceRealtimeStore'
import type { CommandExecution } from '@/lib/ws/command-tracker'
import type { AdminDeviceCommandRequest, Device } from '@/types/device'
import { COMMAND_STATUS_LABELS } from '@/utils/status'
import {
  CONTROL_ACTIONS,
  CONTROL_TARGET_LABELS,
  availableControlTargets,
  channelCountOf,
  defaultControlParams,
  prettyJSON,
  supportsChannel,
} from '@/utils/device'

/**
 * ============================================================================
 * 设备控制弹窗（用户端 / 管理端复用）
 * ============================================================================
 * 单一职责：收集 action/target/channel/params 并调用对应接口。
 * 控制目标按设备 capabilities 过滤，避免下发明显非法的组合。
 * ============================================================================
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    device: Device | null
    mode?: 'user' | 'admin'
  }>(),
  { mode: 'user' },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: [commandId: string | null]
}>()

const ACTION_LABELS: Record<string, string> = {
  set: '设置 (set)',
  get: '读取 (get)',
  toggle: '切换 (toggle)',
  start: '启动 (start)',
  reset: '重置 (reset)',
  cancel: '取消 (cancel)',
}

const realtimeStore = useDeviceRealtimeStore()
const formRef = ref<FormInstance>()
const submitting = ref(false)
/** 是否正在等待设备回执（10s 内走推送，超时后接口兜底）。 */
const tracking = ref(false)
const execution = ref<CommandExecution | null>(null)
/** 会话令牌：重新打开弹窗/再次下发后，忽略旧指令的迟到结果。 */
let trackToken = 0
const form = reactive({
  action: 'set',
  target: 'mos',
  channel: 0,
  paramsText: '{\n  "state": 1\n}',
})

const controlTargets = computed(() =>
  props.device ? availableControlTargets(props.device) : Object.keys(CONTROL_TARGET_LABELS),
)
/** LED / MOS / 继电器 / 舵机均按 capabilities 的通道数选择，0 表示全部。 */
const channelVisible = computed(() => supportsChannel(form.target))
const channelMax = computed(() => channelCountOf(props.device ?? {}, form.target))

const dialogTitle = computed(() => {
  const name = props.device?.deviceName || props.device?.deviceId || ''
  return name ? `控制设备 - ${name}` : '控制设备'
})

const rules: FormRules = {
  action: [{ required: true, message: '请选择动作', trigger: 'change' }],
  target: [{ required: true, message: '请选择控制目标', trigger: 'change' }],
  paramsText: [{ required: true, message: '请填写 JSON 参数', trigger: 'blur' }],
}

const resetForm = () => {
  form.action = 'set'
  form.target = props.device ? (availableControlTargets(props.device)[0] ?? 'mos') : 'mos'
  form.channel = 0
  form.paramsText = JSON.stringify(defaultControlParams(form.target), null, 2)
  formRef.value?.clearValidate()
}

const handleTargetChange = () => {
  // 切换目标后通道数变化，重置为 0（全部），避免残留越界值。
  form.channel = 0
  form.paramsText = JSON.stringify(defaultControlParams(form.target), null, 2)
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      resetForm()
      execution.value = null
      tracking.value = false
      trackToken += 1
    }
  },
)

const executionAlertType = computed<'success' | 'warning' | 'info' | 'error'>(() => {
  const result = execution.value?.result
  if (!result) return 'warning'
  if (result.success === true) return 'success'
  if (result.success === false) return 'error'
  // success === null：指令已受理但仍在执行（如 OTA），按提示处理。
  return 'info'
})

function labelOfStatus(status: number): string {
  return COMMAND_STATUS_LABELS[status] ?? `状态 ${status}`
}

const executionTitle = computed(() => {
  const current = execution.value
  if (!current) return ''
  if (current.source === 'timeout' || !current.result) {
    return current.errorMsg || '未收到设备执行回执'
  }
  const statusText = current.result.statusText || labelOfStatus(current.result.status)
  const prefix = current.source === 'poll' ? '接口兜底查询：' : '设备回执：'
  return `${prefix}${statusText}`
})

/** 弹窗关闭后仍会继续等待结果，用全局提示告知用户，避免结果丢失。 */
const notifyResult = (current: CommandExecution) => {
  const message = executionTitle.value
  const result = current.result
  if (!result) {
    ElMessage.warning(message)
    return
  }
  if (result.success === true) {
    ElMessage.success(message)
  } else if (result.success === false) {
    ElMessage.error(message)
  } else {
    ElMessage.info(message)
  }
}

const closeDialog = () => {
  // 跟踪会话失效：关闭后再打开不会显示旧指令结果。
  trackToken += 1
  emit('update:modelValue', false)
}

const runTracking = async (commandId: string, token: number) => {
  const outcome = await realtimeStore.waitForCommandResult(commandId, {
    deviceId: props.device?.deviceId ?? null,
    // 管理端没有按 ID 查询指令的接口，只能等推送，超时后提示未知。
    poll: props.mode === 'admin' ? null : undefined,
  })

  if (token !== trackToken) return
  tracking.value = false
  execution.value = outcome
  if (!props.modelValue) notifyResult(outcome)
}

const submit = async () => {
  if (!props.device || !formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  let params: unknown
  try {
    params = JSON.parse(form.paramsText)
  } catch {
    ElMessage.warning('参数必须是合法的 JSON')
    return
  }
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    ElMessage.warning('参数必须是 JSON 对象，如 {"state":1}')
    return
  }

  const payload: AdminDeviceCommandRequest = {
    action: form.action,
    target: form.target,
    params: params as Record<string, unknown>,
  }
  if (channelVisible.value) payload.channel = form.channel

  submitting.value = true
  try {
    // 文档 6.8：必须先订阅 /command 再下发，避免极快的 ACK 丢失。
    realtimeStore.connect()
    realtimeStore.subscribeDevice(props.device.deviceId)

    const commandId =
      props.mode === 'admin'
        ? await deviceApi.sendCommand(props.device.id, payload)
        : await deviceApi.controlDevice({ ...payload, deviceId: props.device.deviceId })

    ElMessage.success(
      commandId ? `指令已下发，指令 ID：${commandId}` : '指令已下发，执行结果以设备状态更新为准',
    )
    emit('success', commandId)

    if (!commandId) {
      // 后端未返回 commandId（例如异步受理场景），无法按 ID 匹配，保持原有行为。
      emit('update:modelValue', false)
      return
    }

    execution.value = null
    tracking.value = true
    const token = ++trackToken
    void runTracking(commandId, token)
  } catch {
    // 4200/4201/4210/4211 由统一请求层提示
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.dialog-alert {
  margin-bottom: 16px;
}
.field-hint {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}
.mono-input :deep(textarea) {
  font-family: Consolas, Monaco, 'Courier New', monospace;
}
.result-alert {
  margin-top: 8px;
}
.result-error {
  margin: 6px 0 0;
  font-size: 13px;
}
.result-label {
  font-size: 12px;
  color: #909399;
}
.mono-block {
  margin: 4px 0 0;
  padding: 8px;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  background: #f5f7fa;
  border-radius: 4px;
}
</style>
