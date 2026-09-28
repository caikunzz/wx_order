export function ok(res, data) {
  res.json({ ok: true, data })
}

export function fail(res, status, message) {
  res.status(status).json({ ok: false, message })
}

export function wrap(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export const MEALS = ['breakfast', 'lunch', 'dinner']

export function clip(value, max) {
  return String(value || '').trim().slice(0, max)
}
