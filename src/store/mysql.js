import mysql from 'mysql2/promise'
import { id, inviteCode } from '../ids.js'
import { buildSeedDishes } from '../seed.js'

export class MysqlStore {
  async init() {
    const address = process.env.MYSQL_ADDRESS || ''
    const [host, port = '3306'] = address.split(':')
    this.pool = mysql.createPool({
      host,
      port: Number(port),
      user: process.env.MYSQL_USERNAME,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE || 'wx_order',
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: 8,
    })
    const statements = [
      `CREATE TABLE IF NOT EXISTS users (
        openid VARCHAR(64) PRIMARY KEY,
        nickname VARCHAR(32) NOT NULL,
        emoji VARCHAR(16) NOT NULL,
        family_id VARCHAR(32) NULL,
        profile_ready TINYINT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS sessions (
        token VARCHAR(80) PRIMARY KEY,
        openid VARCHAR(64) NOT NULL,
        created_at BIGINT NOT NULL,
        KEY idx_session_user (openid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS families (
        id VARCHAR(32) PRIMARY KEY,
        name VARCHAR(32) NOT NULL,
        invite_code VARCHAR(8) NOT NULL,
        owner_openid VARCHAR(64) NOT NULL,
        created_at BIGINT NOT NULL,
        UNIQUE KEY uniq_invite (invite_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS dishes (
        id VARCHAR(32) PRIMARY KEY,
        family_id VARCHAR(32) NOT NULL,
        name VARCHAR(32) NOT NULL,
        emoji VARCHAR(16) NOT NULL,
        category VARCHAR(8) NOT NULL,
        note VARCHAR(200) NOT NULL DEFAULT '',
        ingredients TEXT NOT NULL,
        created_by VARCHAR(64) NOT NULL,
        created_at BIGINT NOT NULL,
        KEY idx_dish_family (family_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(32) PRIMARY KEY,
        family_id VARCHAR(32) NOT NULL,
        order_date CHAR(10) NOT NULL,
        meal VARCHAR(16) NOT NULL,
        dish_id VARCHAR(32) NOT NULL,
        openid VARCHAR(64) NOT NULL,
        note VARCHAR(80) NOT NULL DEFAULT '',
        created_at BIGINT NOT NULL,
        KEY idx_order_board (family_id, order_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS meal_plans (
        id VARCHAR(32) PRIMARY KEY,
        family_id VARCHAR(32) NOT NULL,
        plan_date CHAR(10) NOT NULL,
        meal VARCHAR(16) NOT NULL,
        cook_openid VARCHAR(64) NOT NULL,
        UNIQUE KEY uniq_meal (family_id, plan_date, meal)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ]
    for (const statement of statements) {
      await this.pool.query(statement)
    }
  }

  async getUser(openid) {
    const [rows] = await this.pool.query('SELECT * FROM users WHERE openid = ?', [openid])
    return mapUser(rows[0])
  }

  async createUser({ openid, nickname, emoji, profileReady }) {
    const user = {
      openid,
      nickname,
      emoji,
      familyId: null,
      profileReady: !!profileReady,
      createdAt: Date.now(),
    }
    await this.pool.query(
      'INSERT INTO users (openid, nickname, emoji, family_id, profile_ready, created_at) VALUES (?, ?, ?, NULL, ?, ?)',
      [user.openid, user.nickname, user.emoji, user.profileReady ? 1 : 0, user.createdAt],
    )
    return user
  }

  async updateUser(openid, patch) {
    const user = await this.getUser(openid)
    if (!user) return null
    if (patch.nickname !== undefined) user.nickname = patch.nickname
    if (patch.emoji !== undefined) user.emoji = patch.emoji
    if (patch.familyId !== undefined) user.familyId = patch.familyId
    if (patch.profileReady !== undefined) user.profileReady = !!patch.profileReady
    await this.pool.query(
      'UPDATE users SET nickname = ?, emoji = ?, family_id = ?, profile_ready = ? WHERE openid = ?',
      [user.nickname, user.emoji, user.familyId, user.profileReady ? 1 : 0, openid],
    )
    return user
  }

  async createSession(sessionToken, openid) {
    const conn = await this.pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query('DELETE FROM sessions WHERE openid = ?', [openid])
      await conn.query('INSERT INTO sessions (token, openid, created_at) VALUES (?, ?, ?)', [
        sessionToken,
        openid,
        Date.now(),
      ])
      await conn.commit()
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  async getOpenidByToken(sessionToken) {
    const [rows] = await this.pool.query('SELECT openid FROM sessions WHERE token = ?', [sessionToken])
    return rows[0]?.openid || null
  }

  async createFamily({ name, ownerOpenid }) {
    const conn = await this.pool.getConnection()
    try {
      await conn.beginTransaction()
      let code = ''
      for (let i = 0; i < 5; i += 1) {
        const next = inviteCode()
        const [rows] = await conn.query('SELECT id FROM families WHERE invite_code = ?', [next])
        if (!rows.length) {
          code = next
          break
        }
      }
      if (!code) throw Object.assign(new Error('邀请码生成失败'), { status: 500 })
      const family = {
        id: id(),
        name,
        inviteCode: code,
        ownerOpenid,
        createdAt: Date.now(),
      }
      await conn.query(
        'INSERT INTO families (id, name, invite_code, owner_openid, created_at) VALUES (?, ?, ?, ?, ?)',
        [family.id, family.name, family.inviteCode, family.ownerOpenid, family.createdAt],
      )
      await conn.query('UPDATE users SET family_id = ? WHERE openid = ?', [family.id, ownerOpenid])
      for (const dish of buildSeedDishes(family.id, ownerOpenid, id)) {
        await insertDish(conn, dish)
      }
      await conn.commit()
      return family
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  async getFamily(familyId) {
    const [rows] = await this.pool.query('SELECT * FROM families WHERE id = ?', [familyId])
    return mapFamily(rows[0])
  }

  async getFamilyByInvite(code) {
    const normalized = String(code || '').trim().toUpperCase()
    const [rows] = await this.pool.query('SELECT * FROM families WHERE invite_code = ?', [normalized])
    return mapFamily(rows[0])
  }

  async updateFamily(familyId, patch) {
    const family = await this.getFamily(familyId)
    if (!family) return null
    if (patch.name) family.name = patch.name
    await this.pool.query('UPDATE families SET name = ? WHERE id = ?', [family.name, familyId])
    return family
  }

  async listMembers(familyId) {
    const [rows] = await this.pool.query(
      'SELECT * FROM users WHERE family_id = ? ORDER BY created_at ASC',
      [familyId],
    )
    return rows.map(mapUser)
  }

  async leaveFamily(openid) {
    const user = await this.getUser(openid)
    if (!user?.familyId) return
    const familyId = user.familyId
    const members = await this.listMembers(familyId)
    const conn = await this.pool.getConnection()
    try {
      await conn.beginTransaction()
      if (members.length <= 1) {
        await conn.query('DELETE FROM orders WHERE family_id = ?', [familyId])
        await conn.query('DELETE FROM meal_plans WHERE family_id = ?', [familyId])
        await conn.query('DELETE FROM dishes WHERE family_id = ?', [familyId])
        await conn.query('DELETE FROM families WHERE id = ?', [familyId])
        await conn.query('UPDATE users SET family_id = NULL WHERE family_id = ?', [familyId])
      } else {
        const family = await this.getFamily(familyId)
        if (family?.ownerOpenid === openid) {
          const nextOwner = members.find((item) => item.openid !== openid)
          if (nextOwner) {
            await conn.query('UPDATE families SET owner_openid = ? WHERE id = ?', [
              nextOwner.openid,
              familyId,
            ])
          }
        }
        await conn.query('UPDATE users SET family_id = NULL WHERE openid = ?', [openid])
        await conn.query('DELETE FROM meal_plans WHERE family_id = ? AND cook_openid = ?', [
          familyId,
          openid,
        ])
      }
      await conn.commit()
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  async listDishes(familyId) {
    const [rows] = await this.pool.query(
      'SELECT * FROM dishes WHERE family_id = ? ORDER BY created_at DESC',
      [familyId],
    )
    return rows.map(mapDish)
  }

  async getDish(dishId) {
    const [rows] = await this.pool.query('SELECT * FROM dishes WHERE id = ?', [dishId])
    return mapDish(rows[0])
  }

  async createDish(dish) {
    const row = { ...dish, id: dish.id || id(), createdAt: Date.now() }
    await insertDish(this.pool, row)
    return row
  }

  async updateDish(dishId, patch) {
    const dish = await this.getDish(dishId)
    if (!dish) return null
    Object.assign(dish, patch)
    await this.pool.query(
      'UPDATE dishes SET name = ?, emoji = ?, category = ?, note = ?, ingredients = ? WHERE id = ?',
      [dish.name, dish.emoji, dish.category, dish.note || '', JSON.stringify(dish.ingredients || []), dishId],
    )
    return dish
  }

  async deleteDish(dishId) {
    const dish = await this.getDish(dishId)
    if (!dish) return false
    const conn = await this.pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query('DELETE FROM orders WHERE dish_id = ?', [dishId])
      await conn.query('DELETE FROM dishes WHERE id = ?', [dishId])
      await conn.commit()
      return true
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  async listOrders(familyId, date) {
    const [rows] = await this.pool.query(
      'SELECT * FROM orders WHERE family_id = ? AND order_date = ?',
      [familyId, date],
    )
    return rows.map(mapOrder)
  }

  async replaceUserOrders({ familyId, openid, date, meal, items }) {
    const conn = await this.pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query(
        'DELETE FROM orders WHERE family_id = ? AND openid = ? AND order_date = ? AND meal = ?',
        [familyId, openid, date, meal],
      )
      const created = []
      for (const item of items) {
        const row = {
          id: id(),
          familyId,
          openid,
          date,
          meal,
          dishId: item.dishId,
          note: item.note || '',
          createdAt: Date.now(),
        }
        await conn.query(
          'INSERT INTO orders (id, family_id, order_date, meal, dish_id, openid, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [row.id, row.familyId, row.date, row.meal, row.dishId, row.openid, row.note, row.createdAt],
        )
        created.push(row)
      }
      await conn.commit()
      return created
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  }

  async listMealPlans(familyId, date) {
    const [rows] = await this.pool.query(
      'SELECT * FROM meal_plans WHERE family_id = ? AND plan_date = ?',
      [familyId, date],
    )
    return rows.map(mapPlan)
  }

  async setCook({ familyId, date, meal, openid }) {
    const current = (await this.listMealPlans(familyId, date)).find((item) => item.meal === meal)
    if (current) {
      await this.pool.query('UPDATE meal_plans SET cook_openid = ? WHERE id = ?', [openid, current.id])
      current.cookOpenid = openid
      return current
    }
    const plan = { id: id(), familyId, date, meal, cookOpenid: openid }
    await this.pool.query(
      'INSERT INTO meal_plans (id, family_id, plan_date, meal, cook_openid) VALUES (?, ?, ?, ?, ?)',
      [plan.id, plan.familyId, plan.date, plan.meal, plan.cookOpenid],
    )
    return plan
  }

  async clearCook({ familyId, date, meal }) {
    await this.pool.query('DELETE FROM meal_plans WHERE family_id = ? AND plan_date = ? AND meal = ?', [
      familyId,
      date,
      meal,
    ])
  }
}

async function insertDish(executor, dish) {
  await executor.query(
    'INSERT INTO dishes (id, family_id, name, emoji, category, note, ingredients, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      dish.id,
      dish.familyId,
      dish.name,
      dish.emoji,
      dish.category,
      dish.note || '',
      JSON.stringify(dish.ingredients || []),
      dish.createdBy,
      dish.createdAt,
    ],
  )
}

function mapUser(row) {
  if (!row) return null
  return {
    openid: row.openid,
    nickname: row.nickname,
    emoji: row.emoji,
    familyId: row.family_id,
    profileReady: !!row.profile_ready,
    createdAt: Number(row.created_at),
  }
}

function mapFamily(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    ownerOpenid: row.owner_openid,
    createdAt: Number(row.created_at),
  }
}

function mapDish(row) {
  if (!row) return null
  let ingredients = []
  try {
    ingredients = typeof row.ingredients === 'string' ? JSON.parse(row.ingredients) : row.ingredients
  } catch {
    ingredients = []
  }
  return {
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    emoji: row.emoji,
    category: row.category,
    note: row.note || '',
    ingredients: Array.isArray(ingredients) ? ingredients : [],
    createdBy: row.created_by,
    createdAt: Number(row.created_at),
  }
}

function mapOrder(row) {
  if (!row) return null
  return {
    id: row.id,
    familyId: row.family_id,
    date: row.order_date,
    meal: row.meal,
    dishId: row.dish_id,
    openid: row.openid,
    note: row.note || '',
    createdAt: Number(row.created_at),
  }
}

function mapPlan(row) {
  if (!row) return null
  return {
    id: row.id,
    familyId: row.family_id,
    date: row.plan_date,
    meal: row.meal,
    cookOpenid: row.cook_openid,
  }
}
