import { createHmac } from 'node:crypto'

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

export function createKlingJwt(accessKey: string, secretKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iss: accessKey,
      exp: now + 1800,
      nbf: now - 5
    })
  )
  const signature = createHmac('sha256', secretKey)
    .update(`${header}.${payload}`)
    .digest('base64url')

  return `${header}.${payload}.${signature}`
}

export function klingAuthorization(apiKey: string, secretKey?: string): string {
  if (secretKey && secretKey.trim()) {
    return `Bearer ${createKlingJwt(apiKey, secretKey.trim())}`
  }
  return `Bearer ${apiKey}`
}
