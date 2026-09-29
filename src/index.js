import path from 'path'
import express from 'express'
import cors from 'cors'
import { attachUser } from './auth.js'
import { api } from './routes.js'
import { initStore } from './store/index.js'

const app = express()
app.disable('x-powered-by')
app.use(cors())
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))
app.use(express.json({ limit: '1mb' }))
app.use(attachUser)

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'wx-order' })
})

app.use('/api', api)

app.use((req, res) => {
  res.status(404).json({ ok: false, message: '没有这个接口' })
})

app.use((error, req, res, next) => {
  console.error(error)
  const status = error.status || 500
  res.status(status).json({
    ok: false,
    message: status === 500 ? '服务开小差了' : error.message,
  })
})

const port = Number(process.env.PORT) || 80

initStore()
  .then(() => {
    app.listen(port, () => {
      console.log(`[wx-order] 监听端口 ${port}`)
    })
  })
  .catch((error) => {
    console.error('[wx-order] 启动失败', error)
    process.exit(1)
  })
