const base = process.env.SMOKE_URL || 'http://127.0.0.1:3000'

async function call(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json()
  if (!response.ok || payload.ok === false) {
    throw new Error(`${method} ${path} -> ${response.status} ${payload.message || ''}`)
  }
  return payload.data
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const me = await call('/api/auth/login', {
  method: 'POST',
  body: { nickname: '妈妈', emoji: '🍅' },
})
assert(me.token, '登录应返回 token')
assert(me.user.nickname === '妈妈', '昵称应保存')

const created = await call('/api/families', {
  method: 'POST',
  token: me.token,
  body: { name: '张家的厨房' },
})
assert(created.family.inviteCode, '应生成邀请码')

const dishes = await call('/api/dishes', { token: me.token })
assert(dishes.dishes.length >= 10, '新建家庭应带上家常菜')
const tomato = dishes.dishes.find((dish) => dish.name === '番茄炒蛋')
const rice = dishes.dishes.find((dish) => dish.name === '米饭')

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())

await call('/api/orders', {
  method: 'POST',
  token: me.token,
  body: {
    date: today,
    meal: 'dinner',
    items: [
      { dishId: tomato.id, note: '少糖' },
      { dishId: rice.id, note: '' },
    ],
  },
})
await call('/api/cook', {
  method: 'POST',
  token: me.token,
  body: { date: today, meal: 'dinner', action: 'take' },
})

const board = await call(`/api/board?date=${today}`, { token: me.token })
const dinner = board.meals.find((item) => item.meal === 'dinner')
assert(dinner.dishes.length === 2, '晚餐应有两道菜')
assert(dinner.cook.nickname === '妈妈', '掌勺人应为妈妈')

const shopping = await call(`/api/shopping?date=${today}`, { token: me.token })
assert(shopping.items.some((item) => item.name === '番茄'), '采购清单应包含番茄')
assert(shopping.items.some((item) => item.name === '大米'), '采购清单应包含大米')

const dad = await call('/api/auth/login', {
  method: 'POST',
  body: { nickname: '爸爸', emoji: '🍳' },
})
const joined = await call('/api/families/join', {
  method: 'POST',
  token: dad.token,
  body: { inviteCode: created.family.inviteCode.toLowerCase() },
})
assert(joined.family.id === created.family.id, '应加入同一个家庭')

await call('/api/orders', {
  method: 'POST',
  token: dad.token,
  body: { date: today, meal: 'dinner', items: [{ dishId: tomato.id, note: '' }] },
})
const shared = await call(`/api/board?date=${today}`, { token: dad.token })
const sharedTomato = shared.meals
  .find((item) => item.meal === 'dinner')
  .dishes.find((item) => item.dish.name === '番茄炒蛋')
assert(sharedTomato.people.length === 2, '同一道菜应合并两位家人')

await call('/api/families/leave', { method: 'POST', token: dad.token })
const afterLeave = await call('/api/me', { token: dad.token })
assert(!afterLeave.family, '退出后不应再有家庭')

const renamed = await call('/api/me', {
  method: 'PUT',
  token: me.token,
  body: { nickname: '老妈', emoji: '🥣' },
})
assert(renamed.user.nickname === '老妈', '应能修改称呼')

console.log('smoke ok', created.family.inviteCode)
