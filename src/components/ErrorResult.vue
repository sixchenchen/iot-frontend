<template>
  <!--
    错误页通用展示组件（403 / 404 / 500 共用）。
    统一视觉与操作入口，避免每个错误页复制一份样式。
  -->
  <div class="error-result">
    <div class="error-code">{{ code }}</div>
    <h2 class="error-title">{{ title }}</h2>
    <p class="error-description">{{ description }}</p>
    <div class="error-actions">
      <el-button type="primary" @click="goHome">返回首页</el-button>
      <el-button v-if="showBack" @click="goBack">返回上一页</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

withDefaults(
  defineProps<{
    code: string
    title: string
    description: string
    showBack?: boolean
  }>(),
  { showBack: true },
)

const router = useRouter()

function goHome(): void {
  router.push('/')
}

function goBack(): void {
  router.back()
}
</script>

<style scoped>
.error-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
  padding: 24px;
  text-align: center;
}
.error-code {
  font-size: 88px;
  font-weight: 700;
  line-height: 1;
  color: #409eff;
}
.error-title {
  margin: 16px 0 8px;
  font-size: 22px;
  color: #303133;
}
.error-description {
  margin: 0 0 24px;
  color: #909399;
}
</style>
