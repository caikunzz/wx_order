import { fail } from './http.js'
import { db } from './store/index.js'

export async function attachUser(req, res, next) {
  try {
    const wxOpenid = String(req.headers['x-wx-openid'] || '').trim()
    req.wxOpenid = wxOpenid
    if (wxOpenid) {
      req.user = await db().getUser(wxOpenid)
      return next()
    }
    const header = String(req.headers.authorization || '')
    const sessionToken = header.replace(/^Bearer\s+/i, '').trim()
    if (sessionToken && sessionToken !== header) {
      const openid = await db().getOpenidByToken(sessionToken)
      req.user = openid ? await db().getUser(openid) : null
      return next()
    }
    req.user = null
    next()
  } catch (error) {
    next(error)
  }
}

export function requireUser(req, res, next) {
  if (!req.user) return fail(res, 401, '请先登录')
  next()
}

export function requireFamily(req, res, next) {
  if (!req.user?.familyId) return fail(res, 400, '请先加入家庭')
  next()
}

export function devLoginAllowed() {
  return process.env.ALLOW_DEV_LOGIN !== '0'
}
