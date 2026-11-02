import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/pages/login/LoginPage.vue'),
    meta: { public: true, title: '登录' }
  },
  {
    path: '/',
    component: () => import('@/components/layout/MainLayout.vue'),
    // 访问根路径 "/" 时，自动重定向到 "我的设备"
    redirect: '/device/mine', 
    children: [
      { 
        path: 'device/mine', 
        name: 'MyDevices', 
        component: () => import('@/pages/device/DeviceListPage.vue'), 
        meta: { title: '我的设备', permission: 'device:list' } 
      },
      { 
        path: 'device/manage', 
        name: 'DeviceManage', 
        component: () => import('@/pages/device/DeviceListPage.vue'), 
        meta: { title: '设备管理', roles: ['ADMIN', 'OPS'], permission: 'device:list' } 
      },
    ],
  },
  { 
    path: '/403', 
    name: 'Forbidden', 
    component: () => import('@/pages/error/ForbiddenPage.vue') 
  },
  { 
    path: '/:pathMatch(.*)*', 
    redirect: '/' 
  }
]