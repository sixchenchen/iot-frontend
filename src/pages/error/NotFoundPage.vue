<template>
  <!-- 404：地址不存在。保留原始 URL 语义，不静默跳回首页。 -->
  <ErrorResult
    code="404"
    title="页面不存在"
    :description="`您访问的地址 ${currentPath} 不存在或已被移除，请检查链接是否正确。`"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ErrorResult from '@/components/ErrorResult.vue'

const route = useRoute()
const currentPath = computed(() => route.fullPath)
</script>
