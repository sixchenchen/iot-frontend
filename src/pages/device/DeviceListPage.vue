<template>
  <div class="device-list-page">
    <el-card shadow="never">
      <div class="toolbar">
        <h3>{{ isManageMode ? '设备管理' : '我的设备' }}</h3>
        <div class="actions">
          <!-- 只有管理端显示搜索框 -->
          <el-input
            v-if="isManageMode"
            v-model="query.keyword"
            placeholder="搜索设备名称/ID"
            style="width: 250px; margin-right: 15px;"
            clearable
            @keyup.enter="fetchData"
          >
            <template #append>
              <el-button :icon="Search" @click="fetchData" />
            </template>
          </el-input>
          
          <!-- 只有管理端显示新增按钮 -->
          <el-button v-if="isManageMode" type="primary" @click="openAddDialog">
            新增设备
          </el-button>
        </div>
      </div>

      <el-table :data="tableData" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="deviceId" label="设备ID (MAC)" width="180" />
        <el-table-column prop="deviceName" label="设备名称" min-width="150" />
        <el-table-column prop="product" label="产品型号" width="150" />
        <el-table-column label="在线状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.online === 1 ? 'success' : 'info'">
              {{ row.online === 1 ? '在线' : '离线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastHeartbeatTime" label="最后心跳时间" width="180">
          <template #default="{ row }">
            {{ row.lastHeartbeatTime || '暂无' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click="handleDetail(row.deviceId)">详情</el-button>
            <!-- 只有管理端显示删除按钮 -->
            <el-button 
              v-if="isManageMode" 
              type="danger" 
              link 
              @click="handleDelete(row)"
            >
              删除
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
          @size-change="fetchData"
          @current-change="fetchData"
        />
      </div>
    </el-card>

    <!-- 新增设备弹窗 -->
    <el-dialog v-model="dialogVisible" title="新增设备" width="500px">
      <el-form ref="formRef" :model="formData" :rules="rules" label-width="100px">
        <el-form-item label="设备ID(MAC)" prop="deviceId">
          <el-input v-model="formData.deviceId" placeholder="如 B4BFE90CDBA1" />
        </el-form-item>
        <el-form-item label="设备名称" prop="deviceName">
          <el-input v-model="formData.deviceName" placeholder="如 阳台大灯" />
        </el-form-item>
        <el-form-item label="产品型号" prop="product">
          <el-input v-model="formData.product" placeholder="如 SmartHome-v1" />
        </el-form-item>
        <el-form-item label="设备位置" prop="location">
          <el-input v-model="formData.location" placeholder="如 一楼阳台" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitLoading" @click="submitAdd">
            确定
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { deviceApi } from '@/features/device/api/deviceApi'
import type { Device } from '@/types/device'

const route = useRoute()
const isManageMode = computed(() => route.name === 'DeviceManage')

const loading = ref(false)
const tableData = ref<Device[]>([])
const total = ref(0)

const query = reactive({
  pageNum: 1,
  pageSize: 10,
  keyword: '',
})

const fetchData = async () => {
  loading.value = true
  try {
    const res = isManageMode.value
      ? await deviceApi.listManage(query)
      : await deviceApi.listMine(query)
      
    tableData.value = res.records || []
    total.value = res.total || 0
  } catch (error: any) {
    ElMessage.error(error.message || '获取设备列表失败')
  } finally {
    loading.value = false
  }
}

// ============ 删除逻辑 ============
const handleDelete = (row: Device) => {
  ElMessageBox.confirm(
    `确定要删除设备 "${row.deviceName || row.deviceId}" 吗？此操作不可恢复。`,
    '警告',
    { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
  ).then(async () => {
    try {
      await deviceApi.deleteDevice(row.id) // 注意这里传的是数据库主键 id
      ElMessage.success('删除成功')
      fetchData() // 刷新列表
    } catch (error: any) {
      ElMessage.error(error.message || '删除失败')
    }
  }).catch(() => {
    // 用户取消了删除
  })
}

// ============ 新增逻辑 ============
const dialogVisible = ref(false)
const submitLoading = ref(false)
const formRef = ref<FormInstance>()

const formData = reactive({
  deviceId: '',
  deviceName: '',
  product: '',
  location: '',
})

const rules = reactive<FormRules>({
  deviceId: [{ required: true, message: '请输入设备MAC地址', trigger: 'blur' }],
})

const openAddDialog = () => {
  formData.deviceId = ''
  formData.deviceName = ''
  formData.product = ''
  formData.location = ''
  dialogVisible.value = true
}

const submitAdd = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (valid) {
      submitLoading.value = true
      try {
        await deviceApi.addDevice(formData)
        ElMessage.success('新增设备成功')
        dialogVisible.value = false
        fetchData()
      } catch (error: any) {
        ElMessage.error(error.message || '新增设备失败')
      } finally {
        submitLoading.value = false
      }
    }
  })
}

const handleDetail = (deviceId: string) => {
  ElMessage.info(`准备查看设备详情: ${deviceId}`)
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.device-list-page { padding: 10px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.toolbar h3 { margin: 0; font-size: 18px; color: #303133; }
.actions { display: flex; align-items: center; }
.pagination-container { margin-top: 20px; display: flex; justify-content: flex-end; }
</style>