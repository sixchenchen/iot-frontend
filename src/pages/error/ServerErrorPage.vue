<template>
  <!-- 500：服务端/前端运行异常兜底页。 -->
  <ErrorResult
    code="500"
    title="服务暂时不可用"
    description="系统开小差了，请稍后重试。若持续出现，请联系运维人员。"
  />
</template>

<script setup lang="ts">
import ErrorResult from '@/components/ErrorResult.vue'
</script>
