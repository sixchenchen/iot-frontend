/**
 * 浏览器端文件下载工具。
 * 仅负责把 Blob 转成本地下载，不参与接口请求与错误提示。
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // 延迟释放，避免部分浏览器在 click 后仍读取该 URL 时被提前回收。
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 生成带时间戳的导出文件名。 */
export function timestampedFilename(base: string, extension: string): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `${base}-${stamp}.${extension}`
}
