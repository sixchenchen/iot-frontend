# 项目文档：IoT设备管理平台前端

> 说明：本文档依据当前仓库代码整理。项目基于 Vue 3、Pinia、Vue Router 与 Element Plus，采用路由驱动菜单、前端页面/按钮权限控制，并通过后端接口提供 IoT 业务数据。前端权限只用于界面体验，服务端必须独立鉴权。

## 1. 项目概述

本项目是面向 IoT 设备运营与管理场景的后台管理前端，提供登录认证、设备查看与运维、指令跟踪、告警监控、固件升级、用户和 RBAC 权限管理等功能。

- **目标用户**：普通用户（管理本人设备及相关业务记录）和管理员（管理平台设备、用户、权限及运维数据）。
- **核心能力**：设备列表、在线与实时状态展示、告警和指令记录查询、固件及 OTA 任务管理、用户/角色/权限管理、登录态续期、路由与按钮级权限控制。
- **前端实现**：路由定义、菜单生成、页面交互、展示权限、状态管理、请求封装及 WebSocket 实时状态处理。
- **后端接口依赖**：认证与令牌续期、RBAC 数据、设备及运维业务数据、文件上传、健康检查和实时消息推送均由后端提供；前端不实现业务数据持久化或服务端授权。

设计特点：

1. **路由即菜单**：菜单从布局路由的子路由及 `meta` 派生，不另维护一份菜单配置。
2. **前端权限控制**：路由守卫控制页面跳转，`v-permission` 控制按钮显隐；这不是服务端安全边界。
3. **Element Plus 按需引入**：组件通过 Vite 的组件自动导入插件解析器按需注册；不是通过全量安装 Element Plus 全局组件。
4. **统一请求与实时状态**：Axios 请求封装统一处理 Token、响应体、401 续期和错误提示；SockJS/STOMP 用于设备实时推送。

## 2. 技术栈清单

| 分类 | 当前项目选型与用途 |
| --- | --- |
| 基础框架 | Vue 3.5，Composition API、`<script setup>` |
| 状态管理 | Pinia：认证、权限、实时设备状态及页签 |
| 路由 | Vue Router 5，History 模式、懒加载页面、全局前置守卫 |
| UI 库 | Element Plus、`@element-plus/icons-vue`，中文语言包 |
| 工具 | Axios；SockJS Client、STOMP.js；`unplugin-auto-import`、`unplugin-vue-components`；Vue DevTools 插件 |
| 构建工具 | Vite 8（Rolldown），Vue 插件，npm/pnpm 脚本 |
| 类型 | TypeScript 6，严格类型检查；Vue SFC 类型由 `vue-tsc` 检查 |
| 测试与质量 | Vitest、Vue Test Utils、Playwright、Oxlint、ESLint、Prettier |

## 3. 整体架构总览

```text
浏览器入口
  └─ src/main.ts：校验必填环境变量、注册错误处理/权限指令、安装 Pinia 与 Router
       └─ App.vue：Element Plus 中文全局配置 + 顶层 router-view
            ├─ /login、/403、/500、404：直接渲染对应页面
            └─ /：MainLayout 布局路由
                 └─ 子路由页面：在 MainLayout 的二级 router-view 中渲染
```

应用入口在 `main.ts`；先校验 `VITE_API_BASE_URL`，再创建 Vue 应用、注册全局错误处理及 `v-permission`，随后安装 Pinia、Router 并挂载。Pinia 在 Router 之前安装，以便守卫能够读取认证 Store。

**多层 `router-view` 的渲染逻辑**：

- `App.vue` 中的 `router-view` 根据顶层匹配路由渲染登录/错误页面，或渲染根路径 `/` 对应的 `MainLayout`。
- 当匹配 `/` 的子路由（例如 `/device/mine`）时，顶层仍渲染 `MainLayout`；布局内部 `<el-main>` 中的第二个 `router-view` 再渲染具体业务页面。
- 登录页和错误页是顶层路由，不经过 `MainLayout`。页面组件本身当前不再嵌套子路由出口。

## 4. 目录结构说明

以下按 `src/` 当前目录说明：

| 目录/文件 | 职责 |
| --- | --- |
| `App.vue` | 根组件；配置 Element Plus 中文 locale，并提供顶层路由出口。 |
| `main.ts` | 应用启动、必填环境变量校验、全局 Vue/Promise 错误记录、指令及插件注册。 |
| `auto-imports.d.ts`、`components.d.ts` | 自动导入和自动组件注册插件生成的 TypeScript 声明文件，不应手工维护导入清单。 |
| `components/` | 可复用 UI 与布局组件。`layout/` 放 `MainLayout`、`RouteTabs`；`device/` 放设备状态面板和控制对话框；`admin/` 放角色、权限面板；`common/` 放列设置；`ErrorResult.vue` 为错误结果展示组件。 |
| `composables/` | 可复用组合式逻辑。目前 `useColumnSettings` 管理表格列显隐及本地持久化；同目录 `__tests__/` 覆盖其行为。 |
| `directives/` | 全局自定义指令。目前 `permission.ts` 实现按钮级权限显隐。 |
| `features/` | 按业务域组织 API 与业务组合式逻辑。`auth/` 认证与权限组合式函数；`admin/` 管理端用户、角色、权限、固件、运维接口；`device/` 设备；`alert/` 告警；`command/` 指令；`ota/` OTA；`sensor/` 传感器；`user/` 用户自助；`common/` 上传、字典和健康检查接口。 |
| `lib/` | 跨业务基础设施。`request.ts` 统一 HTTP 请求；`auth-storage.ts` 管理认证存储；`ws/` 提供设备 WebSocket/STOMP 客户端、实时状态及指令跟踪辅助逻辑。 |
| `pages/` | 路由页面，按 `admin/`、`alert/`、`command/`、`device/`、`error/`、`login/`、`ota/`、`profile/` 归类。 |
| `router/` | 路由表、守卫、路由实例及菜单生成器；`__tests__/` 覆盖菜单逻辑。 |
| `stores/` | Pinia Store：`useAuthStore` 管理登录与权限快照，`useDeviceRealtimeStore` 管理实时连接/数据，`useTabsStore` 管理页签；附有对应测试。 |
| `test/` | Vitest 测试初始化配置。 |
| `types/` | API 通用响应、用户、设备、管理、传感器、OTA、指令、WebSocket 等业务类型，以及 Vue Router `RouteMeta` 扩展。 |
| `utils/` | 设备状态/格式、下载、错误消息、错误码和 `logError` 等纯工具逻辑；包含相关单元测试。 |

## 5. 路由与菜单机制【重点，这个项目的核心】

### 路由表

`src/router/routes.ts` 将静态路由声明为 `RouteRecordRaw[]`。页面组件通过动态 `import()` 懒加载；根路径 `/` 使用 `MainLayout` 作为布局路由，业务页面放在其 `children` 中。根路径重定向至 `/device/mine`。登录、403、500、404 路由位于布局之外。

路由的 `meta` 同时供守卫、菜单、文档标题和页面权限使用。详情等不适合作为侧边菜单入口的页面设置 `hidden: true`，但仍可作为正常路由访问（仍受其权限元数据约束）。

### `buildMenus`：从路由元数据生成菜单

`src/router/menu.ts` 的 `buildMenus(routes, access)` 只读取 `/` 布局路由的子路由，按以下规则形成分组菜单：

1. 仅保留有 `meta.title` 且未设置 `meta.hidden` 的子路由。
2. 用 `meta.roles` 和 `meta.permission` 过滤当前用户无权看到的项。
3. 依据 `meta.group` 查找 `MENU_GROUPS` 中的分组标题、图标和分组排序；漏配或未知分组会落到“其他”兜底组。
4. 菜单项路径、标题、图标和排序分别来自路由路径及 `meta`，分组和菜单项均按 `order` 升序排列。

### `resolvePath`：菜单路径拼接

`resolvePath(parent, child)` 将布局父路径和子路由路径拼成标准绝对路径：子路径以 `/` 开头时直接返回；否则移除父路径末尾 `/` 后拼接。例如父路径 `/` 与 `device/mine` 拼为 `/device/mine`。这让菜单 `index` 可直接交给 Element Plus 的 Router 模式跳转。

### 前置守卫与校验顺序

`src/router/guards.ts` 的全局 `beforeEach` 按以下顺序处理：

1. 先根据 `meta.title` 更新浏览器标题；标题后缀来自可选的 `VITE_APP_TITLE`，缺省为平台默认名称。
2. 公开路由（`meta.public`）放行；有效登录态访问登录页时改跳“我的设备”。
3. 对非公开页面校验会话：需要 Token、用户信息且 Token 未过期；无效时清理认证 Store 状态（若存在 Token）并带 `redirect` 跳登录页。
4. 若配置 `meta.roles`，至少命中一个角色才放行。
5. 若配置 `meta.permission`，必须拥有完全相同的权限码才放行；否则跳转 403。

此处的角色/权限来自前端 Pinia 状态和本地登录快照。**前端路由守卫及菜单过滤都不是安全边界；后端必须在每次受保护的接口请求中验证 Token 和角色/权限。**

## 6. 权限体系（重点）

### 按钮级 `v-permission`

`src/directives/permission.ts` 由 `main.ts` 注册为全局指令：

```vue
<el-button v-permission="'device:create'">新增设备</el-button>
<el-button v-permission="['device:update', 'device:delete']">设备操作</el-button>
```

- 字符串：必须精确匹配一个权限码。
- 数组：采用“或”语义，任一权限码匹配即显示。
- 无值或空数组：不限制显示。
- 无权限时设置元素 `display: none`，不从 DOM 树删除；原始 `display` 存在 `WeakMap` 中，指令的 `mounted`/`updated` 阶段会重新计算。

这只控制 UI，不应被视为阻止脚本调用、构造请求或绕过页面的措施；后端接口仍须独立鉴权。

### 路由 `meta` 权限

- `roles?: string[]`：角色白名单，任一角色命中即可通过。
- `permission?: string`：单个权限码，需精确匹配。
- `hidden?: boolean`：只影响侧边菜单显示，不代表路由访问被禁止。
- 同一路由可同时指定 `roles` 与 `permission`，此时两类约束都要满足。

当前路由配置主要使用 `ADMIN` 角色；用户自助页面不设置管理端角色/权限限制。按钮权限码由各管理页面根据具体操作设置。

### 权限数据源：Pinia `AuthStore`

`src/stores/useAuthStore.ts` 是前端认证、角色与权限状态的唯一内存来源。登录响应提供 `roles`、`permissions`、用户信息和 Token；Store 将必要快照同步到 `localStorage`，刷新后恢复。`hasRole`、`hasPermission` 用于守卫、菜单和指令。

请求层另外从认证存储读取 Token 并附加 Bearer 凭证。服务端返回的权限快照可用于前端展示，但不能代替后端鉴权。

## 7. 布局组件说明

### `App.vue`

- 通过 `ElConfigProvider` 为 Element Plus 提供简体中文 locale。
- 挂载顶层 `router-view`。
- 不执行 `app.use(ElementPlus)`，避免全量注册组件；实际组件由构建插件按需解析。

### `MainLayout`

`src/components/layout/MainLayout.vue` 为已登录业务页提供后台框架：

- **侧边栏**：读取 `buildMenus` 生成分组与菜单；每组只有一项时直接显示为一级项。
- **Header**：提供菜单折叠、后端健康状态、当前用户信息、个人中心入口及登出操作。
- **内容区**：展示页签导航，并通过二级 `router-view` 渲染当前子路由页面。
- **菜单折叠**：宽度在 220px 与 64px 间切换，状态写入 `localStorage` 的 `iot:layout:aside-collapsed`。
- **健康状态**：调用后端 `/actuator/health`，每 60 秒轮询；状态展示依赖后端服务可达。
- **登出**：二次确认后调用认证 Store 登出、重置页签并返回登录页。

`RouteTabs` 展示访问过的业务路由，首页页签固定；支持点击切换、关闭单个/左侧/右侧/其他/全部。页签保存在 `sessionStorage`，恢复时会再次校验路由是否存在及前端权限。

## 8. 全局能力 & 工具

### 全局错误捕获 `logError`

`main.ts` 将 Vue 组件渲染/生命周期异常以及未处理的 Promise rejection 统一交给 `src/utils/error/logError.ts`。当前实现使用 `console.error` 记录上下文，代码预留了接入 Sentry 等监控服务的位置；仓库并未配置实际的远程错误上报服务。

### Element Plus 按需样式注意事项

组件通过 `unplugin-vue-components` 与 `ElementPlusResolver` 按需自动导入；但代码中显式导入的 `ElMessage`、`ElMessageBox` 是 API，不经过组件 Resolver 的自动样式处理。因此 `src/main.ts` 显式引入：

```ts
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
```

删除这两行或调整样式导入配置后，应检查生产构建中的消息提示和确认框样式。

### 其他通用能力

- `src/lib/request.ts`：统一 Axios 实例、Bearer Token、统一响应解包、并发 401 刷新及错误提示。
- `src/lib/auth-storage.ts`：认证键白名单、过期时间规范化、脏 JSON 容错及认证数据定向清理。
- `src/lib/ws/` 与实时 Store：STOMP/SockJS 设备状态订阅和状态归一化。
- `src/composables/useColumnSettings.ts`：按页面/表格持久化列显隐，固定操作列不允许隐藏。
- `src/utils/`：设备状态及显示格式、状态文案、错误码/错误消息、下载等辅助逻辑。

## 9. 页面 & 业务模块说明

| 页面/模块 | 当前前端职责 |
| --- | --- |
| 登录 `LoginPage` | 登录入口；认证、验证码及可选注册能力依赖认证接口。 |
| 我的设备 / 设备管理 `DeviceListPage` | 同一页面按路由模式展示本人设备或管理端设备；管理端支持关键字查询、设备新增/删除、在线统计、CSV 导出；普通用户支持绑定设备。页面还展示在线、实时、OTA 等状态。 |
| 设备详情 | `UserDeviceDetailPage` 为用户设备详情；`AdminDeviceDetailPage` 为管理端详情。详情路由不出现在侧栏菜单中。 |
| 其他设备 `OtherDevicesPage` | 仓库中存在该页面文件；当前静态路由表没有注册对应路由，因此尚非可通过菜单/路由访问的正式页面。 |
| 指令 `CommandPage` | “我的指令”与管理员“全局指令”共用页面，支持按设备、状态、时间范围筛选和查看指令流水；实际执行与结果依赖后端及实时推送。 |
| 告警 `AlertPage` | “我的告警”与“告警管理”共用页面，支持按设备、级别、状态和时间范围筛选；处理数据依赖后端。 |
| OTA 升级记录 `OtaRecordPage` | 查看升级记录；记录及状态由后端提供。 |
| 固件管理 `FirmwarePage` | 管理固件列表、上传、状态及 OTA 批量下发/任务；文件存储、任务执行和权限校验由后端负责。 |
| 用户管理 `UserManagePage` | 用户列表、筛选、详情、创建/编辑、启停及角色维护；具体动作受按钮权限和后端接口授权约束。 |
| 权限管理 `PermissionManagePage` | 角色管理与权限项管理两个页签；角色授权和权限数据由后端持久化。 |
| 数据概览 `DashboardPage` | 管理端运营数据展示，依赖后端统计数据。 |
| 指令审计 `AuditLogPage` | 管理端查询指令审计记录，依赖后端审计数据。 |
| 死信管理 `DeadLetterPage` | 管理端查看/处理死信记录，依赖后端运维接口。 |
| 个人中心 `UserCenterPage` | 个人资料与登录记录等自助信息；资料读写、头像上传和登录记录依赖后端。 |
| 错误页面 | `ForbiddenPage`、`NotFoundPage`、`ServerErrorPage` 分别处理 403、404、500 页面状态。 |

业务 API 按功能放在 `src/features/<domain>/api/`；页面自身负责交互和视图，不应绕开统一请求层直接创建 Axios 请求。

## 10. 构建 & 打包说明

### Element Plus 按需方案

Vite 配置通过 `unplugin-auto-import` 自动导入 Vue/Vue Router API，通过 `unplugin-vue-components` 的 `ElementPlusResolver` 自动解析 Element Plus 组件；对应声明输出到 `src/auto-imports.d.ts`、`src/components.d.ts`。依赖清单中没有单独的 `unplugin-element-plus` 插件，项目采用的是上述 Resolver 方案。

### 生产构建

```bash
npm run build
```

该脚本并行执行 `vue-tsc --build` 类型检查和 `vite build`。产物输出到 `dist/`，由静态 Web 服务器部署。部署前确认生产环境配置了正确的 `VITE_API_BASE_URL`；环境变量会在构建期进入前端代码，禁止放置密钥。

**生产构建注意**：保留 `main.ts` 中 `ElMessage` 和 `ElMessageBox` 的显式样式引入，避免 API 可调用但生产产物缺少对应样式。路由懒加载资源发布后更新时，旧页面 chunk 失效会提示用户刷新。

## 11. 开发规范

### 新增页面流程

1. 在 `src/pages/` 对应业务目录新增页面，尽可能复用 `src/features/` API、`src/components/` 组件及领域类型。
2. 在 `src/router/routes.ts` 的 `/` 布局路由 `children` 添加路由记录，并配置 `meta`。
3. 对应菜单由 `buildMenus` 自动派生，不需要在 `MainLayout` 手工增加菜单项。
4. 有写操作的控件按现有约定添加 `v-permission`；确认后端同时实现接口鉴权。
5. 新逻辑补充相应 Vitest 单元测试；至少运行类型检查和相关测试。

### `meta` 字段约定

| 字段 | 说明 |
| --- | --- |
| `title` | 页面标题；同时用于 `document.title`、页签及菜单文案。需要出现在菜单的布局子路由必须设置。 |
| `icon` | Element Plus 图标组件；用于菜单项图标。 |
| `roles` | 角色白名单；命中任一角色即可通过前端角色校验。 |
| `permission` | 单个精确权限码；用于路由访问/菜单过滤。 |
| `hidden` | 隐藏侧边菜单入口，不会自动禁止直接访问。 |
| `group` | 菜单分组键；需是 `MENU_GROUPS` 中定义的分组。 |
| `order` | 分组内菜单排序，数值越小越靠前。 |

路由元数据类型集中扩展在 `src/types/router.d.ts`。公开页面（登录、403、500、404）使用 `public: true`；不要为了隐藏菜单而将路由误标成公开路由。

## 12. 环境变量说明

| 变量 | 必填 | 用途与注意事项 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | **是** | Axios API 基础地址。`main.ts` 在应用创建前校验，缺失会直接抛错并中止启动。开发/生产通常配置为同源 `/api`，再分别由 Vite 代理或生产反向代理转发。 |
| `VITE_WS_URL` | 否 | SockJS/WebSocket 连接地址；留空时不建立该实时连接。配置应与后端 SockJS 端点和部署代理一致，不能擅自加 `/api` 前缀。 |
| `VITE_APP_TITLE` | 否 | 浏览器标题后缀；未设置时使用默认平台标题。 |
| `VITE_PROXY_TARGET` | 否 | Vite 开发服务器代理目标，配置在 Vite 进程环境中；未提供时回退到 `http://localhost:8080`。生产部署不使用 Vite 开发代理。 |

Vite 暴露给浏览器的 `VITE_` 变量会进入前端构建产物，不能配置数据库密码、私钥或其他机密。新增变量时同步更新类型声明（如有需要）和本节说明。

## 13. 部署说明

1. 配置生产构建所需环境变量后运行 `npm run build`，将 `dist/` 部署至 Nginx 或其他静态站点服务器。
2. 项目采用 HTML5 History 路由，服务器需将前端路由请求回退到 `index.html`，否则直接刷新业务子路径会返回 404。
3. 将 `/api/` 代理到后端 API 服务；`VITE_API_BASE_URL` 应与此代理前缀一致。
4. 根据业务启用 `/ws` SockJS/WebSocket 代理（需支持 Upgrade/连接转发）、`/files` 静态资源代理及 `/actuator/health` 健康检查代理。
5. 生产环境建议使用同源 HTTPS 入口，避免跨域及 HTTPS 页面访问不安全 HTTP 资源。

Nginx 配置示例（后端服务名、端口和实际接口前缀按部署环境调整）：

```nginx
location /api/ {
  proxy_pass http://backend:8080/api/;
}

location /ws {
  proxy_pass http://backend:8080/ws;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}

location /files/ {
  proxy_pass http://backend:8080/files/;
}

location /actuator/ {
  proxy_pass http://backend:8080/actuator/;
}

location / {
  try_files $uri $uri/ /index.html;
}
```

## 14. 已知坑 & 注意事项（非常重要）

1. **localStorage 角色/权限可被篡改**：角色和权限快照可被用户在浏览器中修改，前端菜单、路由守卫及按钮显隐都可被绕过。必须在后端验证 Token、角色和每个操作的权限，不能信任客户端传来的角色或权限数据。
2. **登录权限快照可能陈旧**：当前 Store 从登录响应和本地缓存恢复权限；应用启动时没有统一调用 `/auth/me` 校准的实现。若管理员在用户登录期间修改其角色/权限，前端显示可能仍使用旧快照。应通过重新登录或后续实现服务端权限刷新流程处理，接口授权始终以服务端实时策略为准。
3. **权限动态刷新不是全局实时同步**：指令在挂载和组件更新时重新判断；认证 Store 有跨标签页 `storage` 同步，但这不等于服务端角色/权限的实时推送。权限变更后需明确刷新 Store/重新登录策略，并避免依赖 DOM 隐藏作为安全控制。
4. **Element Plus 消息/确认框样式**：手动导入的 `ElMessage`/`ElMessageBox` 不一定触发组件 Resolver 的样式注入；不要删除入口中的显式 CSS 导入。升级 Element Plus 后检查样式路径是否仍有效，并在生产产物中验证。
5. **必填 API 地址会阻断启动**：`VITE_API_BASE_URL` 缺失会在 `main.ts` 初始化前失败。CI、开发机与生产构建环境均需正确注入；不要把“能生成静态文件”误认为运行配置正确。
6. **History 路由刷新 404**：未配置 `try_files ... /index.html` 时，业务路由直接访问或刷新会由 Web 服务器返回 404。
7. **代理配置范围不同**：Vite 的 `/api`、`/ws`、`/files`、`/actuator` 代理仅供开发服务器使用；生产环境必须由 Nginx/网关配置相应转发。WebSocket/SockJS 端点需单独验证连接升级和路径。
8. **侧边栏折叠持久化**：`iot:layout:aside-collapsed` 存于 `localStorage`，值为 `1` 表示折叠。它是浏览器级偏好，不随登出清理；测试布局或清理用户偏好时需单独处理该键。
9. **页签生命周期与权限校验**：页签位于 `sessionStorage`，关闭标签页后失效；恢复时会按现有路由和前端权限清理无效页签。修改路由 path 或权限模型时，应检查旧会话数据和固定首页规则。
10. **列设置与浏览器存储**：表格列显隐写入按表格隔离的 `localStorage` 键；新增/重命名列时保持稳定键或接受用户偏好重置。固定操作列不可隐藏。
11. **Token 过期信息缺失**：前端过期判断使用存储的过期时间并预留 30 秒；无法解析或没有过期时间时视为“无法判断/未过期”，最终依赖后端 401 与刷新流程兜底。
12. **开发代理默认值**：未设置代理目标时请求会发往本机 `localhost:8080`。本地服务端口不一致时配置 `VITE_PROXY_TARGET`，生产环境不要依赖该开发默认值。
13. **资源更新后的懒加载失败**：部署版本更新后，用户打开的旧页面可能请求已删除的 chunk。当前路由错误处理会提示刷新；部署需配合合理静态资源缓存策略，避免无限自动刷新。
14. **页面文件不等同于可访问路由**：例如当前存在 `OtherDevicesPage.vue`，但尚未在 `routes.ts` 注册。新增页面要同时注册路由并补齐元数据，不能仅新增 Vue 文件。

## 15. 后续扩展方向

- 在应用启动或权限变更后通过后端接口刷新用户信息与权限快照，并设计失效/重登策略。
- 持续完善移动端和小屏布局、更多设备运维工作流及可观测性。
- 将 `logError` 接入正式监控与告警平台，并补充请求追踪信息。
- 为角色/权限变更、固件任务及实时推送增加更完整的集成测试和部署检查。

### 快速上手（启动命令）

需要 Node.js `^22.18.0` 或 `>=24.12.0`。安装依赖后确认 `.env.development` 中已配置 `VITE_API_BASE_URL`，再运行：

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run type-check   # TypeScript/Vue 类型检查
npm run test:unit    # Vitest 单元测试
npm run test:e2e     # Playwright 端到端测试
npm run build        # 类型检查 + 生产构建
npm run preview      # 本地预览生产构建
```
