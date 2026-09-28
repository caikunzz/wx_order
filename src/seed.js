export const CATEGORIES = ['荤菜', '素菜', '汤品', '主食']

export const SEED_DISHES = [
  {
    name: '番茄炒蛋',
    emoji: '🍅',
    category: '荤菜',
    note: '蛋液先炒盛出，番茄出汁后再回锅',
    ingredients: [
      { name: '番茄', amount: '2个' },
      { name: '鸡蛋', amount: '3个' },
      { name: '小葱', amount: '2根' },
    ],
  },
  {
    name: '红烧肉',
    emoji: '🥩',
    category: '荤菜',
    note: '冰糖炒色，小火焖 40 分钟',
    ingredients: [
      { name: '五花肉', amount: '500g' },
      { name: '冰糖', amount: '20g' },
      { name: '生抽', amount: '2勺' },
      { name: '老抽', amount: '1勺' },
      { name: '姜', amount: '4片' },
    ],
  },
  {
    name: '宫保鸡丁',
    emoji: '🍗',
    category: '荤菜',
    note: '',
    ingredients: [
      { name: '鸡腿肉', amount: '300g' },
      { name: '花生米', amount: '30g' },
      { name: '干辣椒', amount: '8个' },
      { name: '黄瓜', amount: '半根' },
    ],
  },
  {
    name: '清炒西兰花',
    emoji: '🥦',
    category: '素菜',
    note: '',
    ingredients: [
      { name: '西兰花', amount: '1颗' },
      { name: '蒜', amount: '3瓣' },
    ],
  },
  {
    name: '酸辣土豆丝',
    emoji: '🥔',
    category: '素菜',
    note: '土豆丝泡水去淀粉',
    ingredients: [
      { name: '土豆', amount: '2个' },
      { name: '干辣椒', amount: '4个' },
      { name: '醋', amount: '1勺' },
    ],
  },
  {
    name: '蒜蓉菠菜',
    emoji: '🥬',
    category: '素菜',
    note: '',
    ingredients: [
      { name: '菠菜', amount: '300g' },
      { name: '蒜', amount: '4瓣' },
    ],
  },
  {
    name: '紫菜蛋花汤',
    emoji: '🥣',
    category: '汤品',
    note: '',
    ingredients: [
      { name: '紫菜', amount: '1小把' },
      { name: '鸡蛋', amount: '1个' },
      { name: '香油', amount: '几滴' },
    ],
  },
  {
    name: '冬瓜排骨汤',
    emoji: '🍲',
    category: '汤品',
    note: '',
    ingredients: [
      { name: '排骨', amount: '400g' },
      { name: '冬瓜', amount: '400g' },
      { name: '姜', amount: '3片' },
    ],
  },
  {
    name: '米饭',
    emoji: '🍚',
    category: '主食',
    note: '',
    ingredients: [{ name: '大米', amount: '2杯' }],
  },
  {
    name: '葱油拌面',
    emoji: '🍜',
    category: '主食',
    note: '',
    ingredients: [
      { name: '挂面', amount: '2人份' },
      { name: '小葱', amount: '1把' },
      { name: '生抽', amount: '2勺' },
    ],
  },
]

export function buildSeedDishes(familyId, openid, createId, now = Date.now()) {
  return SEED_DISHES.map((dish, index) => ({
    id: createId(),
    familyId,
    name: dish.name,
    emoji: dish.emoji,
    category: dish.category,
    note: dish.note,
    ingredients: dish.ingredients.map((item) => ({ ...item })),
    createdBy: openid,
    createdAt: now - index,
  }))
}
