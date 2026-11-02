export interface Device {
  id: number
  deviceId: string
  deviceName: string | null
  product: string | null
  firmware: string | null
  location: string | null
  online: number // 0-离线, 1-在线
  lastHeartbeatTime: string | null
  uptime: number | null
  capabilities?: Record<string, any> | null
  currentState?: Record<string, any> | null
  
  // 只有管理端才有的字段
  pubkey?: string | null
  bindCode?: string | null
  groupId?: number | null
  otaState?: string | null
  otaProgress?: number | null
  lastPayload?: string | null
  createTime?: string
  updateTime?: string
}