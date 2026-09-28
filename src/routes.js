import { Router } from 'express'
import { devLoginAllowed, requireFamily, requireUser } from './auth.js'
import { CATEGORIES } from './seed.js'
import { id, token } from './ids.js'
import { clip, fail, MEALS, ok, today, validDate, wrap } from './http.js'
import { presentDish, presentFamily, presentMember, presentUser } from './present.js'
import { db } from './store/index.js'

export const api = Router()

api.post(
  '/auth/login',
  wrap(async (req, res) => {
    const nickname = clip(req.body?.nickname, 12)
    const emoji = clip(req.body?.emoji, 8) || '🍳'
    let openid = req.wxOpenid
    if (!openid) {
      if (!devLoginAllowed()) return fail(res, 403, '请从微信小程序进入')
      if (!nickname) return fail(res, 400, '先起个称呼')
      openid = `dev_${id()}`
    }
    let user = await db().getUser(openid)
    if (!user) {
      user = await db().createUser({
        openid,
        nickname: nickname || '家人',
        emoji,
        profileReady: !!nickname,
      })
    } else if (nickname) {
      user = await db().updateUser(openid, {
        nickname,
        emoji,
        profileReady: true,
      })
    }
    let sessionToken = ''
    if (!req.wxOpenid) {
      sessionToken = token()
      await db().createSession(sessionToken, user.openid)
    }
    const family = user.familyId ? await db().getFamily(user.familyId) : null
    ok(res, {
      token: sessionToken,
      user: presentUser(user, family),
      family: presentFamily(family),
    })
  }),
)

api.get(
  '/me',
  requireUser,
  wrap(async (req, res) => {
    ok(res, await profilePayload(req.user))
  }),
)

api.put(
  '/me',
  requireUser,
  wrap(async (req, res) => {
    const nickname = clip(req.body?.nickname, 12)
    const emoji = clip(req.body?.emoji, 8)
    if (!nickname) return fail(res, 400, '称呼不能为空')
    const user = await db().updateUser(req.user.openid, {
      nickname,
      emoji: emoji || req.user.emoji,
      profileReady: true,
    })
    ok(res, await profilePayload(user))
  }),
)

api.post(
  '/families',
  requireUser,
  wrap(async (req, res) => {
    if (req.user.familyId) return fail(res, 400, '你已经在一个家庭里')
    const name = clip(req.body?.name, 16)
    if (!name) return fail(res, 400, '给家里起个名字')
    const family = await db().createFamily({ name, ownerOpenid: req.user.openid })
    const user = await db().getUser(req.user.openid)
    ok(res, {
      user: presentUser(user, family),
      family: presentFamily(family),
    })
  }),
)

api.post(
  '/families/join',
  requireUser,
  wrap(async (req, res) => {
    if (req.user.familyId) return fail(res, 400, '请先退出当前家庭')
    const code = clip(req.body?.inviteCode, 8).toUpperCase()
    if (!code) return fail(res, 400, '请填写邀请码')
    const family = await db().getFamilyByInvite(code)
    if (!family) return fail(res, 404, '邀请码不对')
    const user = await db().updateUser(req.user.openid, { familyId: family.id })
    ok(res, {
      user: presentUser(user, family),
      family: presentFamily(family),
    })
  }),
)

api.put(
  '/families',
  requireUser,
  requireFamily,
  wrap(async (req, res) => {
    const family = await db().getFamily(req.user.familyId)
    if (!family) return fail(res, 404, '找不到这个家庭')
    if (family.ownerOpenid !== req.user.openid) return fail(res, 403, '只有家主可以改名')
    const name = clip(req.body?.name, 16)
    if (!name) return fail(res, 400, '家庭名字不能为空')
    const next = await db().updateFamily(family.id, { name })
    ok(res, { family: presentFamily(next) })
  }),
)

api.post(
  '/families/leave',
  requireUser,
  requireFamily,
  wrap(async (req, res) => {
    await db().leaveFamily(req.user.openid)
    const user = await db().getUser(req.user.openid)
    ok(res, { user: presentUser(user, null), family: null })
  }),
)

api.get(
  '/dishes',
  requireUser,
  requireFamily,
  wrap(async (req, res) => {
    const dishes = await db().listDishes(req.user.familyId)
    ok(res, { dishes: dishes.map(presentDish) })
  }),
)

api.post(
  '/dishes',
  requireUser,
  requireFamily,
  wrap(async (req, res) => {
    const parsed = parseDish(req.body)
    if (parsed.error) return fail(res, 400, parsed.error)
    const dish = await db().createDish({
      ...parsed.dish,
      familyId: req.user.familyId,
      createdBy: req.user.openid,
    })
    ok(res, { dish: presentDish(dish) })
  }),
)

api.put(
  '/dishes/:id',
  requireUser,
  requireFamily,
  wrap(async (req, res) => {
    const current = await db().getDish(req.params.id)
    if (!current || current.familyId !== req.user.familyId) return fail(res, 404, '没有这道菜')
    const parsed = parseDish(req.body)
    if (parsed.error) return fail(res, 400, parsed.error)
    const dish = await db().updateDish(current.id, parsed.dish)
    ok(res, { dish: presentDish(dish) })
  }),
)

api.delete(
  '/dishes/:id',
  requireUser,
  requireFamily,
  wrap(async (req, res) => {
    const current = await db().getDish(req.params.id)
    if (!current || current.familyId !== req.user.familyId) return fail(res, 404, '没有这道菜')
    await db().deleteDish(current.id)
    ok(res, { removed: true })
  }),
)

api.get(
  '/board',
  requireUser,
  requireFamily,
  wrap(async (req, res) => {
    const date = req.query.date || today()
    if (!validDate(date)) return fail(res, 400, '日期不正确')
    const family = await db().getFamily(req.user.familyId)
    const members = await db().listMembers(family.id)
    const dishes = await db().listDishes(family.id)
    const orders = await db().listOrders(family.id, date)
    const plans = await db().listMealPlans(family.id, date)
    const dishMap = new Map(dishes.map((dish) => [dish.id, dish]))
    const memberMap = new Map(members.map((member) => [member.openid, presentMember(member)]))
    const meals = MEALS.map((meal) => {
      const groups = new Map()
      orders
        .filter((order) => order.meal === meal)
        .forEach((order) => {
          const dish = dishMap.get(order.dishId)
          if (!dish) return
          if (!groups.has(dish.id)) {
            groups.set(dish.id, { dish: presentDish(dish), people: [] })
          }
          const person = memberMap.get(order.openid)
          groups.get(dish.id).people.push({
            openid: order.openid,
            nickname: person?.nickname || '家人',
            emoji: person?.emoji || '🙂',
            note: order.note || '',
          })
        })
      const plan = plans.find((item) => item.meal === meal)
      return {
        meal,
        cook: plan ? memberMap.get(plan.cookOpenid) || null : null,
        dishes: [...groups.values()],
      }
    })
    ok(res, {
      date,
      me: {
        openid: req.user.openid,
        nickname: req.user.nickname,
        emoji: req.user.emoji,
      },
      family: presentFamily(family),
      members: members.map((member) => ({
        ...presentMember(member),
        isOwner: member.openid === family.ownerOpenid,
      })),
      meals,
    })
  }),
)

api.post(
  '/orders',
  requireUser,
  requireFamily,
  wrap(async (req, res) => {
    const date = req.body?.date
    const meal = req.body?.meal
    if (!validDate(date)) return fail(res, 400, '日期不正确')
    if (!MEALS.includes(meal)) return fail(res, 400, '请选择早餐、午餐或晚餐')
    const incoming = Array.isArray(req.body?.items) ? req.body.items : null
    if (!incoming) return fail(res, 400, '缺少菜品')
    if (incoming.length > 20) return fail(res, 400, '一顿最多点 20 道')
    const dishes = await db().listDishes(req.user.familyId)
    const allowed = new Set(dishes.map((dish) => dish.id))
    const seen = new Set()
    const items = []
    for (const item of incoming) {
      const dishId = String(item?.dishId || '')
      if (!dishId || seen.has(dishId)) continue
      if (!allowed.has(dishId)) return fail(res, 400, '有菜不在家里的菜谱里')
      seen.add(dishId)
      items.push({ dishId, note: clip(item?.note, 40) })
    }
    await db().replaceUserOrders({
      familyId: req.user.familyId,
      openid: req.user.openid,
      date,
      meal,
      items,
    })
    ok(res, { saved: items.length })
  }),
)

api.post(
  '/cook',
  requireUser,
  requireFamily,
  wrap(async (req, res) => {
    const date = req.body?.date
    const meal = req.body?.meal
    const action = req.body?.action === 'cancel' ? 'cancel' : 'take'
    if (!validDate(date)) return fail(res, 400, '日期不正确')
    if (!MEALS.includes(meal)) return fail(res, 400, '请选择早餐、午餐或晚餐')
    if (action === 'cancel') {
      const plans = await db().listMealPlans(req.user.familyId, date)
      const plan = plans.find((item) => item.meal === meal)
      const family = await db().getFamily(req.user.familyId)
      if (plan && plan.cookOpenid !== req.user.openid && family.ownerOpenid !== req.user.openid) {
        return fail(res, 403, '只能取消自己的掌勺')
      }
      await db().clearCook({ familyId: req.user.familyId, date, meal })
    } else {
      await db().setCook({
        familyId: req.user.familyId,
        date,
        meal,
        openid: req.user.openid,
      })
    }
    ok(res, { action })
  }),
)

api.get(
  '/shopping',
  requireUser,
  requireFamily,
  wrap(async (req, res) => {
    const date = req.query.date || today()
    if (!validDate(date)) return fail(res, 400, '日期不正确')
    const dishes = await db().listDishes(req.user.familyId)
    const orders = await db().listOrders(req.user.familyId, date)
    const dishMap = new Map(dishes.map((dish) => [dish.id, dish]))
    const used = new Map()
    orders.forEach((order) => {
      const dish = dishMap.get(order.dishId)
      if (!dish || used.has(dish.id)) return
      used.set(dish.id, dish)
    })
    const items = new Map()
    used.forEach((dish) => {
      dish.ingredients.forEach((ingredient) => {
        const name = clip(ingredient.name, 20)
        if (!name) return
        if (!items.has(name)) items.set(name, { name, amounts: [], dishes: [] })
        const row = items.get(name)
        const amount = clip(ingredient.amount, 20)
        if (amount && !row.amounts.includes(amount)) row.amounts.push(amount)
        if (!row.dishes.includes(dish.name)) row.dishes.push(dish.name)
      })
    })
    ok(res, {
      date,
      dishCount: used.size,
      items: [...items.values()],
    })
  }),
)

function parseDish(body) {
  const name = clip(body?.name, 20)
  const emoji = clip(body?.emoji, 8) || '🍽️'
  const category = clip(body?.category, 8)
  const note = clip(body?.note, 80)
  if (!name) return { error: '菜名还空着' }
  if (!CATEGORIES.includes(category)) return { error: '请选一个分类' }
  const source = Array.isArray(body?.ingredients) ? body.ingredients : []
  if (source.length > 20) return { error: '食材太多了' }
  const ingredients = []
  for (const item of source) {
    const ingredientName = clip(item?.name, 20)
    const amount = clip(item?.amount, 20)
    if (!ingredientName) continue
    ingredients.push({ name: ingredientName, amount })
  }
  return { dish: { name, emoji, category, note, ingredients } }
}

async function profilePayload(user) {
  const family = user.familyId ? await db().getFamily(user.familyId) : null
  const members = family ? await db().listMembers(family.id) : []
  return {
    user: presentUser(user, family),
    family: presentFamily(family),
    members: members.map((member) => ({
      ...presentMember(member),
      isOwner: family ? member.openid === family.ownerOpenid : false,
    })),
  }
}
