export function presentUser(user, family) {
  if (!user) return null
  return {
    openid: user.openid,
    nickname: user.nickname,
    emoji: user.emoji,
    familyId: user.familyId || null,
    profileReady: !!user.profileReady,
    isOwner: !!(family && family.ownerOpenid === user.openid),
  }
}

export function presentFamily(family) {
  if (!family) return null
  return {
    id: family.id,
    name: family.name,
    inviteCode: family.inviteCode,
    ownerOpenid: family.ownerOpenid,
  }
}

export function presentDish(dish) {
  return {
    id: dish.id,
    name: dish.name,
    emoji: dish.emoji,
    category: dish.category,
    note: dish.note || '',
    ingredients: Array.isArray(dish.ingredients) ? dish.ingredients : [],
    createdAt: dish.createdAt,
  }
}

export function presentMember(user) {
  return {
    openid: user.openid,
    nickname: user.nickname,
    emoji: user.emoji,
  }
}
