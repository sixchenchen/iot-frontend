<template>
  <div class="firmware-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <h3>固件管理</h3>
          <div class="actions">
            <el-button v-permission="'firmware:upload'" type="primary" @click="openUploadDialog">
              上传固件
            </el-button>
            <el-button v-permission="'ota:create'" @click="openBatchDialog">批量下发</el-button>
            <el-button :loading="activeTab === 'firmware' ? firmwareLoading : taskLoading" @click="refreshActiveTab">
              刷新
            </el-button>
          </div>
        </div>
      </template>

      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <!-- ==================== 固件列表 ==================== -->
        <el-tab-pane label="固件列表" name="firmware">
          <el-form :inline="true" class="filter-form" @submit.prevent>
            <el-form-item label="关键字">
              <el-input
                v-model="firmwareQuery.keyword"
                placeholder="版本号"
                clearable
                style="width: 160px"
                @keyup.enter="handleFirmwareSearch"
              />
            </el-form-item>
            <el-form-item label="产品">
              <el-select
                v-model="firmwareQuery.product"
                placeholder="全部"
                clearable
                filterable
                allow-create
                style="width: 170px"
              >
                <el-option v-for="item in products" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="firmwareQuery.status" placeholder="全部" clearable style="width: 120px">
                <el-option
                  v-for="(label, value) in FIRMWARE_STATUS_LABELS"
                  :key="value"
                  :label="label"
                  :value="Number(value)"
                />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleFirmwareSearch">查询</el-button>
              <el-button @click="handleFirmwareReset">重置</el-button>
              <ColumnSettings
                v-model:hidden="hiddenFirmwareColumns"
                :columns="FIRMWARE_COLUMNS"
                @show-all="showAllFirmwareColumns"
                @reset="resetFirmwareColumns"
              />
            </el-form-item>
          </el-form>

          <el-table :data="firmwareList" v-loading="firmwareLoading" stripe>
            <template #empty>
              <el-empty description="暂无固件，请先上传" :image-size="70" />
            </template>
            <el-table-column v-if="!isFirmwareHidden('version')" prop="version" label="版本号" width="110" />
            <el-table-column v-if="!isFirmwareHidden('product')" prop="product" label="产品型号" min-width="130" />
            <el-table-column v-if="!isFirmwareHidden('size')" label="大小" width="100">
              <template #default="{ row }">{{ row.sizeText || formatBytes(row.size) }}</template>
            </el-table-column>
            <el-table-column v-if="!isFirmwareHidden('md5')" label="MD5" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ row.md5 || '-' }}</template>
            </el-table-column>
            <el-table-column v-if="!isFirmwareHidden('uploadedBy')" prop="uploadedBy" label="上传人" width="110">
              <template #default="{ row }">{{ row.uploadedBy || '-' }}</template>
            </el-table-column>
            <el-table-column v-if="!isFirmwareHidden('uploadTime')" label="上传时间" width="170">
              <template #default="{ row }">{{ formatDateTime(row.uploadTime) }}</template>
            </el-table-column>
            <el-table-column v-if="!isFirmwareHidden('status')" label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="FIRMWARE_STATUS_TAG_TYPES[row.status] || 'info'" size="small">
                  {{ FIRMWARE_STATUS_LABELS[row.status] || row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="180" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openFirmwareDetail(row as FirmwareVO)">
                  详情
                </el-button>
                <el-button
                  v-permission="'firmware:upload'"
                  link
                  :type="row.status === 1 ? 'warning' : 'success'"
                  @click="handleToggleFirmware(row as FirmwareVO)"
                >
                  {{ row.status === 1 ? '禁用' : '启用' }}
                </el-button>
                <el-button
                  v-permission="'firmware:delete'"
                  link
                  type="danger"
                  @click="handleDeleteFirmware(row as FirmwareVO)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination-container">
            <el-pagination
              v-model:current-page="firmwareQuery.pageNum"
              v-model:page-size="firmwareQuery.pageSize"
              :total="firmwareTotal"
              :page-sizes="[10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              @size-change="handleFirmwareSearch"
              @current-change="loadFirmware"
            />
          </div>
        </el-tab-pane>

        <!-- ==================== OTA 任务 ==================== -->
        <el-tab-pane label="OTA 任务" name="tasks">
          <el-form :inline="true" class="filter-form" @submit.prevent>
            <el-form-item label="任务状态">
              <el-input-number v-model="taskQuery.status" :min="0" :max="9" placeholder="全部" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleTaskSearch">查询</el-button>
              <ColumnSettings
                v-model:hidden="hiddenTaskColumns"
                :columns="TASK_COLUMNS"
                @show-all="showAllTaskColumns"
                @reset="resetTaskColumns"
              />
            </el-form-item>
          </el-form>

          <el-table :data="tasks" v-loading="taskLoading" stripe>
            <template #empty><el-empty description="暂无 OTA 任务" :image-size="60" /></template>
            <el-table-column v-if="!isTaskHidden('id')" prop="id" label="任务 ID" width="90" />
            <el-table-column v-if="!isTaskHidden('firmwareId')" prop="firmwareId" label="固件 ID" width="90" />
            <el-table-column v-if="!isTaskHidden('targetVersion')" label="目标版本" width="110">
              <template #default="{ row }">{{ row.targetVersion || '-' }}</template>
            </el-table-column>
            <el-table-column v-if="!isTaskHidden('progress')" label="进度" min-width="220">
              <template #default="{ row }">
                <el-progress
                  :percentage="taskPercentage(row as OtaTaskVO)"
                  :format="() => `${row.successCount}/${row.totalCount}`"
                />
              </template>
            </el-table-column>
            <el-table-column v-if="!isTaskHidden('failedPending')" label="失败/待处理" width="120">
              <template #default="{ row }">
                {{ row.failedCount }} / {{ row.pendingCount }}
              </template>
            </el-table-column>
            <el-table-column v-if="!isTaskHidden('status')" label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag type="info" size="small">状态 {{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column v-if="!isTaskHidden('operator')" prop="operator" label="操作人" width="110">
              <template #default="{ row }">{{ row.operator || '-' }}</template>
            </el-table-column>
            <el-table-column v-if="!isTaskHidden('createTime')" label="创建时间" width="170">
              <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openTaskDetail(row as OtaTaskVO)">
                  详情
                </el-button>
                <el-button
                  v-permission="'ota:cancel'"
                  link
                  type="danger"
                  @click="handleCancelTask(row as OtaTaskVO)"
                >
                  取消
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination-container">
            <el-pagination
              v-model:current-page="taskQuery.pageNum"
              v-model:page-size="taskQuery.pageSize"
              :total="taskTotal"
              :page-sizes="[10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              @size-change="handleTaskSearch"
              @current-change="loadTasks"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- ============ 上传固件 ============ -->
    <el-dialog v-model="uploadVisible" title="上传固件" width="560px" :close-on-click-modal="false">
      <el-alert
        type="info"
        :closable="false"
        title="仅支持 .bin 文件；同一产品下版本号必须唯一。"
        class="dialog-alert"
      />
      <el-form ref="uploadFormRef" :model="uploadForm" :rules="uploadRules" label-width="90px">
        <el-form-item label="固件文件" required>
          <el-upload
            :auto-upload="false"
            :limit="1"
            accept=".bin"
            :on-change="handleFileChange"
            :on-remove="handleFileRemove"
          >
            <el-button>选择 .bin 文件</el-button>
            <template #tip>
              <div class="el-upload__tip">
                当前选择：{{ selectedFile?.name || '未选择' }}
                <span v-if="selectedFile">（{{ formatBytes(selectedFile.size) }}）</span>
              </div>
            </template>
          </el-upload>
        </el-form-item>
        <el-form-item label="版本号" prop="version">
          <el-input v-model="uploadForm.version" placeholder="如 1.2.3" maxlength="32" />
        </el-form-item>
        <el-form-item label="产品型号" prop="product">
          <el-input v-model="uploadForm.product" placeholder="如 SmartHome-v1" maxlength="64" />
        </el-form-item>
        <el-form-item label="更新说明">
          <el-input
            v-model="uploadForm.releaseNotes"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadVisible = false">取消</el-button>
        <el-button type="primary" :loading="uploading" @click="submitUpload">上传</el-button>
      </template>
    </el-dialog>

    <!-- ============ 批量下发 ============ -->
    <el-dialog v-model="batchVisible" title="批量下发 OTA" width="480px" :close-on-click-modal="false">
      <el-form ref="batchFormRef" :model="batchForm" :rules="batchRules" label-width="90px">
        <el-form-item label="固件" prop="firmwareId">
          <el-select v-model="batchForm.firmwareId" placeholder="选择启用中的固件" style="width: 100%">
            <el-option
              v-for="item in enabledFirmware"
              :key="item.id"
              :label="`${item.version}（${item.product}）`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="目标产品">
          <el-input v-model="batchForm.targetProduct" placeholder="默认取固件产品型号" />
        </el-form-item>
        <el-form-item label="操作人">
          <el-input v-model="batchForm.operator" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchSubmitting" @click="submitBatch">
          确认下发
        </el-button>
      </template>
    </el-dialog>

    <!-- ============ 固件详情 ============ -->
    <el-drawer v-model="firmwareDetailVisible" title="固件详情" size="480px">
      <template v-if="firmwareDetail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="固件 ID">{{ firmwareDetail.id }}</el-descriptions-item>
          <el-descriptions-item label="版本号">{{ firmwareDetail.version }}</el-descriptions-item>
          <el-descriptions-item label="产品型号">{{ firmwareDetail.product }}</el-descriptions-item>
          <el-descriptions-item label="文件大小">
            {{ firmwareDetail.sizeText || formatBytes(firmwareDetail.size) }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            {{ FIRMWARE_STATUS_LABELS[firmwareDetail.status] || firmwareDetail.status }}
          </el-descriptions-item>
          <el-descriptions-item label="上传人">{{ firmwareDetail.uploadedBy || '-' }}</el-descriptions-item>
          <el-descriptions-item label="上传时间">
            {{ formatDateTime(firmwareDetail.uploadTime) }}
          </el-descriptions-item>
          <el-descriptions-item label="MD5">{{ firmwareDetail.md5 || '-' }}</el-descriptions-item>
          <el-descriptions-item label="SHA256">{{ firmwareDetail.sha256 || '-' }}</el-descriptions-item>
        </el-descriptions>
        <h4 class="section-title">更新说明</h4>
        <p class="release-notes">{{ firmwareDetail.releaseNotes || '无' }}</p>
      </template>
    </el-drawer>

    <!-- ============ 任务详情 ============ -->
    <el-drawer v-model="taskDetailVisible" title="OTA 任务详情" size="720px">
      <template v-if="taskDetail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="任务 ID">{{ taskDetail.id }}</el-descriptions-item>
          <el-descriptions-item label="固件 ID">{{ taskDetail.firmwareId }}</el-descriptions-item>
          <el-descriptions-item label="目标版本">{{ taskDetail.targetVersion || '-' }}</el-descriptions-item>
          <el-descriptions-item label="进度">
            成功 {{ taskDetail.successCount }} / 失败 {{ taskDetail.failedCount }} /
            待处理 {{ taskDetail.pendingCount }} / 总计 {{ taskDetail.totalCount }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">{{ taskDetail.status }}</el-descriptions-item>
          <el-descriptions-item label="操作人">{{ taskDetail.operator || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDateTime(taskDetail.createTime) }}
          </el-descriptions-item>
        </el-descriptions>

        <h4 class="section-title">设备进度</h4>
        <el-table :data="taskDetail.devices" stripe size="small">
          <template #empty><el-empty description="暂无设备进度" :image-size="50" /></template>
          <el-table-column prop="deviceId" label="设备 MAC" width="150" />
          <el-table-column label="设备名" min-width="120">
            <template #default="{ row }">{{ row.deviceName || '-' }}</template>
          </el-table-column>
          <el-table-column label="OTA 阶段" width="100">
            <template #default="{ row }">
              {{ row.otaState ? OTA_STATE_LABELS[row.otaState] || row.otaState : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="进度" width="90">
            <template #default="{ row }">{{ row.otaProgress ?? 0 }}%</template>
          </el-table-column>
          <el-table-column label="指令状态" width="110">
            <template #default="{ row }">
              {{ row.commandStatusText || COMMAND_STATUS_LABELS[row.commandStatus] || row.commandStatus }}
            </template>
          </el-table-column>
          <el-table-column label="错误" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.errorMsg || '-' }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  ElMessage,
  ElMessageBox,
  type FormInstance,
  type FormRules,
  type UploadFile,
} from 'element-plus'
import { firmwareApi } from '@/features/admin/api/firmwareApi'
import { commonApi } from '@/features/common/api/commonApi'
import { useAuthStore } from '@/stores/useAuthStore'
import type {
  FirmwareQuery,
  FirmwareUploadPayload,
  FirmwareVO,
  OtaTaskDetailVO,
  OtaTaskQuery,
  OtaTaskVO,
} from '@/types/ota'
import { OTA_STATE_LABELS, formatBytes, formatDateTime } from '@/utils/device'
import {
  COMMAND_STATUS_LABELS,
  FIRMWARE_STATUS_LABELS,
  FIRMWARE_STATUS_TAG_TYPES,
} from '@/utils/status'
import ColumnSettings from '@/components/common/ColumnSettings.vue'
import { useColumnSettings, type ColumnOption } from '@/composables/useColumnSettings'

/**
 * ============================================================================
 * 管理端固件与 OTA 任务（文档 8.8）
 * ============================================================================
 * 固件：分页列表、详情、上传、启停、删除、批量下发。
 * 任务：分页列表、详情（设备级进度）、取消。
 *
 * 已知限制：任务状态后端未给出公开枚举，页面直出数值，避免猜测状态含义。
 * ============================================================================
 */
const authStore = useAuthStore()

/** 固件列表列配置（storageKey: admin-firmware）；操作列固定显示，避免隐藏后无法操作。 */
const FIRMWARE_COLUMNS: ColumnOption[] = [
  { key: 'version', label: '版本号' },
  { key: 'product', label: '产品型号' },
  { key: 'size', label: '大小' },
  { key: 'md5', label: 'MD5' },
  { key: 'uploadedBy', label: '上传人' },
  { key: 'uploadTime', label: '上传时间' },
  { key: 'status', label: '状态' },
  { key: 'actions', label: '操作', fixed: true },
]

const {
  hidden: hiddenFirmwareColumns,
  isHidden: isFirmwareHidden,
  showAll: showAllFirmwareColumns,
  reset: resetFirmwareColumns,
} = useColumnSettings('admin-firmware', FIRMWARE_COLUMNS)

/** OTA 任务列表列配置（storageKey: admin-firmware-tasks）；操作列固定显示。 */
const TASK_COLUMNS: ColumnOption[] = [
  { key: 'id', label: '任务 ID' },
  { key: 'firmwareId', label: '固件 ID' },
  { key: 'targetVersion', label: '目标版本' },
  { key: 'progress', label: '进度' },
  { key: 'failedPending', label: '失败/待处理' },
  { key: 'status', label: '状态' },
  { key: 'operator', label: '操作人' },
  { key: 'createTime', label: '创建时间' },
  { key: 'actions', label: '操作', fixed: true },
]

const {
  hidden: hiddenTaskColumns,
  isHidden: isTaskHidden,
  showAll: showAllTaskColumns,
  reset: resetTaskColumns,
} = useColumnSettings('admin-firmware-tasks', TASK_COLUMNS)

const activeTab = ref<'firmware' | 'tasks'>('firmware')
const products = ref<string[]>([])

const handleTabChange = (name: string | number) => {
  if (name === 'tasks' && tasks.value.length === 0) loadTasks()
}

const refreshActiveTab = () => {
  if (activeTab.value === 'firmware') loadFirmware()
  else loadTasks()
}

// ==================== 固件列表 ====================
const firmwareList = ref<FirmwareVO[]>([])
const firmwareTotal = ref(0)
const firmwareLoading = ref(false)
const firmwareQuery = reactive<{
  pageNum: number
  pageSize: number
  keyword: string
  product: string
  status?: number
}>({
  pageNum: 1,
  pageSize: 10,
  keyword: '',
  product: '',
  status: undefined,
})

const loadFirmware = async () => {
  firmwareLoading.value = true
  try {
    const params: FirmwareQuery = {
      pageNum: firmwareQuery.pageNum,
      pageSize: firmwareQuery.pageSize,
      keyword: firmwareQuery.keyword.trim() || undefined,
      product: firmwareQuery.product.trim() || undefined,
      status: firmwareQuery.status,
    }
    const res = await firmwareApi.page(params)
    firmwareList.value = res.records || []
    firmwareTotal.value = res.total || 0
  } catch {
    firmwareList.value = []
    firmwareTotal.value = 0
  } finally {
    firmwareLoading.value = false
  }
}

const handleFirmwareSearch = () => {
  firmwareQuery.pageNum = 1
  loadFirmware()
}

const handleFirmwareReset = () => {
  firmwareQuery.keyword = ''
  firmwareQuery.product = ''
  firmwareQuery.status = undefined
  handleFirmwareSearch()
}

// ==================== 上传 ====================
const uploadVisible = ref(false)
const uploading = ref(false)
const uploadFormRef = ref<FormInstance>()
const selectedFile = ref<File | null>(null)
const uploadForm = reactive({ version: '', product: '', releaseNotes: '' })

const uploadRules: FormRules = {
  version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
  product: [{ required: true, message: '请输入产品型号', trigger: 'blur' }],
}

const openUploadDialog = () => {
  uploadForm.version = ''
  uploadForm.product = ''
  uploadForm.releaseNotes = ''
  selectedFile.value = null
  uploadVisible.value = true
}

const handleFileChange = (file: UploadFile) => {
  const raw = file.raw
  if (!raw) return
  if (!raw.name.toLowerCase().endsWith('.bin')) {
    ElMessage.error('只允许上传 .bin 固件文件')
    selectedFile.value = null
    return
  }
  if (raw.size > 16 * 1024 * 1024) {
    ElMessage.error('固件文件不能超过 16MB')
    selectedFile.value = null
    return
  }
  selectedFile.value = raw
}

const handleFileRemove = () => {
  selectedFile.value = null
}

const submitUpload = async () => {
  if (!uploadFormRef.value) return
  if (!selectedFile.value) {
    ElMessage.warning('请选择 .bin 固件文件')
    return
  }
  try {
    await uploadFormRef.value.validate()
  } catch {
    return
  }

  const payload: FirmwareUploadPayload = {
    file: selectedFile.value,
    version: uploadForm.version.trim(),
    product: uploadForm.product.trim(),
    releaseNotes: uploadForm.releaseNotes.trim() || undefined,
    operator: authStore.user?.username,
  }

  uploading.value = true
  try {
    await firmwareApi.upload(payload)
    ElMessage.success('固件上传成功')
    uploadVisible.value = false
    handleFirmwareSearch()
  } catch {
    // 4000/4001/4100/4106 由统一请求层提示
  } finally {
    uploading.value = false
  }
}

// ==================== 启停/删除/详情 ====================
const firmwareDetailVisible = ref(false)
const firmwareDetail = ref<FirmwareVO | null>(null)

const openFirmwareDetail = async (row: FirmwareVO) => {
  try {
    firmwareDetail.value = await firmwareApi.detail(row.id)
  } catch {
    firmwareDetail.value = row
  }
  firmwareDetailVisible.value = true
}

const handleToggleFirmware = (row: FirmwareVO) => {
  const nextStatus = row.status === 1 ? 0 : 1
  const action = nextStatus === 1 ? '启用' : '禁用'
  ElMessageBox.confirm(`确定${action}固件 ${row.version} 吗？`, `${action}固件`, {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      try {
        await firmwareApi.updateStatus(row.id, { status: nextStatus === 1 ? 1 : 0 })
        ElMessage.success(`固件已${action}`)
        loadFirmware()
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

const handleDeleteFirmware = (row: FirmwareVO) => {
  ElMessageBox.confirm(`确定删除固件 ${row.version}（${row.product}）吗？`, '删除固件', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      try {
        await firmwareApi.remove(row.id)
        ElMessage.success('固件已删除')
        loadFirmware()
      } catch {
        // 4101/4104 由统一请求层提示
      }
    })
    .catch(() => undefined)
}

// ==================== 批量下发 ====================
const batchVisible = ref(false)
const batchSubmitting = ref(false)
const batchFormRef = ref<FormInstance>()
const enabledFirmware = ref<FirmwareVO[]>([])
const batchForm = reactive<{ firmwareId?: number; targetProduct: string; operator: string }>({
  firmwareId: undefined,
  targetProduct: '',
  operator: '',
})

const batchRules: FormRules = {
  firmwareId: [{ required: true, message: '请选择固件', trigger: 'change' }],
}

const openBatchDialog = async () => {
  batchForm.firmwareId = undefined
  batchForm.targetProduct = ''
  batchForm.operator = authStore.user?.username ?? ''
  batchVisible.value = true

  try {
    const list = await firmwareApi.list()
    enabledFirmware.value = (list || []).filter((item) => item.status === 1)
  } catch {
    enabledFirmware.value = firmwareList.value.filter((item) => item.status === 1)
  }

  const first = enabledFirmware.value[0]
  if (first) {
    batchForm.firmwareId = first.id
    batchForm.targetProduct = first.product
  }
}

const submitBatch = async () => {
  if (!batchFormRef.value) return
  try {
    await batchFormRef.value.validate()
  } catch {
    return
  }
  if (batchForm.firmwareId === undefined) return

  batchSubmitting.value = true
  try {
    const count = await firmwareApi.batchDispatch({
      firmwareId: batchForm.firmwareId,
      targetProduct: batchForm.targetProduct.trim() || undefined,
      operator: batchForm.operator.trim() || undefined,
    })
    ElMessage.success(`已提交 ${count} 条升级指令`)
    batchVisible.value = false
    loadFirmware()
    loadTasks()
  } catch {
    // 失败原因由统一请求层提示
  } finally {
    batchSubmitting.value = false
  }
}

// ==================== OTA 任务 ====================
const tasks = ref<OtaTaskVO[]>([])
const taskTotal = ref(0)
const taskLoading = ref(false)
const taskQuery = reactive<{ pageNum: number; pageSize: number; status?: number }>({
  pageNum: 1,
  pageSize: 10,
  status: undefined,
})

const loadTasks = async () => {
  taskLoading.value = true
  try {
    const params: OtaTaskQuery = {
      pageNum: taskQuery.pageNum,
      pageSize: taskQuery.pageSize,
      status: taskQuery.status,
    }
    const res = await firmwareApi.tasks(params)
    tasks.value = res.records || []
    taskTotal.value = res.total || 0
  } catch {
    tasks.value = []
    taskTotal.value = 0
  } finally {
    taskLoading.value = false
  }
}

const handleTaskSearch = () => {
  taskQuery.pageNum = 1
  loadTasks()
}

const taskPercentage = (task: OtaTaskVO): number => {
  if (!task.totalCount) return 0
  const finished = task.successCount + task.failedCount
  return Math.min(Math.round((finished / task.totalCount) * 100), 100)
}

const taskDetailVisible = ref(false)
const taskDetail = ref<OtaTaskDetailVO | null>(null)

const openTaskDetail = async (row: OtaTaskVO) => {
  try {
    taskDetail.value = await firmwareApi.taskDetail(row.id)
    taskDetailVisible.value = true
  } catch {
    // 失败原因由统一请求层提示
  }
}

const handleCancelTask = (row: OtaTaskVO) => {
  ElMessageBox.confirm(`确定取消任务 #${row.id} 吗？未下发的设备指令会被取消。`, '取消任务', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      try {
        const count = await firmwareApi.cancelTask(row.id)
        ElMessage.success(`已取消 ${count} 条待下发指令`)
        loadTasks()
      } catch {
        // 失败原因由统一请求层提示
      }
    })
    .catch(() => undefined)
}

const loadProducts = async () => {
  try {
    const dict = await commonApi.dictionaries()
    products.value = dict.products || []
  } catch {
    products.value = []
  }
}

onMounted(() => {
  loadProducts()
  loadFirmware()
})
</script>

<style scoped>
.firmware-page {
  padding: 10px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}
.card-header h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}
.actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.filter-form {
  margin-bottom: 8px;
}
.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.dialog-alert {
  margin-bottom: 16px;
}
.section-title {
  margin: 20px 0 10px;
  font-size: 15px;
  color: #303133;
}
.release-notes {
  margin: 0;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
  white-space: pre-wrap;
}
</style>
