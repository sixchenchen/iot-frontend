import { request } from '@/lib/request'
import type { Device } from '@/types/device'

export interface DeviceQuery {
  pageNum: number
  pageSize: number
  keyword?: string
}

// MyBatis-Plus 的分页返回结构
export interface PageResult<T> {
  records: T[]
  total: number
  size: number
  current: number
}

export interface BindRequest {
  deviceId?: string
  bindCode?: string
}

export interface ControlRequest {
  deviceId: string
  action: string
  target: string
  channel?: number
  params: Record<string, any>
}

export const deviceApi = {
  // ================= 管理端接口 =================
  
  // 分页查询设备
  listManage: (params: DeviceQuery) =>
    request<PageResult<Device>>({
      url: '/admin/devices',
      method: 'get',
      params,
    }),

  // 新增设备 (注意：后端要求 deviceId 必填)
  addDevice: (data: { deviceId: string; deviceName?: string; product?: string; location?: string }) =>
    request<void>({
      url: '/admin/devices',
      method: 'post',
      data,
    }),

  // 删除设备
  deleteDevice: (id: number) =>
    request<void>({
      url: `/admin/devices/${id}`,
      method: 'delete',
    }),

  // ================= 用户端接口 =================

  // 获取我的设备 (文档里没有 keyword 参数，只有分页)
  listMine: (params: DeviceQuery) =>
    request<PageResult<Device>>({
      url: '/user/devices/my',
      method: 'get',
      params: {
        pageNum: params.pageNum,
        pageSize: params.pageSize,
      },
    }),

  // 绑定设备
  bindDevice: (data: BindRequest) =>
    request<void>({
      url: '/user/devices/bind',
      method: 'post',
      data,
    }),

  // 解绑设备
  unbindDevice: (data: BindRequest) =>
    request<void>({
      url: '/user/devices/unbind',
      method: 'post',
      data,
    }),

  // 控制设备
  controlDevice: (data: ControlRequest) =>
    request<void>({
      url: '/user/devices/control',
      method: 'post',
      data,
    }),
}