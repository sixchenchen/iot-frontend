# IoT 设备管理平台（前端）

基于 Vue 3 + Vite + TypeScript 的 IoT 后台管理前端，覆盖登录/注册、基于角色与权限码的访问控制、设备列表与设备管理。

## 技术栈

| 能力 | 选型 |
| --- | --- |
| 框架 | Vue 3.5（Composition API + `<script setup>`） |
| 构建 | Vite 8（Rolldown） |
| 语言 | TypeScript（strict） |
| 状态 | Pinia |
| 路由 | Vue Router（history 模式） |
| UI | Element Plus（按需注册 + 中文 locale） |
| 请求 | Axios（统一封装、401 自动刷新） |
| 测试 | Vitest + Playwright |

## 快速开始

```sh
npm install
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`，`/api` 与 `/ws` 由 Vite 代理到
`http://localhost:8080`（可用 `VITE_PROXY_TARGET` 覆盖）。

## 环境变量

仅在 `.env.*` 中配置 `VITE_` 前缀变量（会被明文打包进产物，禁止存放密钥）。

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 是 | 接口前缀；开发/生产均推荐使用同源相对路径 `/api` |
| `VITE_WS_URL` | 否 | WebSocket 地址（接入实时状态后启用） |
| `VITE_APP_TITLE` | 否 | 浏览器标题后缀，默认「IoT 设备管理平台」 |

启动时会校验必填变量，缺失会直接中止并输出错误，避免生产环境 `baseURL=undefined`。

## 常用脚本

```sh
npm run dev          # 开发
npm run type-check   # vue-tsc 类型检查
npm run lint         # oxlint + eslint（自动修复）
npm run build        # 类型检查 + 生产构建
npm run test:unit    # Vitest
npm run test:e2e     # Playwright
```

首次执行 E2E 前需要安装浏览器：`npx playwright install chromium`。
若本机已有 Edge/Chrome，也可通过环境变量复用，避免下载：

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'; npx playwright test --project=chromium
```

## 目录结构

```
src/
  components/        通用组件（布局、错误页展示）
  directives/        全局指令（v-permission）
  features/
    auth/            认证 API 与权限组合式函数
    device/          设备 API
  lib/               请求层与认证存储（auth-storage.ts / request.ts）
  pages/             页面（login、device、error）
  router/            路由表、守卫、菜单生成
  stores/            Pinia Store
  types/             领域类型、全局 API 类型、RouteMeta 扩展
  utils/             错误处理等工具
```

## 约定

### 路由与菜单

- 菜单由 [routes.ts](src/router/routes.ts) 的 `meta` 自动生成（见 [menu.ts](src/router/menu.ts)），新增页面只需配置
  `title / icon / roles / permission`，无需修改布局组件。
- `meta.public = true` 的路由不校验登录态（登录页、403/404/500）。
- 守卫会写入 `document.title`，并对未登录/Token 过期用户跳转登录页并携带 `redirect`。

### 权限

- 页面级：`meta.roles`（任一命中）或 `meta.permission`（权限码）。
- 按钮级：`v-permission="'device:list'"` 或 `v-permission="['a', 'b']"`（任一命中）。
- 前端权限仅控制展示，**接口鉴权必须由后端完成**。

### 请求

- 业务代码统一使用 `@/lib/request` 的 `request<T>()`，返回值即后端 `body.data`。
- 401 会自动使用 RefreshToken 续期并重放并发请求；刷新失败只清理认证白名单并跳转登录页。
- 登录/注册接口不参与自动刷新，其错误由页面展示，避免「密码错误被当成登录过期」。

### 认证存储

所有认证键由 [auth-storage.ts](src/lib/auth-storage.ts) 统一管理：

`access_token / refresh_token / user_info / user_roles / user_perms / token_expires_at / last_login_time`

退出登录只删除上述白名单键，不会误删同源其他业务数据。

## 部署

- Nginx 需配置 history 模式回退：

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
location /api/ {
  proxy_pass http://backend:8080/api/;
}
```

- 生产环境使用相对路径 `/api`，由反向代理转发，避免跨域与域名写死。

## 待办（后续迭代）

- 忘记密码/重置密码、修改密码、短信/图形验证码、MFA（需后端接口支持）。
- 设备详情页、实时状态（WebSocket）、告警模块。
- 多页签/面包屑、主题切换、响应式移动端布局。
