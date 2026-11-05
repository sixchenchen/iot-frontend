import { test, expect, type Page } from '@playwright/test'

/**
 * ============================================================================
 * 端到端用例（真实认证/路由/页面行为，接口全部使用 Playwright 路由拦截 Mock）
 * ============================================================================
 * 设计原则：
 *   - 不依赖真实后端，保证本地与 CI 都能稳定运行；
 *   - 每个用例执行前清空 localStorage，避免登录态串扰；
 *   - 只断言用户可观察的行为（URL、页面元素、提示文案）。
 * ============================================================================
 */

const LOGIN_API = '**/api/auth/login'

const EMPTY_PAGE = {
  code: 200,
  message: 'success',
  data: { records: [], total: 0, size: 10, current: 1 },
}

const ADMIN_PERMISSIONS = [
  'device:list',
  'device:read',
  'device:create',
  'device:update',
  'device:delete',
  'device:unbind',
  'command:send',
  'firmware:upload',
  'firmware:delete',
  'ota:list',
  'ota:create',
  'ota:cancel',
  'user:list',
  'user:update',
  'user:delete',
  'alert:list',
  'alert:handle',
]

/** 通用字典 Mock：页面首屏会请求 /common/dictionaries，必须拦截，
 * 否则使用假 Token 的真实请求会触发 401 → 刷新 → 跳回登录页。 */
const DICTIONARIES = {
  roles: [
    { code: 'ADMIN', name: '管理员' },
    { code: 'USER', name: '用户' },
  ],
  userStatus: [
    { value: 1, label: '启用' },
    { value: 0, label: '禁用' },
  ],
  deviceOnline: [
    { value: 1, label: '在线' },
    { value: 0, label: '离线' },
  ],
  commandStatus: [],
  otaState: [],
  alertLevel: [],
  alertStatus: [],
  products: ['SmartHome-v1'],
}

/** 清空本地存储，保证用例从「未登录」开始。
 * 注意：addInitScript 会在每次导航前执行，这里用 sessionStorage 标记保证只清理一次，
 * 否则登录后 page.goto 新路由会把刚写入的 token 清掉，从而被守卫踢回登录页。 */
async function resetStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const flag = 'e2e-storage-cleared'
    if (!sessionStorage.getItem(flag)) {
      window.localStorage.clear()
      sessionStorage.setItem(flag, '1')
    }
  })
  await page.route('**/api/auth/logout', (route) => route.fulfill({ json: { code: 200, data: null } }))
  // 健康检查为公开接口，固定返回 UP，避免 Headar 状态标签影响断言。
  await page.route('**/actuator/health', (route) => route.fulfill({ json: { status: 'UP' } }))
  await page.route('**/api/common/dictionaries', (route) =>
    route.fulfill({ json: { code: 200, message: 'success', data: DICTIONARIES } }),
  )
  // 管理端登录后默认落在 /device/manage，统一返回空列表，避免真实请求。
  await page.route('**/api/admin/devices?*', (route) => route.fulfill({ json: EMPTY_PAGE }))
  await page.route('**/api/admin/devices', (route) => route.fulfill({ json: EMPTY_PAGE }))
}

interface LoginMockOptions {
  username?: string
  nickname?: string
  roles?: string[]
  permissions?: string[]
}

/** Mock 登录接口（固定成功响应，token 为测试用假值）。 */
async function mockLogin(page: Page, options: LoginMockOptions = {}): Promise<void> {
  const {
    username = 'admin',
    nickname = '管理员',
    roles = ['ADMIN'],
    permissions = ADMIN_PERMISSIONS,
  } = options

  await page.route(LOGIN_API, (route) =>
    route.fulfill({
      json: {
        code: 200,
        message: 'ok',
        data: {
          token: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          username,
          nickname,
          roles,
          permissions,
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          lastLoginTime: null,
        },
      },
    }),
  )
}

/** 打开登录页并提交账号密码。 */
async function login(page: Page, username = 'admin', password = 'admin12345'): Promise<void> {
  await page.goto('/login')
  await page.getByPlaceholder('请输入用户名').fill(username)
  await page.getByPlaceholder('请输入密码').fill(password)
  await page.getByRole('button', { name: /登\s*录/ }).click()
}

test('未登录访问受保护页面会跳转登录页并带上回跳地址', async ({ page }) => {
  await resetStorage(page)
  await page.goto('/device/mine')

  await expect(page).toHaveURL(/\/login/)
  await expect(page).toHaveURL(/redirect=/)
  await expect(page.getByRole('heading', { name: 'IoT 设备管理平台' })).toBeVisible()
  await expect(page.getByPlaceholder('请输入用户名')).toBeVisible()
})

test('登录成功后按角色进入设备管理页并展示用户信息', async ({ page }) => {
  await resetStorage(page)
  await mockLogin(page)

  await login(page)

  await expect(page).toHaveURL(/\/device\/manage/)
  await expect(page.getByText('欢迎您，管理员')).toBeVisible()
  await expect(page.getByRole('heading', { name: '设备管理' })).toBeVisible()
})

test('登录失败时展示后端返回的错误原因，且不跳转页面', async ({ page }) => {
  await resetStorage(page)

  await page.route(LOGIN_API, (route) =>
    route.fulfill({
      status: 401,
      json: { code: 401, message: '用户名或密码错误', data: null },
    }),
  )

  await login(page, 'admin', 'wrong-password')

  await expect(page.locator('.el-message').filter({ hasText: '用户名或密码错误' })).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('注册表单要求二次确认密码与协议勾选', async ({ page }) => {
  await resetStorage(page)
  await page.goto('/login')

  await page.getByRole('tab', { name: '注册' }).click()
  await page.getByPlaceholder('用户名（4-32 位字母、数字、下划线）').fill('newuser')
  await page.getByPlaceholder('密码（8-64 位，需包含字母和数字）').fill('abc12345')
  await page.getByPlaceholder('请再次输入密码').fill('abc1234')
  await page.getByRole('button', { name: /注\s*册/ }).click()

  await expect(page.getByText('两次输入的密码不一致')).toBeVisible()
})

test('用户端：绑定设备后可控制设备并检查 OTA 更新', async ({ page }) => {
  await resetStorage(page)

  const device = {
    id: 1,
    deviceId: 'B4BFE90CDBA1',
    deviceName: '阳台灯',
    product: 'SmartHome-v1',
    firmware: '1.0.0',
    location: '一楼阳台',
    online: 1,
    lastHeartbeatTime: '2026-11-04T10:30:00',
    uptime: 100,
    capabilities: { mos: true, led: true },
    currentState: { state: 0 },
  }

  let bound = false
  await page.route('**/api/user/devices/my*', (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: {
          records: bound ? [device] : [],
          total: bound ? 1 : 0,
          size: 10,
          current: 1,
        },
      },
    }),
  )
  await page.route('**/api/user/devices/bind', (route) => {
    bound = true
    return route.fulfill({ json: { code: 200, message: 'success', data: null } })
  })
  // 控制接口返回 commandId，前端据此订阅 /command 并等待回执（文档 6.7/6.8）。
  await page.route('**/api/user/devices/control', (route) =>
    route.fulfill({ json: { code: 200, message: 'success', data: 'cmd-e2e-1' } }),
  )
  // 10s 兜底轮询会访问该接口；必须拦截，避免假 Token 触发 401 后跳登录。
  await page.route('**/api/user/commands/*', (route) =>
    route.fulfill({
      json: {
        code: 200,
        message: 'success',
        data: {
          id: 1,
          commandId: 'cmd-e2e-1',
          deviceId: 'B4BFE90CDBA1',
          action: 'set',
          target: 'mos',
          channel: 0,
          params: { state: 1 },
          status: 2,
          retryCount: 0,
          maxRetry: 3,
          errorMsg: null,
          responsePayload: '{"state":1}',
          operator: 'user',
          source: 'WEB',
          expireTime: null,
          sendTime: null,
          ackTime: null,
          createTime: null,
          updateTime: null,
        },
      },
    }),
  )
  await page.route('**/api/user/ota/check/*', (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: {
          hasNewVersion: true,
          firmwareId: 2,
          latestVersion: '1.1.0',
          releaseNotes: '修复若干问题',
          size: 524288,
        },
      },
    }),
  )
  await page.route('**/api/user/ota/start/*', (route) =>
    route.fulfill({ json: { code: 200, message: 'success', data: null } }),
  )

  await mockLogin(page, { username: 'user', nickname: '普通用户', roles: ['USER'], permissions: [] })
  await login(page, 'user', 'user12345')

  await expect(page).toHaveURL(/\/device\/mine/)
  await expect(page.getByRole('heading', { name: '我的设备' })).toBeVisible()

  // 绑定设备
  await page.getByRole('button', { name: '绑定设备', exact: true }).click()
  await page.getByPlaceholder('12 位十六进制，如 B4BFE90CDBA1').fill('B4:BF:E9:0C:DB:A1')
  await page.getByPlaceholder('机身二维码上的 6 位绑定码').fill('ABC123')
  await page.getByRole('button', { name: '确定绑定' }).click()

  await expect(page.locator('.el-message').filter({ hasText: '设备绑定成功' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '阳台灯' })).toBeVisible()

  // 控制设备（默认参数即可下发）
  await page.getByRole('button', { name: '控制', exact: true }).click()
  await expect(page.getByText('控制设备 - 阳台灯')).toBeVisible()
  await page.getByRole('button', { name: '下发指令' }).click()
  await expect(page.locator('.el-message').filter({ hasText: '指令已下发' })).toBeVisible()
  // 指令受理后进入「等待设备回执」态，关闭弹窗再继续验证 OTA。
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()

  // 检查 OTA 更新并发起升级
  await page.getByRole('button', { name: '检查更新' }).click()
  await expect(page.getByText('1.1.0')).toBeVisible()
  await page.getByRole('button', { name: '立即升级' }).click()
  await expect(page.locator('.el-message').filter({ hasText: '升级指令已下发' })).toBeVisible()
})

test('管理端：固件上传、批量下发与删除', async ({ page }) => {
  await resetStorage(page)

  let firmwareList = [
    {
      id: 1,
      version: '1.0.0',
      product: 'SmartHome-v1',
      releaseNotes: '初始版本',
      url: '/firmware/1.0.0.bin',
      md5: 'abcdef0123456789abcdef0123456789',
      sha256: 'sha256-value',
      size: 1024,
      sizeText: '1.0 KB',
      uploadedBy: 'admin',
      uploadTime: '2026-11-04T10:00:00',
      status: 1,
    },
  ]

  await page.route('**/api/admin/ota/firmware?*', (route) =>
    route.fulfill({
      json: {
        code: 200,
        message: 'success',
        data: { records: firmwareList, total: firmwareList.length, size: 10, current: 1 },
      },
    }),
  )
  await page.route('**/api/admin/ota/firmware/*', (route) => {
    if (route.request().url().includes('/firmware/list')) {
      return route.fulfill({ json: { code: 200, message: 'success', data: firmwareList } })
    }
    if (route.request().method() === 'DELETE') {
      firmwareList = []
      return route.fulfill({ json: { code: 200, message: 'success', data: null } })
    }
    return route.fallback()
  })
  await page.route('**/api/admin/ota/firmware/upload', (route) =>
    route.fulfill({ json: { code: 200, message: 'success', data: { id: 2, version: '1.2.3' } } }),
  )
  await page.route('**/api/admin/ota/batch-dispatch*', (route) =>
    route.fulfill({ json: { code: 200, message: 'success', data: 3 } }),
  )
  // 批量下发后会刷新 OTA 任务列表；未拦截会打到真实后端，
  // 假 Token 触发 401 → 清理登录态 → 页面被重定向，后续断言全部失效。
  await page.route('**/api/admin/ota/tasks?*', (route) => route.fulfill({ json: EMPTY_PAGE }))
  await page.route('**/api/admin/ota/tasks', (route) => route.fulfill({ json: EMPTY_PAGE }))

  await mockLogin(page)
  await login(page)
  await page.goto('/ota/firmware')

  await expect(page.getByRole('heading', { name: '固件管理' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '1.0.0' })).toBeVisible()

  // 上传固件（multipart）
  await page.getByRole('button', { name: '上传固件' }).click()
  await page
    .locator('.el-dialog input[type=file]')
    .setInputFiles({ name: 'fw.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('bin') })
  await page.getByPlaceholder('如 1.2.3').fill('1.2.3')
  await page.getByPlaceholder('如 SmartHome-v1').fill('SmartHome-v1')
  await page.getByRole('button', { name: '上传', exact: true }).click()
  await expect(page.locator('.el-message').filter({ hasText: '固件上传成功' })).toBeVisible()

  // 批量下发
  await page.getByRole('button', { name: '批量下发' }).first().click()
  await page.getByRole('button', { name: '确认下发' }).click()
  await expect(page.locator('.el-message').filter({ hasText: '3 条升级指令' })).toBeVisible()
  // 等待弹窗完全卸载，否则其淡出遮罩会拦截后续表格按钮点击。
  await expect(page.getByRole('dialog', { name: '批量下发 OTA' })).toBeHidden()

  // 删除固件
  await page.getByRole('button', { name: '删除' }).first().click()
  await page.getByRole('button', { name: '确定' }).click()
  await expect(page.getByText('暂无固件，请先上传')).toBeVisible()
})

test('管理端：死信列表与重放', async ({ page }) => {
  await resetStorage(page)

  const deadLetters = [
    {
      id: 1,
      topic: 'device/B4BFE90CDBA1/state',
      payload: '{"state":1}',
      errorMsg: '消息消费失败',
      isRetryable: 1,
      status: 0,
      retryCount: 0,
      createTime: '2026-11-04T11:00:00',
      updateTime: null,
    },
  ]

  await page.route('**/api/admin/dead-letters*', (route) => {
    if (route.request().url().includes('/replay')) return route.fallback()
    return route.fulfill({
      json: {
        code: 200,
        message: 'success',
        data: { records: deadLetters, total: 1, size: 10, current: 1 },
      },
    })
  })
  await page.route('**/api/admin/dead-letters/*/replay', (route) =>
    route.fulfill({ json: { code: 200, message: 'success', data: null } }),
  )

  await mockLogin(page)
  await login(page)
  await page.goto('/admin/dead-letters')

  await expect(page.getByRole('heading', { name: '死信管理' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '未处理' })).toBeVisible()

  await page.getByRole('button', { name: '重放' }).click()
  await page.getByRole('button', { name: '确定' }).click()
  await expect(page.locator('.el-message').filter({ hasText: '重放成功' })).toBeVisible()
})

test('管理端：用户列表与删除用户', async ({ page }) => {
  await resetStorage(page)

  let users = [
    {
      id: 12,
      username: 'tom',
      nickname: 'Tom',
      email: 'tom@example.com',
      phone: '13800000000',
      status: 1,
      roles: ['USER'],
      lastLoginTime: '2026-11-04T10:00:00',
      createTime: '2026-10-01T09:00:00',
    },
  ]

  await page.route('**/api/admin/users?*', (route) =>
    route.fulfill({
      json: {
        code: 200,
        message: 'success',
        data: { records: users, total: users.length, size: 10, current: 1 },
      },
    }),
  )
  await page.route('**/api/admin/users/12', (route) => {
    if (route.request().method() === 'DELETE') {
      users = []
      return route.fulfill({ json: { code: 200, message: 'success', data: null } })
    }
    return route.fallback()
  })

  await mockLogin(page)
  await login(page)
  await page.goto('/admin/users')

  await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'tom', exact: true })).toBeVisible()

  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '确定删除' }).click()

  await expect(page.locator('.el-message').filter({ hasText: '用户已删除' })).toBeVisible()
})

test('管理端：数据概览展示汇总指标', async ({ page }) => {
  await resetStorage(page)
  await page.route('**/api/admin/dashboard/summary', (route) =>
    route.fulfill({
      json: {
        code: 200,
        message: 'success',
        data: {
          deviceTotal: 12,
          onlineCount: 9,
          offlineCount: 3,
          todayCommandCount: 40,
          todayFailedCount: 2,
          failureRate: 5,
          otaRunningCount: 1,
          unhandledAlertCount: 4,
        },
      },
    }),
  )

  await mockLogin(page)
  await login(page)
  await page.goto('/admin/dashboard')

  await expect(page.getByRole('heading', { name: '数据概览' })).toBeVisible()
  await expect(page.getByText('设备总数')).toBeVisible()
  await expect(page.getByText('12', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('5.00%')).toBeVisible()
})

test('用户中心：加载资料与登录记录', async ({ page }) => {
  await resetStorage(page)
  await page.route('**/api/user/profile', (route) =>
    route.fulfill({
      json: {
        code: 200,
        message: 'success',
        data: {
          userId: 2,
          username: 'user',
          nickname: '普通用户',
          email: 'user@example.com',
          phone: '13900000000',
          avatar: null,
          status: 1,
          roles: ['USER'],
          permissions: [],
          lastLoginTime: '2026-11-04T10:00:00',
          createTime: '2026-10-01T09:00:00',
        },
      },
    }),
  )
  await page.route('**/api/user/login-logs?*', (route) =>
    route.fulfill({
      json: {
        code: 200,
        message: 'success',
        data: {
          records: [
            {
              id: 1,
              username: 'user',
              ip: '127.0.0.1',
              userAgent: 'Playwright',
              status: 1,
              message: '登录成功',
              loginTime: '2026-11-04T10:00:00',
            },
          ],
          total: 1,
          size: 10,
          current: 1,
        },
      },
    }),
  )

  await mockLogin(page, { username: 'user', nickname: '普通用户', roles: ['USER'], permissions: [] })
  await login(page, 'user', 'user12345')
  await page.goto('/profile')

  await expect(page.getByRole('heading', { name: '个人资料' })).toBeVisible()
  await expect(page.getByText('普通用户').first()).toBeVisible()
  await expect(page.getByRole('cell', { name: '登录成功' })).toBeVisible()
})
