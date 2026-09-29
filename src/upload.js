import fs from 'fs'
import path from 'path'
import { id } from './ids.js'

const uploadDir = path.join(process.cwd(), 'uploads')
const maxBytes = 5 * 1024 * 1024

export function receiveImage(req) {
  return readBody(req).then((buffer) => {
    const header = String(req.headers['content-type'] || '')
    const matched = header.match(/boundary=(?:"([^"]+)"|([^;]+))/)
    const boundary = matched && (matched[1] || matched[2])
    if (!boundary) {
      throw Object.assign(new Error('请选择图片'), { status: 400 })
    }
    const file = firstFile(buffer, boundary.trim())
    if (!file) throw Object.assign(new Error('没有选到图片'), { status: 400 })
    const ext = imageExt(file.body)
    if (!ext) throw Object.assign(new Error('只支持 jpg、png、webp'), { status: 400 })
    const filename = `${id()}${ext}`
    fs.mkdirSync(uploadDir, { recursive: true })
    fs.writeFileSync(path.join(uploadDir, filename), file.body)
    return `/uploads/${filename}`
  })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(Object.assign(new Error('图片不能超过 5MB'), { status: 400 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', reject)
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

function firstFile(buffer, boundary) {
  const marker = Buffer.from(`--${boundary}`)
  const separator = Buffer.from('\r\n\r\n')
  let cursor = buffer.indexOf(marker)
  while (cursor >= 0) {
    const headersStart = cursor + marker.length
    if (buffer[headersStart] === 0x2d && buffer[headersStart + 1] === 0x2d) break
    const lineBreak = buffer[headersStart] === 0x0d ? 2 : 0
    const headerStart = headersStart + lineBreak
    const headerEnd = buffer.indexOf(separator, headerStart)
    if (headerEnd < 0) return null
    const headers = buffer.slice(headerStart, headerEnd).toString('utf8')
    const bodyStart = headerEnd + separator.length
    const next = buffer.indexOf(marker, bodyStart)
    if (next < 0) return null
    const bodyEnd = next >= 2 && buffer[next - 2] === 0x0d ? next - 2 : next
    if (/filename="/i.test(headers)) {
      return { body: buffer.slice(bodyStart, bodyEnd) }
    }
    cursor = next
  }
  return null
}

function imageExt(body) {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return '.jpg'
  if (body.length >= 4 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47) {
    return '.png'
  }
  if (body.length >= 12 && body.slice(0, 4).toString() === 'RIFF' && body.slice(8, 12).toString() === 'WEBP') {
    return '.webp'
  }
  return ''
}
