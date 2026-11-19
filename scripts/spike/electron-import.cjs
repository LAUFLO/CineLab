// M0 spike：验证 CJS 文件内动态 import ESM 包。
// 运行：$env:ELECTRON_RUN_AS_NODE=1; .\node_modules\electron\dist\electron.exe scripts\spike\electron-import.cjs
;(async () => {
  try {
    const m = await import('@earendil-works/pi-coding-agent')
    console.log('cjs-dynamic-import-ok', typeof m.createAgentSession, typeof m.SessionManager)
  } catch (error) {
    console.error('cjs-dynamic-import-fail', error.code, error.message)
    process.exitCode = 1
  }
})()
