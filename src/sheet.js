const MS = 86_400_000

const UI = {
  en: {
    tag: 'en',
    calendar: 'gregory',
    dir: 'ltr',
    label: 'EN',
    employee: 'Employee',
    startHour: 'Start hour',
    undo: 'Undo',
    month: 'Month',
    year: 'Year',
    firstDay: 'First day',
    locale: 'Locale',
    print: 'Print',
    save: 'Save',
    load: 'Load',
    clear: 'Clear',
    clearConfirm: 'Clear all timesheet data?',
    totalExtra: 'Total extra',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    cols: ['date', 'start', 'end', 'extra'],
  },
  fa: {
    tag: 'fa-IR',
    calendar: 'persian',
    dir: 'rtl',
    label: 'فا',
    employee: 'کارمند',
    startHour: 'ساعت شروع',
    undo: 'بازگشت',
    month: 'ماه',
    year: 'سال',
    firstDay: 'روز اول',
    locale: 'زبان',
    print: 'چاپ',
    save: 'ذخیره',
    load: 'بارگذاری',
    clear: 'پاک کردن',
    clearConfirm: 'همه داده‌های برگه زمان پاک شود؟',
    totalExtra: 'جمع اضافه',
    theme: 'نما',
    light: 'روشن',
    dark: 'تیره',
    cols: ['تاریخ', 'شروع', 'پایان', 'اضافه'],
  },
}

export const LOCALES = UI

export const readCal = (date, calendar) => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    calendar,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
  return Object.fromEntries(
    fmt.formatToParts(date)
      .filter((p) => p.type === 'year' || p.type === 'month' || p.type === 'day')
      .map((p) => [p.type, +p.value]),
  )
}

/** Date at calendar Y / month (0-based) / day. */
export const dateAt = (year, month, day, calendar) => {
  if (calendar === 'gregory') return new Date(year, month, day)
  const want = month + 1
  let lo = +new Date(year + 620, 11, 1)
  let hi = +new Date(year + 623, 2, 1)
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2 / MS) * MS
    const p = readCal(new Date(mid), calendar)
    const cmp = p.year !== year ? p.year - year
      : p.month !== want ? p.month - want
      : p.day - day
    if (cmp === 0) return new Date(mid)
    if (cmp < 0) lo = mid + MS
    else hi = mid - MS
  }
  return new Date(lo)
}

export const daysInMonth = (year, month, calendar) => {
  const start = dateAt(year, month, 1, calendar)
  const nextMonth = (month + 1) % 12
  const nextYear = month === 11 ? year + 1 : year
  const end = dateAt(nextYear, nextMonth, 1, calendar)
  return Math.round((end - start) / MS)
}

export const autoFirstWeekday = (year, month, calendar) =>
  dateAt(year, month, 1, calendar).getDay()

const monthsOf = (tag, calendar) => {
  const sample = calendar === 'persian' ? 1400 : 2000
  return Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat(tag, { month: 'long', calendar })
      .format(dateAt(sample, month, 1, calendar)))
}

/** Sun..Sat via a known Sunday (1970-01-04). */
const weekdaysOf = (tag) =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(tag, { weekday: 'short' })
      .format(new Date(1970, 0, 4 + i)))

export const localeOf = (id) => {
  const base = UI[id] ?? UI.en
  const { tag, calendar } = base
  const num = new Intl.NumberFormat(tag, { useGrouping: false })
  return {
    ...base,
    months: monthsOf(tag, calendar),
    weekdays: weekdaysOf(tag),
    digit: (n) => num.format(n),
  }
}

export const todayParts = (calendar) => {
  const p = readCal(new Date(), calendar)
  return { year: p.year, month: p.month - 1 }
}

export const buildDays = (year, month, firstWeekday, weekdays, calendar) =>
  Array.from({ length: daysInMonth(year, month, calendar) }, (_, i) => ({
    day: i + 1,
    weekday: weekdays[(firstWeekday + i) % 7],
  }))

/** Right bank = first half, left bank = second half (RTL table). */
export const splitRows = (days) => {
  const mid = Math.ceil(days.length / 2)
  const right = days.slice(0, mid)
  const left = days.slice(mid)
  return right.map((r, i) => ({ right: r, left: left[i] ?? null }))
}

/** Parse H:MM, H.MM, or bare minutes → signed total minutes. */
export const parseHm = (str) => {
  const s = String(str ?? '')
    .trim()
    .replace(/\u200e|\u200f|\ufeff/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
  if (!s) return null
  const sign = s.startsWith('-') ? -1 : 1
  const body = s.replace(/^[+-]/, '')
  if (!body) return null
  const hm = body.match(/^(\d{1,3})[:.](\d{1,2})(?::\d{1,2})?$/)
  if (hm) {
    const h = +hm[1]
    const m = +hm[2]
    return m < 60 ? sign * (h * 60 + m) : null
  }
  if (/^\d{1,4}$/.test(body)) return sign * +body
  return null
}

/** Minutes → ASCII H:MM (optional leading -). */
export const formatHm = (minutes) => {
  const n = Math.round(+minutes || 0)
  const abs = Math.abs(n)
  const body = `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
  return n < 0 ? `-${body}` : body
}

const HM = '00:00'
const hmSelect = (el, minutes = false) =>
  el.setSelectionRange(minutes ? 3 : 0, minutes ? 5 : 2)

/** Minutes → zero-padded ASCII HH:MM. */
export const formatHmPad = (minutes) => {
  const n = Math.round(+minutes || 0)
  const abs = Math.abs(n)
  const body = `${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
  return n < 0 ? `-${body}` : body
}

const hmValue = (value) => {
  if (value === '-') return value
  const minutes = parseHm(value)
  return minutes == null || minutes < 0 || minutes > 5999
    ? ''
    : formatHmPad(minutes)
}

/** Bind segmented HH:MM editing with `-` as an off-day marker. */
export const bindHmInput = (el, { onChange, onBlur, blank = false } = {}) => {
  const change = () => onChange?.()
  const select = (minutes) => hmSelect(el, minutes)
  const empty = () => !el.value.trim()

  el.maxLength = 5
  el.onfocus = () => {
    el.value = hmValue(el.value)
    if (blank && empty()) return
    if (!el.value) el.value = HM
    el.value === '-' ? el.select() : select(false)
  }
  el.onclick = () => {
    if (blank && empty()) return
    const minutes = (el.selectionStart ?? 0) >= 3
    setTimeout(() => el.value === '-' ? el.select() : select(minutes))
  }
  el.onkeydown = (event) => {
    if (event.key === '-') {
      event.preventDefault()
      el.value = '-'
      el.select()
      change()
      return
    }
    if (/^\d$/.test(event.key)) {
      event.preventDefault()
      const wasDash = el.value === '-'
      if (!/^\d{2}:\d{2}$/.test(el.value)) {
        el.value = HM
        select(false)
      }
      const start = el.selectionStart ?? 0
      const pos = wasDash
        ? 1
        : start < 3 ? Math.min(start, 1) : Math.min(Math.max(start, 3), 4)
      el.value = `${el.value.slice(0, pos)}${event.key}${el.value.slice(pos + 1)}`
      if (wasDash || pos === 1) select(true)
      else el.setSelectionRange(pos + 1, pos + 1)
      change()
      return
    }
    if (event.key === 'Tab' && el.value !== '-') {
      if (blank && empty()) return
      const minutes = (el.selectionStart ?? 0) >= 3
      if ((!event.shiftKey && minutes) || (event.shiftKey && !minutes)) return
      event.preventDefault()
      event.stopPropagation()
      select(!event.shiftKey)
      return
    }
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      && el.value !== '-') {
      if (blank && empty()) return
      event.preventDefault()
      select(event.key === 'ArrowRight')
      return
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      if (blank && empty()) return
      event.preventDefault()
      if (el.value === '-') {
        el.value = ''
        change()
        return
      }
      const start = el.selectionStart ?? 0
      const end = el.selectionEnd ?? start
      const at = event.key === 'Backspace' && start === end ? start - 1 : start
      const positions = [0, 1, 3, 4].filter((pos) =>
        start === end ? pos === Math.max(0, at) : pos >= start && pos < end)
      el.value = [...el.value]
        .map((char, pos) => positions.includes(pos) ? '0' : char)
        .join('')
      select(start >= 3)
      change()
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
    }
  }
  el.onblur = () => {
    el.value = hmValue(el.value)
    change()
    onBlur?.()
  }
}
