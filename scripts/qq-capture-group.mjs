import fs from 'node:fs'

/**
 * 抓取 QQ 机器人群的 group_openid。
 * 用法：
 *   QQ_BOT_APP_ID=... QQ_BOT_APP_SECRET=... node scripts/qq-capture-group.mjs
 * 然后在目标群里 @ 机器人随便说一句话，脚本会保存 openid 并退出。
 */

const appId = process.env.QQ_BOT_APP_ID
const secret = process.env.QQ_BOT_APP_SECRET
if (!appId || !secret) {
  throw new Error('缺少 QQ_BOT_APP_ID / QQ_BOT_APP_SECRET')
}

const tokenResponse = await fetch(
  'https://bots.qq.com/app/getAppAccessToken',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, clientSecret: secret })
  }
)
const tokenData = await tokenResponse.json()
const accessToken = tokenData.access_token
if (!accessToken) {
  throw new Error(`获取 access_token 失败：${JSON.stringify(tokenData)}`)
}

const gatewayResponse = await fetch('https://api.sgroup.qq.com/gateway', {
  headers: { Authorization: `QQBot ${accessToken}` }
})
const gatewayData = await gatewayResponse.json()
if (!gatewayData.url) {
  throw new Error(`获取 gateway 失败：${JSON.stringify(gatewayData)}`)
}

const intents = 1 << 25
const ws = new WebSocket(gatewayData.url)
let heartbeat
let seq = null

function send(payload) {
  ws.send(JSON.stringify(payload))
}

ws.onopen = () => {
  console.log('[qq] 已连接网关，等待 READY 后请在群里 @ 机器人…')
}

ws.onmessage = (event) => {
  const payload = JSON.parse(event.data)

  if (payload.s !== undefined && payload.s !== null) seq = payload.s

  if (payload.op === 10) {
    const interval = payload.d?.heartbeat_interval ?? 30000
    heartbeat = setInterval(() => {
      send({ op: 1, d: seq })
    }, interval)
    send({
      op: 2,
      d: {
        token: `QQBot ${accessToken}`,
        intents,
        shard: [0, 1]
      }
    })
    return
  }

  if (payload.op === 0 && payload.t === 'READY') {
    console.log('[qq] READY，机器人已上线，请在群里 @ 机器人发一条消息')
    return
  }

  if (payload.op === 0 && payload.t === 'GROUP_AT_MESSAGE_CREATE') {
    const groupOpenid = payload.d?.group_openid
    if (!groupOpenid) return
    fs.writeFileSync(
      '.qq-group.json',
      JSON.stringify(
        {
          groupOpenid,
          groupName: payload.d?.author?.member_name ?? null,
          capturedAt: new Date().toISOString()
        },
        null,
        2
      ) + '\n'
    )
    console.log(`[qq] 捕获到 group_openid：${groupOpenid}`)
    console.log('[qq] 已写入 .qq-group.json')
    clearInterval(heartbeat)
    ws.close()
    process.exit(0)
  }
}

ws.onerror = (error) => {
  console.error('[qq] WebSocket 错误:', error?.message ?? error)
}

ws.onclose = () => {
  clearInterval(heartbeat)
}

setTimeout(() => {
  console.error('[qq] 超时：5 分钟内没有收到群消息事件')
  clearInterval(heartbeat)
  ws.close()
  process.exit(1)
}, 5 * 60 * 1000)
