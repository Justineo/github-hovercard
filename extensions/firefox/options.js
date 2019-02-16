'use strict'

const ITEM_TPL = `{{#domains}}<li><input type="text" ui="wide" class="domain" value="{{.}}" placeholder="github.mydomain.com"><button type="button" class="ghost icon remove" aria-label="Remove"></button></li>{{/domains}}`
const GH_DOMAIN = 'github.com'

let form = $('#form')
let list = $('#domains')
let saveBtn = $('#save')
let addBtn = $('#add')
let msg = $('#message')
let delayInput = $('#delay')
let readmeInput = $('#readme')
let projectsInput = $('#projects')
let showSelfInput = $('#show-self')
let sideInputs = $('[name="side"]')
let themeInputs = $('[name="theme"]')
let current
let storage = chrome.storage.sync || chrome.storage.local

function toOrigins(name) {
  return [`http://${name}/*`, `https://${name}/*`]
}

function concat(a, b) {
  return a.concat(b)
}

function restore() {
  storage.get(
    {
      domains: [],
      delay: 200,
      readme: true,
      disableProjects: false,
      showSelf: false,
      side: 'top',
      theme: 'classic'
    },
    item => {
      current = item.domains
      list.append(Mustache.render(ITEM_TPL, { domains: current }))
      delayInput.val(item.delay)
      readmeInput.prop('checked', item.readme)
      projectsInput.prop('checked', item.disableProjects)
      showSelfInput.prop('checked', item.showSelf)
      sideInputs
        .prop('checked', false)
        .filter(`[value="${item.side}"]`)
        .prop('checked', true)
      themeInputs
        .prop('checked', false)
        .filter(`[value="${item.theme}"]`)
        .prop('checked', true)
    }
  )
}

function save() {
  let delay = delayInput.val()
  let readme = readmeInput.prop('checked')
  let disableProjects = projectsInput.prop('checked')
  let showSelf = showSelfInput.prop('checked')
  let side = sideInputs.filter(':checked').val()
  let theme = themeInputs.filter(':checked').val()

  let domains = []
  $('.domain').each(function() {
    let domain = $(this)
      .val()
      .trim()
    if (domains.indexOf(domain) === -1 && domain !== GH_DOMAIN) {
      domains.push(domain)
    }
  })

  let revoking = current
    .filter(domain => {
      return domains.indexOf(domain) === -1
    })
    .map(toOrigins)
    .reduce(concat, [])

  chrome.permissions.remove({
    origins: revoking
  })

  let granting = domains.map(toOrigins).reduce(concat, [])
  chrome.permissions.request(
    {
      origins: granting
    },
    granted => {
      let options = { delay, readme, disableProjects, showSelf, side, theme }
      if (granted) {
        Object.assign(options, { domains })
        current = domains
      } else {
        log('Domain permission denied.', 3000)
      }

      storage.set(options, () => {
        chrome.runtime.sendMessage({ event: 'optionschange' }, response => {
          if (response.success) {
            log('Options saved.', 3000)
          } else {
            log('Something went wrong.', 3000)
          }
        })
      })
    }
  )
}

function addRow() {
  if ($('.domain').length >= 4) {
    log('That should be enough.', 3000)
    return
  }
  list.append(
    Mustache.render(ITEM_TPL, {
      domains: ['']
    })
  )
}

function removeRow() {
  $(this)
    .parent()
    .remove()
  save()
}

let logTimer
function log(message, duration) {
  clearTimeout(logTimer)
  msg.css({ opacity: 1 }).html(message)
  if (duration) {
    logTimer = setTimeout(() => {
      msg.animate({ opacity: 0 }, 300, () => msg.empty())
    }, duration)
  }
}

$(() => {
  saveBtn.on('click', save)
  addBtn.on('click', addRow)
  list.on('keypress', '.domain', e => {
    if (e.which === 13) {
      save()
    }
  })
  list.on('click', '.remove', removeRow)

  form.on('change', 'input', save)

  restore()
})
