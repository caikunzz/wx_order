import { JsonStore } from './json.js'
import { MysqlStore } from './mysql.js'

let store

export async function initStore() {
  if (process.env.MYSQL_ADDRESS) {
    store = new MysqlStore()
    await store.init()
    console.log('[wx-order] 使用 MySQL')
  } else {
    store = new JsonStore()
    await store.init()
    console.log('[wx-order] 使用本地 JSON 数据文件')
  }
  return store
}

export function db() {
  if (!store) throw new Error('存储还没有初始化')
  return store
}
