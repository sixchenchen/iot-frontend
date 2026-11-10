import type { RouteRecordRaw } from 'vue-router'
import {
  Bell,
  DataLine,
  Document,
  Monitor,
  Odometer,
  Setting,
  Tickets,
  UploadFilled,
  User,
  Warning,
} from '@element-plus/icons-vue'

/**
 * ============================================================================
 * 路由表（静态路由）
 * ============================================================================
 * meta 约定见 src/types/router.d.ts。
 *
 * 菜单不再在 MainLayout 中硬编码，而是由 src/router/menu.ts 根据本文件的
 * meta（title / icon / roles / permission）动态生成，做到「路由即菜单」。
 *
 * 权限策略（与后端 FRONTEND_API.md 第 3.5 节一致）：
 *   - 后端角色只有 ADMIN / USER（不存在 OPS）；
 *   - /api/user/** 只要求登录，因此用户自助页面不设置 permission；
 *   - /api/admin/** 要求 ADMIN 角色 + 具体权限码；
 *     页面级用 roles 控制是否可进入，按钮级用 v-permission 控制具体操作，
 *     因为同一管理页面下的列表/新增/删除往往对应不同权限码；
 *   - 详情页使用 meta.hidden 从菜单中隐藏，但保留直接访问与回退能力。
 *
 * 菜单分组（meta.group / meta.order）按物联网业务域划分，与 smart_device 库表族对应：
 *   overview 运营总览 | device 设备资产 | control 指令控制
 *   monitor 监控告警  | ota 固件升级    | system 系统管理
 * 新增页面时只需补 group/order，菜单会自动归位，无需改动布局组件。
 * ============================================================================
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/pages/login/LoginPage.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    // 布局路由：访问根路径时默认进入「我的设备」，避免出现空白内容区。
    path: '/',
    redirect: '/device/mine',
    component: () => import('@/components/layout/MainLayout.vue'),
    children: [
      // ==================== 用户自助 ====================
      {
        path: 'device/mine',
        name: 'MyDevices',
        component: () => import('@/pages/device/DeviceListPage.vue'),
        meta: { title: '我的设备', icon: Monitor, group: 'device', order: 10 },
      },
      {
        path: 'device/:deviceId',
        name: 'UserDeviceDetail',
        component: () => import('@/pages/device/UserDeviceDetailPage.vue'),
        meta: { title: '设备详情', hidden: true, group: 'device', order: 11 },
      },
      {
        path: 'commands',
        name: 'MyCommands',
        component: () => import('@/pages/command/CommandPage.vue'),
        meta: { title: '我的指令', icon: Tickets, group: 'control', order: 10 },
      },
      {
        path: 'alerts',
        name: 'MyAlerts',
        component: () => import('@/pages/alert/AlertPage.vue'),
        meta: { title: '我的告警', icon: Bell, group: 'monitor', order: 10 },
      },
      {
        path: 'ota/records',
        name: 'OtaRecords',
        component: () => import('@/pages/ota/OtaRecordPage.vue'),
        meta: { title: '升级记录', icon: DataLine, group: 'ota', order: 10 },
      },
      {
        path: 'profile',
        name: 'UserCenter',
        component: () => import('@/pages/profile/UserCenterPage.vue'),
        meta: { title: '个人中心', icon: User, group: 'system', order: 90 },
      },

      // ==================== 管理端 ====================
      {
        path: 'admin/dashboard',
        name: 'AdminDashboard',
        component: () => import('@/pages/admin/DashboardPage.vue'),
        meta: {
          title: '数据概览',
          icon: Odometer,
          roles: ['ADMIN'],
          permission: 'device:list',
          group: 'overview',
          order: 10,
        },
      },
      {
        path: 'device/manage',
        name: 'DeviceManage',
        component: () => import('@/pages/device/DeviceListPage.vue'),
        meta: {
          title: '设备管理',
          icon: Setting,
          roles: ['ADMIN'],
          permission: 'device:list',
          group: 'device',
          order: 20,
        },
      },
      {
        path: 'admin/devices/:id',
        name: 'AdminDeviceDetail',
        component: () => import('@/pages/admin/AdminDeviceDetailPage.vue'),
        // 详情接口使用 device:read，列表使用 device:list，页面级按详情权限控制。
        meta: {
          title: '设备详情',
          hidden: true,
          roles: ['ADMIN'],
          permission: 'device:read',
          group: 'device',
          order: 21,
        },
      },
      {
        path: 'ota/firmware',
        name: 'FirmwareManage',
        component: () => import('@/pages/admin/FirmwarePage.vue'),
        meta: {
          title: '固件管理',
          icon: UploadFilled,
          roles: ['ADMIN'],
          group: 'ota',
          order: 20,
          // 该页包含上传/启停/删除/批量下发/任务取消多个权限码，
          // 页面级只校验角色，具体按钮由 v-permission 控制。
        },
      },
      {
        path: 'admin/users',
        name: 'UserManage',
        component: () => import('@/pages/admin/UserManagePage.vue'),
        meta: { title: '用户管理', icon: User, roles: ['ADMIN'], group: 'system', order: 10 },
      },
      {
        path: 'admin/commands',
        name: 'AdminCommands',
        component: () => import('@/pages/command/CommandPage.vue'),
        meta: {
          title: '全局指令',
          icon: Tickets,
          roles: ['ADMIN'],
          permission: 'device:list',
          group: 'control',
          order: 20,
        },
      },
      {
        path: 'admin/alerts',
        name: 'AdminAlerts',
        component: () => import('@/pages/alert/AlertPage.vue'),
        meta: {
          title: '告警管理',
          icon: Bell,
          roles: ['ADMIN'],
          permission: 'alert:list',
          group: 'monitor',
          order: 20,
        },
      },
      {
        path: 'admin/audit-logs',
        name: 'AuditLogs',
        component: () => import('@/pages/admin/AuditLogPage.vue'),
        meta: {
          title: '指令审计',
          icon: Document,
          roles: ['ADMIN'],
          permission: 'device:list',
          group: 'control',
          order: 30,
        },
      },
      {
        path: 'admin/dead-letters',
        name: 'DeadLetters',
        component: () => import('@/pages/admin/DeadLetterPage.vue'),
        // 死信接口仅校验 ROLE_ADMIN，没有权限码（文档 3.5）。
        meta: { title: '死信管理', icon: Warning, roles: ['ADMIN'], group: 'system', order: 20 },
      },
    ],
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/pages/error/ForbiddenPage.vue'),
    meta: { public: true, title: '无访问权限' },
  },
  {
    path: '/500',
    name: 'ServerError',
    component: () => import('@/pages/error/ServerErrorPage.vue'),
    meta: { public: true, title: '服务异常' },
  },
  {
    // 兜底路由：保留原始 URL 语义，展示 404 页面而不是静默跳回首页，
    // 既方便用户感知「地址写错」，也方便线上排障定位错误链接。
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/pages/error/NotFoundPage.vue'),
    meta: { public: true, title: '页面不存在' },
  },
]
