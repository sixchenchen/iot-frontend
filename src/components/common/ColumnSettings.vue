<template>
  <!--
    通用列设置控件：点击后在气泡内勾选需要展示的列。
    - 固定列（操作列）复选框禁用，避免隐藏后失去操作入口；
    - 【全部显示】仅清空隐藏集合，【恢复默认】同时清除本地存储。
  -->
  <el-popover trigger="click" placement="bottom-end" :width="240">
    <template #reference>
      <el-button :icon="Operation" text class="column-settings-trigger">列设置</el-button>
    </template>

    <div class="column-settings">
      <div class="column-settings__header">
        <span class="column-settings__title">显示列</span>
        <el-button link type="primary" size="small" @click="emit('show-all')">全部显示</el-button>
        <el-button link size="small" @click="emit('reset')">恢复默认</el-button>
      </div>
      <div class="column-settings__list">
        <el-checkbox
          v-for="column in columns"
          :key="column.key"
          :model-value="!hidden.includes(column.key)"
          :disabled="column.fixed"
          :title="column.fixed ? '该列固定显示，不可隐藏' : ''"
          @change="toggle(column, $event)"
        >
          {{ column.label }}
        </el-checkbox>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { Operation } from '@element-plus/icons-vue'
import type { ColumnOption } from '@/composables/useColumnSettings'

/**
 * 列设置气泡组件（受控组件）。
 * 通过 `v-model:hidden` 与 useColumnSettings 的 hidden 双向绑定，
 * 组件本身不碰 localStorage，持久化逻辑集中在 composable 内。
 */
const props = defineProps<{
  columns: ColumnOption[]
  hidden: string[]
}>()

const emit = defineEmits<{
  'update:hidden': [value: string[]]
  'show-all': []
  reset: []
}>()

const toggle = (column: ColumnOption, checked: boolean | string | number) => {
  if (column.fixed) return
  const visible = Boolean(checked)
  const next = visible
    ? props.hidden.filter((key) => key !== column.key)
    : [...props.hidden, column.key]
  emit('update:hidden', next)
}
</script>

<style scoped>
.column-settings-trigger {
  padding: 0 4px;
  font-size: 13px;
}
.column-settings__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #ebeef5;
}
.column-settings__title {
  flex: 1;
  font-size: 13px;
  color: #606266;
}
.column-settings__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 280px;
  overflow: auto;
  padding-top: 6px;
}
</style>
