<template>
  <div class="forbidden-page">
    <h1>403</h1>
    <p>抱歉，您没有权限访问此页面。</p>
    <el-button type="primary" @click="router.push('/')">返回首页</el-button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<style scoped>
.forbidden-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: #f5f7fa;
}
h1 {
  font-size: 72px;
  color: #f56c6c;
  margin: 0;
}
p {
  color: #606266;
  margin-bottom: 20px;
}
</style>