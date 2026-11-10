<template>
  <div class="access-manage-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <h3>权限管理</h3>
          <span class="header-hint">RBAC：用户 → 角色 → 权限，授权变更后相关用户需重新登录生效</span>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="角色管理" name="roles">
          <RoleTablePanel v-if="loadedTabs.roles" />
        </el-tab-pane>
        <el-tab-pane label="权限项管理" name="permissions">
          <PermissionTablePanel v-if="loadedTabs.permissions" />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import RoleTablePanel from '@/components/admin/RoleTablePanel.vue'
import PermissionTablePanel from '@/components/admin/PermissionTablePanel.vue'

/**
 * ============================================================================
 * 权限管理页（文档 8.11 / 8.12）
 * ============================================================================
 * 角色与权限是同一套 RBAC 的两个视角，合并为一个菜单、两个页签：
 *   - 角色管理：角色 CRUD、启停、覆盖式授权（内置角色只读保护）；
 *   - 权限项管理：权限 CRUD、启停、删除（编码不可改，被引用不可删）。
 * 页签采用「首次切换才挂载」，避免首屏同时发起两套列表请求。
 * ============================================================================
 */
type AccessTab = 'roles' | 'permissions'

const activeTab = ref<AccessTab>('roles')
const loadedTabs = reactive<Record<AccessTab, boolean>>({ roles: true, permissions: false })

watch(activeTab, (tab) => {
  loadedTabs[tab] = true
})
</script>

<style scoped>
.access-manage-page {
  padding: 10px;
}
.card-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.card-header h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}
.header-hint {
  font-size: 12px;
  color: #909399;
}
</style>
