<template>
  <!-- 403：已登录但角色/权限不足。 -->
  <ErrorResult
    code="403"
    title="没有访问权限"
    description="抱歉，当前账号无权访问该页面。如需开通权限，请联系管理员。"
  />
</template>

<script setup lang="ts">
import ErrorResult from '@/components/ErrorResult.vue'
</script>
