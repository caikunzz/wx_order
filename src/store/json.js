import fs from 'fs'
import path from 'path'
import { id, inviteCode } from '../ids.js'
import { buildSeedDishes } from '../seed.js'

const EMPTY = {
  users: [],
  families: [],
  dishes: [],
  orders: [],
  mealPlans: [],
  sessions: [],
}

export class JsonStore {
  constructor(file = process.env.DATA_FILE || path.join(process.cwd(), 'data', 'db.json')) {
    this.file = file
    this.data = structuredClone(EMPTY)
    this.queue = Promise.resolve()
  }

  async init() {
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true })
    try {
      const raw = await fs.promises.readFile(this.file, 'utf8')
      this.data = { ...structuredClone(EMPTY), ...JSON.parse(raw) }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      await this.persist()
    }
  }

  async persist() {
    const tmp = `${this.file}.tmp`
    await fs.promises.writeFile(tmp, JSON.stringify(this.data))
    await fs.promises.rename(tmp, this.file)
  }

  mutate(fn) {
    const run = this.queue.then(async () => {
      const next = structuredClone(this.data)
      const result = await fn(next)
      this.data = next
      await this.persist()
      return result
    })
    this.queue = run.then(
      () => {},
      () => {},
    )
    return run
  }

  read(fn) {
    return fn(this.data)
  }

  async getUser(openid) {
    return this.read((db) => db.users.find((user) => user.openid === openid) || null)
  }

  async createUser({ openid, nickname, emoji, profileReady }) {
    return this.mutate((db) => {
      const user = {
        openid,
        nickname,
        emoji,
        familyId: null,
        profileReady: !!profileReady,
        createdAt: Date.now(),
      }
      db.users.push(user)
      return user
    })
  }

  async updateUser(openid, patch) {
    return this.mutate((db) => {
      const user = db.users.find((item) => item.openid === openid)
      if (!user) return null
      const next = sanitizeUserPatch(patch)
      Object.assign(user, next)
      return user
    })
  }

  async createSession(sessionToken, openid) {
    return this.mutate((db) => {
      db.sessions = db.sessions.filter((item) => item.openid !== openid)
      db.sessions.push({ token: sessionToken, openid, createdAt: Date.now() })
    })
  }

  async getOpenidByToken(sessionToken) {
    return this.read((db) => db.sessions.find((item) => item.token === sessionToken)?.openid || null)
  }

  async createFamily({ name, ownerOpenid }) {
    return this.mutate((db) => {
      let code = ''
      for (let i = 0; i < 5; i += 1) {
        const next = inviteCode()
        if (!db.families.some((item) => item.inviteCode === next)) {
          code = next
          break
        }
      }
      if (!code) {
        const error = new Error('邀请码生成失败')
        error.status = 500
        throw error
      }
      const family = {
        id: id(),
        name,
        inviteCode: code,
        ownerOpenid,
        createdAt: Date.now(),
      }
      db.families.push(family)
      const owner = db.users.find((user) => user.openid === ownerOpenid)
      if (owner) owner.familyId = family.id
      db.dishes.push(...buildSeedDishes(family.id, ownerOpenid, id))
      return family
    })
  }

  async getFamily(familyId) {
    return this.read((db) => db.families.find((item) => item.id === familyId) || null)
  }

  async getFamilyByInvite(code) {
    const normalized = String(code || '').trim().toUpperCase()
    return this.read((db) => db.families.find((item) => item.inviteCode === normalized) || null)
  }

  async updateFamily(familyId, patch) {
    return this.mutate((db) => {
      const family = db.families.find((item) => item.id === familyId)
      if (!family) return null
      if (patch.name) family.name = patch.name
      return family
    })
  }

  async listMembers(familyId) {
    return this.read((db) =>
      db.users
        .filter((user) => user.familyId === familyId)
        .sort((a, b) => a.createdAt - b.createdAt),
    )
  }

  async leaveFamily(openid) {
    return this.mutate((db) => {
      const user = db.users.find((item) => item.openid === openid)
      if (!user?.familyId) return
      const familyId = user.familyId
      const members = db.users.filter((item) => item.familyId === familyId)
      if (members.length <= 1) {
        removeFamily(db, familyId)
        return
      }
      const family = db.families.find((item) => item.id === familyId)
      if (family?.ownerOpenid === openid) {
        const nextOwner = members.find((item) => item.openid !== openid)
        if (nextOwner) family.ownerOpenid = nextOwner.openid
      }
      user.familyId = null
      db.mealPlans = db.mealPlans.filter(
        (item) => !(item.familyId === familyId && item.cookOpenid === openid),
      )
    })
  }

  async listDishes(familyId) {
    return this.read((db) =>
      db.dishes
        .filter((dish) => dish.familyId === familyId)
        .sort((a, b) => b.createdAt - a.createdAt),
    )
  }

  async getDish(dishId) {
    return this.read((db) => db.dishes.find((dish) => dish.id === dishId) || null)
  }

  async createDish(dish) {
    return this.mutate((db) => {
      const row = { ...dish, id: dish.id || id(), createdAt: Date.now() }
      db.dishes.push(row)
      return row
    })
  }

  async updateDish(dishId, patch) {
    return this.mutate((db) => {
      const dish = db.dishes.find((item) => item.id === dishId)
      if (!dish) return null
      Object.assign(dish, patch)
      return dish
    })
  }

  async deleteDish(dishId) {
    return this.mutate((db) => {
      const dish = db.dishes.find((item) => item.id === dishId)
      if (!dish) return false
      db.dishes = db.dishes.filter((item) => item.id !== dishId)
      db.orders = db.orders.filter((item) => item.dishId !== dishId)
      return true
    })
  }

  async listOrders(familyId, date) {
    return this.read((db) =>
      db.orders.filter((item) => item.familyId === familyId && item.date === date),
    )
  }

  async replaceUserOrders({ familyId, openid, date, meal, items }) {
    return this.mutate((db) => {
      db.orders = db.orders.filter(
        (item) =>
          !(
            item.familyId === familyId &&
            item.openid === openid &&
            item.date === date &&
            item.meal === meal
          ),
      )
      const created = items.map((item) => ({
        id: id(),
        familyId,
        openid,
        date,
        meal,
        dishId: item.dishId,
        note: item.note || '',
        createdAt: Date.now(),
      }))
      db.orders.push(...created)
      return created
    })
  }

  async listMealPlans(familyId, date) {
    return this.read((db) =>
      db.mealPlans.filter((item) => item.familyId === familyId && item.date === date),
    )
  }

  async setCook({ familyId, date, meal, openid }) {
    return this.mutate((db) => {
      const current = db.mealPlans.find(
        (item) => item.familyId === familyId && item.date === date && item.meal === meal,
      )
      if (current) {
        current.cookOpenid = openid
        return current
      }
      const plan = { id: id(), familyId, date, meal, cookOpenid: openid }
      db.mealPlans.push(plan)
      return plan
    })
  }

  async clearCook({ familyId, date, meal }) {
    return this.mutate((db) => {
      db.mealPlans = db.mealPlans.filter(
        (item) => !(item.familyId === familyId && item.date === date && item.meal === meal),
      )
    })
  }
}

function sanitizeUserPatch(patch) {
  const next = {}
  if (patch.nickname !== undefined) next.nickname = patch.nickname
  if (patch.emoji !== undefined) next.emoji = patch.emoji
  if (patch.familyId !== undefined) next.familyId = patch.familyId
  if (patch.profileReady !== undefined) next.profileReady = !!patch.profileReady
  return next
}

function removeFamily(db, familyId) {
  db.families = db.families.filter((item) => item.id !== familyId)
  db.dishes = db.dishes.filter((item) => item.familyId !== familyId)
  db.orders = db.orders.filter((item) => item.familyId !== familyId)
  db.mealPlans = db.mealPlans.filter((item) => item.familyId !== familyId)
  db.users.forEach((user) => {
    if (user.familyId === familyId) user.familyId = null
  })
}
