import './style.css'
import {
  LOCALES,
  localeOf,
  autoFirstWeekday,
  buildDays,
  splitRows,
  todayParts,
  dateAt,
  readCal,
  parseHm,
  formatHm,
  formatHmPad,
  bindHmInput,
} from './sheet.js'

const configKey = 'timesheet:config'
const viewId = ({ year, month }) => `${year}-${month}`

const systemTheme = () =>
  matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'

const sheetField = /^(start|end|extra|notes)-(\d+)$/

const dumpSheet = (root) =>
  Object.fromEntries(
    [...root.querySelectorAll('input[name]')]
      .filter((el) => sheetField.test(el.name))
      .map((el) => [el.name, el.value]),
  )

const cleanSheet = (sheet) =>
  Object.fromEntries(
    Object.entries(sheet).filter(([key, value]) => value && sheetField.test(key)),
  )

const defaultConfig = (locale = 'en') => ({
  locale,
  theme: systemTheme(),
  employee: '',
  ...todayParts(localeOf(locale).calendar),
  firstDays: {},
  sheet: {},
})

const normalizeConfig = (data = {}) => {
  const locale = LOCALES[data.locale] ? data.locale : 'en'
  const base = defaultConfig(locale)
  return {
    locale,
    theme: data.theme === 'dark' || data.theme === 'light' ? data.theme : base.theme,
    employee: String(data.employee ?? ''),
    year: Number.isInteger(data.year) ? data.year : base.year,
    month: Number.isInteger(data.month) ? data.month : base.month,
    firstDays: data.firstDays && typeof data.firstDays === 'object'
      ? Object.fromEntries(
        Object.entries(data.firstDays).filter(([, day]) =>
          Number.isInteger(day) && day >= 0 && day <= 6))
      : {},
    sheet: data.sheet && typeof data.sheet === 'object'
      ? cleanSheet(data.sheet)
      : {},
  }
}

const saveConfig = (value) =>
  localStorage.setItem(configKey, JSON.stringify(value))

const legacyConfig = (source) => {
  const keys = Object.keys(source)
  const get = (key) => source.getItem?.(key) ?? source[key]
  const locale = LOCALES[get('timesheet:locale')] ? get('timesheet:locale') : 'en'
  const calendar = localeOf(locale).calendar
  const view = JSON.parse(get(`timesheet:view:${calendar}`) ?? 'null')
    ?? todayParts(calendar)
  const sheetKey = `timesheet:sheet:${calendar}`
  const current = `${sheetKey}:${view.year}-${view.month}`
  const savedSheet = get(sheetKey)
  const sheet = savedSheet == null
    ? keys
      .filter((key) => key.startsWith(`${sheetKey}:`))
      .sort((a, b) =>
        Number(a === current) - Number(b === current) || a.localeCompare(b))
      .reduce((all, key) => ({ ...all, ...JSON.parse(get(key)) }), {})
    : JSON.parse(savedSheet)
  const firstPrefix = `timesheet:firstDay:${calendar}:`
  const firstDays = Object.fromEntries(
    keys
      .filter((key) => key.startsWith(firstPrefix))
      .map((key) => [key.slice(firstPrefix.length), +get(key)]),
  )
  return normalizeConfig({
    locale,
    theme: get('timesheet:theme'),
    employee: get('timesheet:employee'),
    ...view,
    firstDays,
    sheet,
  })
}

const loadConfig = () => {
  const saved = localStorage.getItem(configKey)
  if (saved != null) return normalizeConfig(JSON.parse(saved))
  const value = legacyConfig(localStorage)
  saveConfig(value)
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('timesheet:') && key !== configKey) localStorage.removeItem(key)
  }
  return value
}

const config = loadConfig()
let sheetUndo = null

const applyStartHour = (hour) => {
  const mins = parseHm(hour)
  if (mins == null || mins < 0) return

  const sheet = document.querySelector('#app .sheet')
  if (!sheet) return

  const current = cleanSheet({ ...config.sheet, ...dumpSheet(sheet) })
  const next = formatHmPad(mins)
  const updated = { ...current }
  let changed = false

  for (const el of sheet.querySelectorAll('input[name^="start-"]')) {
    if (el.value === '-' || el.value === next) continue
    updated[el.name] = next
    changed = true
  }
  if (!changed) return

  sheetUndo = current
  setConfig({ sheet: cleanSheet(updated) })
}

const applyConfig = () => {
  const { tag, dir } = localeOf(config.locale)
  document.documentElement.lang = tag
  document.documentElement.dir = dir
  document.documentElement.dataset.theme = config.theme
}

const firstWeekday = () =>
  config.firstDays[viewId(config)]
  ?? autoFirstWeekday(config.year, config.month, localeOf(config.locale).calendar)

const bankCells = (day, t) => day
  ? `<td class="date">${t.digit(day.day)} <span>${day.weekday}</span></td>
     <td><input type="text" name="start-${day.day}" autocomplete="off" maxlength="5" dir="ltr"></td>
     <td><input type="text" name="end-${day.day}" autocomplete="off" maxlength="5" dir="ltr"></td>
     <td><input type="text" name="extra-${day.day}" autocomplete="off" maxlength="6" dir="ltr"></td>
     <td><input type="text" name="notes-${day.day}" autocomplete="off"></td>`
  : `<td class="date pad"></td><td class="pad"></td><td class="pad"></td><td class="pad"></td><td class="pad"></td>`

const bankHead = (t) => t.cols.map((c) => `<th>${c}</th>`).join('')

const showHm = (minutes, digit) =>
  formatHm(minutes).replace(/\d/g, (d) => digit(+d))

const fieldRank = { start: 0, end: 1, extra: 2, notes: 3 }

const dayInputs = (sheet) =>
  [...sheet.querySelectorAll(
    'input[name^="start-"], input[name^="end-"], input[name^="extra-"], input[name^="notes-"]',
  )].sort((a, b) => {
    const pa = a.name.match(sheetField)
    const pb = b.name.match(sheetField)
    return +pa[2] - +pb[2] || fieldRank[pa[1]] - fieldRank[pb[1]]
  })

const persistSheet = () => {
  const sheet = document.querySelector('#app .sheet')
  if (!sheet) return
  setConfig(
    { sheet: cleanSheet({ ...config.sheet, ...dumpSheet(sheet) }) },
    { render: false },
  )
}

const nospace = (s) => String(s).replace(/\s+/g, '')

const dateStamp = (year, month) => {
  const yy = String(year).slice(-2)
  const mm = String(month + 1).padStart(2, '0')
  return `${yy}-${mm}-01`
}

const backupName = (name, year, month) =>
  `${nospace(name) || 'timesheet'}_${dateStamp(year, month)}.json`

const downloadJson = (filename, data) => {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: filename }).click()
  URL.revokeObjectURL(url)
}

const importConfig = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return Object.keys(data).some((key) => key.startsWith('timesheet:'))
    ? legacyConfig(data)
    : normalizeConfig(data)
}

const setConfig = (
  patch,
  { render: shouldRender = true, convertLocale = true } = {},
) => {
  const previous = { ...config }
  const next = { ...config, ...patch }
  if (convertLocale && patch.locale && patch.locale !== previous.locale) {
    const from = localeOf(previous.locale).calendar
    const to = localeOf(patch.locale).calendar
    const date = dateAt(previous.year, previous.month, 1, from)
    const { year, month } = readCal(date, to)
    Object.assign(next, { year, month: month - 1 })
  }
  Object.assign(config, normalizeConfig(next))
  saveConfig(config)
  applyConfig()
  if (shouldRender) render()
  return config
}

applyConfig()

const render = () => {
  const t = localeOf(config.locale)
  const first = firstWeekday()

  const years = Array.from({ length: 11 }, (_, i) => config.year - 5 + i)
  const rows = splitRows(
    buildDays(config.year, config.month, first, t.weekdays, t.calendar),
  )
  const app = document.querySelector('#app')
  app.innerHTML = `
<header class="bar no-print">
  <label>${t.employee} <input type="text" name="employee" autocomplete="name"></label>
  <label>${t.startHour} <input type="text" name="startHour" autocomplete="off" maxlength="5" dir="ltr"></label>
  <button type="button" class="tool" name="undo" ${sheetUndo ? '' : 'hidden'}>${t.undo}</button>
  <label>${t.month}
    <select name="month">${t.months.map((name, i) =>
      `<option value="${i}" ${i === config.month ? 'selected' : ''}>${name}</option>`).join('')}</select>
  </label>
  <label>${t.year}
    <select name="year">${years.map((y) =>
      `<option value="${y}" ${y === config.year ? 'selected' : ''}>${t.digit(y)}</option>`).join('')}</select>
  </label>
  <label>${t.locale}
    <select name="locale">${Object.entries(LOCALES).map(([id, loc]) =>
      `<option value="${id}" ${id === config.locale ? 'selected' : ''}>${loc.label}</option>`).join('')}</select>
  </label>
  <label>${t.theme}
    <select name="theme">
      <option value="light" ${config.theme === 'light' ? 'selected' : ''}>${t.light}</option>
      <option value="dark" ${config.theme === 'dark' ? 'selected' : ''}>${t.dark}</option>
    </select>
  </label>
  <fieldset class="first">
    <legend>${t.firstDay}</legend>
    <div class="days">
      ${t.weekdays.map((name, i) =>
        `<button type="button" data-day="${i}" class="${i === first ? 'on' : ''}">${name}</button>`).join('')}
    </div>
  </fieldset>
  <button type="button" class="tool" name="save">${t.save}</button>
  <button type="button" class="tool" name="load">${t.load}</button>
  <button type="button" class="tool" name="clear">${t.clear}</button>
  <button type="button" class="print" name="print">${t.print}</button>
  <input type="file" name="load-file" accept="application/json,.json" hidden>
</header>
<p class="print-only meta"></p>
<table dir="rtl" class="sheet">
  <thead>
    <tr>${bankHead(t)}${bankHead(t)}</tr>
  </thead>
  <tbody>
    ${rows.map(({ right, left }) =>
      `<tr>${bankCells(right, t)}${bankCells(left, t)}</tr>`).join('')}
  </tbody>
</table>
<p class="totals"><span>${t.totalExtra}</span> <strong name="extra-total">${showHm(0, t.digit)}</strong></p>`

  const emp = app.querySelector('[name=employee]')
  const startHourEl = app.querySelector('[name=startHour]')
  const undoBtn = app.querySelector('[name=undo]')
  const meta = app.querySelector('.meta')
  const totalEl = app.querySelector('[name=extra-total]')
  const sheet = app.querySelector('.sheet')
  const extras = [...app.querySelectorAll('input[name^=extra-]')]
  const inputs = dayInputs(sheet)

  for (const [name, value] of Object.entries(config.sheet)) {
    const el = sheet.querySelector(`[name="${name}"]`)
    if (el) el.value = value
  }

  const syncTotal = () => {
    const mins = extras.reduce((sum, el) => sum + (parseHm(el.value) ?? 0), 0)
    totalEl.textContent = showHm(mins, t.digit)
  }

  const syncMeta = () => {
    const item = (label, value) => {
      const span = document.createElement('span')
      span.append(`${label}: `)
      span.append(Object.assign(document.createElement('strong'), { textContent: value }))
      return span
    }
    meta.replaceChildren(
      item(t.employee, config.employee),
      item(t.month, t.months[config.month]),
      item(t.year, t.digit(config.year)),
    )
  }

  const saveFields = () => persistSheet()

  emp.value = config.employee
  emp.onclick = () => {
    if (emp.value) emp.select()
  }
  emp.oninput = (e) => {
    setConfig({ employee: e.target.value }, { render: false })
    syncMeta()
  }

  bindHmInput(startHourEl, {
    blank: true,
    onBlur: () => applyStartHour(startHourEl.value),
  })

  undoBtn.onclick = () => {
    if (!sheetUndo) return
    const snapshot = sheetUndo
    sheetUndo = null
    setConfig({ sheet: cleanSheet(snapshot) })
  }

  syncMeta()
  syncTotal()
  window.onbeforeprint = () => {
    syncMeta()
    syncTotal()
  }

  sheet.onkeydown = (e) => {
    if (e.key !== 'Tab' || !e.target.matches('input[name]')) return
    const i = inputs.indexOf(e.target)
    if (i < 0) return
    const next = e.shiftKey ? i - 1 : i + 1
    if (next < 0 || next >= inputs.length) return
    e.preventDefault()
    inputs[next].focus()
  }

  for (const el of inputs) {
    if (el.name.startsWith('notes-')) {
      el.oninput = saveFields
      continue
    }
    bindHmInput(el, {
      signed: el.name.startsWith('extra-'),
      onChange: () => {
        if (el.name.startsWith('extra-')) syncTotal()
        saveFields()
      },
    })
  }

  app.querySelector('[name=month]').onchange = (e) => {
    persistSheet()
    setConfig({ month: +e.target.value })
  }

  app.querySelector('[name=year]').onchange = (e) => {
    persistSheet()
    setConfig({ year: +e.target.value })
  }

  app.querySelector('[name=locale]').onchange = (e) => {
    persistSheet()
    setConfig({ locale: e.target.value })
  }

  app.querySelector('[name=theme]').onchange = (e) => {
    setConfig({ theme: e.target.value }, { render: false })
  }

  app.querySelector('.first').onclick = (e) => {
    const btn = e.target.closest('[data-day]')
    if (!btn) return
    persistSheet()
    setConfig({
      firstDays: {
        ...config.firstDays,
        [viewId(config)]: +btn.dataset.day,
      },
    })
  }

  app.querySelector('[name=print]').onclick = () => window.print()

  app.querySelector('[name=save]').onclick = () => {
    persistSheet()
    const name = prompt('Name')
    if (name == null) return
    downloadJson(backupName(name, config.year, config.month), config)
  }

  app.querySelector('[name=clear]').onclick = () => {
    if (!confirm(t.clearConfirm)) return
    for (const el of sheet.querySelectorAll('input[name]')) el.value = ''
    emp.value = ''
    sheetUndo = null
    setConfig({ employee: '', sheet: {} }, { render: false })
    syncMeta()
    syncTotal()
  }

  const fileInput = app.querySelector('[name=load-file]')
  app.querySelector('[name=load]').onclick = () => fileInput.click()
  fileInput.onchange = () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    file.text().then((text) => {
      const data = JSON.parse(text)
      const imported = importConfig(data)
      if (!imported) return
      sheetUndo = null
      setConfig(imported, { convertLocale: false })
    }).catch(() => {})
  }
}

render()
