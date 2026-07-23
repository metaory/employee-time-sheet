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
} from './sheet.js'

const firstKey = (cal, y, m) => `timesheet:firstDay:${cal}:${y}-${m}`
const sheetKey = (cal, y, m) => `timesheet:sheet:${cal}:${y}-${m}`
const viewKey = (cal) => `timesheet:view:${cal}`
const localeKey = 'timesheet:locale'
const themeKey = 'timesheet:theme'
const employeeKey = 'timesheet:employee'

const loadFirst = (cal, y, m) => {
  const saved = localStorage.getItem(firstKey(cal, y, m))
  return saved == null ? autoFirstWeekday(y, m, cal) : +saved
}

const saveFirst = (cal, y, m, day) =>
  localStorage.setItem(firstKey(cal, y, m), String(day))

const loadLocale = () => {
  const saved = localStorage.getItem(localeKey)
  return LOCALES[saved] ? saved : 'en'
}

const loadTheme = () =>
  localStorage.getItem(themeKey) === 'dark' ? 'dark' : 'light'

const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme
}

const dumpSheet = (root) =>
  Object.fromEntries(
    [...root.querySelectorAll('input[name]')].flatMap((el) =>
      el.value ? [[el.name, el.value]] : []),
  )

const readSheet = (cal, y, m) =>
  JSON.parse(localStorage.getItem(sheetKey(cal, y, m)) ?? '{}')

const writeSheet = (cal, y, m, data) => {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v))
  const key = sheetKey(cal, y, m)
  if (Object.keys(clean).length) localStorage.setItem(key, JSON.stringify(clean))
  else localStorage.removeItem(key)
}

const saveView = (cal, year, month) =>
  localStorage.setItem(viewKey(cal), JSON.stringify({ year, month }))

const loadView = (cal) => {
  const { year, month } = JSON.parse(localStorage.getItem(viewKey(cal)) ?? 'null') ?? {}
  return Number.isInteger(year) && Number.isInteger(month) ? { year, month } : null
}

applyTheme(loadTheme())

const boot = localeOf(loadLocale())
const today = todayParts(boot.calendar)
const view = loadView(boot.calendar) ?? today

const state = {
  employee: localStorage.getItem(employeeKey) ?? '',
  year: view.year,
  month: view.month,
  firstWeekday: loadFirst(boot.calendar, view.year, view.month),
  locale: loadLocale(),
  theme: loadTheme(),
}

const bankCells = (day, t) => day
  ? `<td class="date">${t.digit(day.day)} <span>${day.weekday}</span></td>
     <td><input type="text" name="start-${day.day}" autocomplete="off" dir="ltr"></td>
     <td><input type="text" name="end-${day.day}" autocomplete="off" dir="ltr"></td>
     <td><input type="text" name="extra-${day.day}" autocomplete="off" dir="ltr"></td>`
  : `<td class="date pad"></td><td class="pad"></td><td class="pad"></td><td class="pad"></td>`

const bankHead = (t) => t.cols.map((c) => `<th>${c}</th>`).join('')

const showHm = (minutes, digit) =>
  formatHm(minutes).replace(/\d/g, (d) => digit(+d))

const fieldRank = { start: 0, end: 1, extra: 2 }

const dayInputs = (sheet) =>
  [...sheet.querySelectorAll('input[name]')].sort((a, b) => {
    const pa = a.name.match(/^(start|end|extra)-(\d+)$/)
    const pb = b.name.match(/^(start|end|extra)-(\d+)$/)
    return +pa[2] - +pb[2] || fieldRank[pa[1]] - fieldRank[pb[1]]
  })

const persistSheet = (calendar, year, month) => {
  const sheet = document.querySelector('#app .sheet')
  if (sheet) writeSheet(calendar, year, month, dumpSheet(sheet))
}

const nospace = (s) => String(s).replace(/\s+/g, '')

const backupName = (employee, monthName, year) => {
  const stem = [nospace(employee), `${nospace(monthName)}${nospace(year)}`]
    .filter(Boolean)
    .join('_')
  return `${stem || 'timesheet'}.json`
}

const dumpStorage = () =>
  Object.fromEntries(
    Object.keys(localStorage)
      .filter((k) => k.startsWith('timesheet:'))
      .map((k) => [k, localStorage.getItem(k)]))

const clearTimesheetStorage = () => {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith('timesheet:')) localStorage.removeItem(k)
  }
}

const restoreStorage = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  clearTimesheetStorage()
  for (const [k, v] of Object.entries(data)) {
    if (!k.startsWith('timesheet:')) continue
    localStorage.setItem(k, v == null ? '' : String(v))
  }
  return true
}

const downloadJson = (filename, data) => {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: filename }).click()
  URL.revokeObjectURL(url)
}

const syncStateFromStorage = () => {
  state.locale = loadLocale()
  state.theme = loadTheme()
  state.employee = localStorage.getItem(employeeKey) ?? ''
  const cal = localeOf(state.locale).calendar
  const view = loadView(cal) ?? todayParts(cal)
  state.year = view.year
  state.month = view.month
  state.firstWeekday = loadFirst(cal, state.year, state.month)
  applyTheme(state.theme)
}

const render = () => {
  const t = localeOf(state.locale)
  document.documentElement.lang = t.tag
  document.documentElement.dir = t.dir
  saveView(t.calendar, state.year, state.month)

  const years = Array.from({ length: 11 }, (_, i) => state.year - 5 + i)
  const rows = splitRows(
    buildDays(state.year, state.month, state.firstWeekday, t.weekdays, t.calendar),
  )
  const app = document.querySelector('#app')
  app.innerHTML = `
<header class="bar no-print">
  <label>${t.employee} <input type="text" name="employee" autocomplete="name"></label>
  <label>${t.month}
    <select name="month">${t.months.map((name, i) =>
      `<option value="${i}" ${i === state.month ? 'selected' : ''}>${name}</option>`).join('')}</select>
  </label>
  <label>${t.year}
    <select name="year">${years.map((y) =>
      `<option value="${y}" ${y === state.year ? 'selected' : ''}>${t.digit(y)}</option>`).join('')}</select>
  </label>
  <label>${t.locale}
    <select name="locale">${Object.entries(LOCALES).map(([id, loc]) =>
      `<option value="${id}" ${id === state.locale ? 'selected' : ''}>${loc.label}</option>`).join('')}</select>
  </label>
  <label>${t.theme}
    <select name="theme">
      <option value="light" ${state.theme === 'light' ? 'selected' : ''}>${t.light}</option>
      <option value="dark" ${state.theme === 'dark' ? 'selected' : ''}>${t.dark}</option>
    </select>
  </label>
  <fieldset class="first">
    <legend>${t.firstDay}</legend>
    ${t.weekdays.map((name, i) =>
      `<button type="button" data-day="${i}" class="${i === state.firstWeekday ? 'on' : ''}">${name}</button>`).join('')}
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
  const meta = app.querySelector('.meta')
  const totalEl = app.querySelector('[name=extra-total]')
  const sheet = app.querySelector('.sheet')
  const extras = [...app.querySelectorAll('input[name^=extra-]')]
  const inputs = dayInputs(sheet)

  const saved = readSheet(t.calendar, state.year, state.month)
  for (const [name, value] of Object.entries(saved)) {
    const el = sheet.querySelector(`[name="${name}"]`)
    if (el) el.value = value
  }

  const syncTotal = () => {
    const mins = extras.reduce((sum, el) => sum + (parseHm(el.value) ?? 0), 0)
    totalEl.textContent = showHm(mins, t.digit)
  }

  const syncMeta = () => {
    meta.textContent = [state.employee, `${t.months[state.month]} ${t.digit(state.year)}`]
      .filter(Boolean)
      .join(' · ')
  }

  const saveFields = () =>
    writeSheet(t.calendar, state.year, state.month, dumpSheet(sheet))

  emp.value = state.employee
  emp.oninput = (e) => {
    state.employee = e.target.value
    localStorage.setItem(employeeKey, state.employee)
    syncMeta()
  }
  syncMeta()
  syncTotal()

  sheet.onkeydown = (e) => {
    if (e.key !== 'Tab' || !e.target.matches('input[name]')) return
    const i = inputs.indexOf(e.target)
    if (i < 0) return
    const next = e.shiftKey ? i - 1 : i + 1
    if (next < 0 || next >= inputs.length) return
    e.preventDefault()
    inputs[next].focus()
  }

  sheet.oninput = (e) => {
    if (!e.target.matches('input[name]')) return
    if (e.target.matches('input[name^=extra-]')) syncTotal()
    saveFields()
  }

  sheet.onchange = (e) => {
    if (!e.target.matches('input[name^=extra-]')) return
    syncTotal()
    saveFields()
  }

  sheet.onfocusout = (e) => {
    if (!e.target.matches('input[name^=extra-]')) return
    const mins = parseHm(e.target.value)
    if (mins == null) {
      if (e.target.value.trim()) e.target.value = ''
      syncTotal()
      saveFields()
      return
    }
    e.target.value = formatHm(mins)
    syncTotal()
    saveFields()
  }

  app.querySelector('[name=month]').onchange = (e) => {
    persistSheet(t.calendar, state.year, state.month)
    state.month = +e.target.value
    state.firstWeekday = loadFirst(t.calendar, state.year, state.month)
    render()
  }

  app.querySelector('[name=year]').onchange = (e) => {
    persistSheet(t.calendar, state.year, state.month)
    state.year = +e.target.value
    state.firstWeekday = loadFirst(t.calendar, state.year, state.month)
    render()
  }

  app.querySelector('[name=locale]').onchange = (e) => {
    persistSheet(t.calendar, state.year, state.month)
    const next = localeOf(e.target.value)
    const d = dateAt(state.year, state.month, 1, t.calendar)
    const p = readCal(d, next.calendar)
    state.locale = e.target.value
    state.year = p.year
    state.month = p.month - 1
    state.firstWeekday = loadFirst(next.calendar, state.year, state.month)
    localStorage.setItem(localeKey, state.locale)
    render()
  }

  app.querySelector('[name=theme]').onchange = (e) => {
    state.theme = e.target.value
    localStorage.setItem(themeKey, state.theme)
    applyTheme(state.theme)
  }

  app.querySelector('.first').onclick = (e) => {
    const btn = e.target.closest('[data-day]')
    if (!btn) return
    persistSheet(t.calendar, state.year, state.month)
    state.firstWeekday = +btn.dataset.day
    saveFirst(t.calendar, state.year, state.month, state.firstWeekday)
    render()
  }

  app.querySelector('[name=print]').onclick = () => {
    syncMeta()
    syncTotal()
    print()
  }

  app.querySelector('[name=save]').onclick = () => {
    state.employee = emp.value
    localStorage.setItem(employeeKey, state.employee)
    persistSheet(t.calendar, state.year, state.month)
    downloadJson(
      backupName(state.employee, t.months[state.month], state.year),
      dumpStorage(),
    )
  }

  app.querySelector('[name=clear]').onclick = () => {
    for (const el of sheet.querySelectorAll('input[name]')) el.value = ''
    emp.value = ''
    state.employee = ''
    localStorage.setItem(employeeKey, '')
    writeSheet(t.calendar, state.year, state.month, {})
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
      if (!restoreStorage(data)) return
      syncStateFromStorage()
      render()
    }).catch(() => {})
  }
}

render()
