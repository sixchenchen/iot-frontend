/// <reference types="vite/client" />

/**
 * 环境变量类型声明。
 *
 * 说明：
 *   - 只有 VITE_ 前缀的变量会被 Vite 注入到客户端，且会明文进入产物，
 *     严禁存放任何密钥；
 *   - 必填项（VITE_API_BASE_URL）在 src/main.ts 启动时校验，缺失会直接中止启动，
 *     避免生产环境 baseURL=undefined 后请求打到站点根路径；
 *   - 变量名与 .env.development / .env.production 保持一致。
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_WS_URL?: string
  readonly VITE_APP_TITLE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
