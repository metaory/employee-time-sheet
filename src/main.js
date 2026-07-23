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
const localeKey = 'timesheet:locale'
const themeKey = 'timesheet:theme'

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

applyTheme(loadTheme())

const boot = localeOf(loadLocale())
const today = todayParts(boot.calendar)

const state = {
  employee: '',
  year: today.year,
  month: today.month,
  firstWeekday: loadFirst(boot.calendar, today.year, today.month),
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

const render = () => {
  const t = localeOf(state.locale)
  document.documentElement.lang = t.tag
  document.documentElement.dir = t.dir

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
  <button type="button" class="print" name="print">${t.print}</button>
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

  const syncTotal = () => {
    const mins = extras.reduce((sum, el) => sum + (parseHm(el.value) ?? 0), 0)
    totalEl.textContent = showHm(mins, t.digit)
  }

  const syncMeta = () => {
    meta.textContent = [state.employee, `${t.months[state.month]} ${t.digit(state.year)}`]
      .filter(Boolean)
      .join(' · ')
  }
  emp.value = state.employee
  emp.oninput = (e) => {
    state.employee = e.target.value
    syncMeta()
  }
  syncMeta()

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
    if (!e.target.matches('input[name^=extra-]')) return
    syncTotal()
  }

  sheet.onchange = (e) => {
    if (!e.target.matches('input[name^=extra-]')) return
    syncTotal()
  }

  sheet.onfocusout = (e) => {
    if (!e.target.matches('input[name^=extra-]')) return
    const mins = parseHm(e.target.value)
    if (mins == null) {
      if (e.target.value.trim()) e.target.value = ''
      syncTotal()
      return
    }
    e.target.value = formatHm(mins)
    syncTotal()
  }

  app.querySelector('[name=month]').onchange = (e) => {
    state.month = +e.target.value
    state.firstWeekday = loadFirst(t.calendar, state.year, state.month)
    render()
  }

  app.querySelector('[name=year]').onchange = (e) => {
    state.year = +e.target.value
    state.firstWeekday = loadFirst(t.calendar, state.year, state.month)
    render()
  }

  app.querySelector('[name=locale]').onchange = (e) => {
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
    state.firstWeekday = +btn.dataset.day
    saveFirst(t.calendar, state.year, state.month, state.firstWeekday)
    render()
  }

  app.querySelector('[name=print]').onclick = () => {
    syncMeta()
    syncTotal()
    print()
  }
}

render()
