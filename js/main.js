let currentZip = null
let rowCounts = []
let bottomBarDefaultPos = null; let bottomBarDisplayStyle = null
const errorBox = $('#error')

let showFileClickExplanation = false
let lastShownFile = null
let deBounce = false

$.urlParam = function (name) {
  const results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href)
  if (results == null) {
    return null
  } else {
    return results[1] || 0
  }
}

const fileReaderOpts = {
  readAsDefault: 'ArrayBuffer',
  on: {
    load: function (e, file) {
      loadZip(file)
    }
  }
}

const selectFormatter = function (item) {
  const index = item.text.indexOf('(')
  if (index > -1) {
    const name = item.text.substring(0, index)
    return name + '<span style="color:#ccc">' + item.text.substring(index - 1) + '</span>'
  } else {
    return item.text
  }
}

const windowResize = function () {
  positionFooter()
  const container = $('#main-container')
  const cleft = container.offset().left + container.outerWidth()
  $('#bottom-bar').css('left', cleft)
}

var positionFooter = function () {
  const footer = $('#bottom-bar')
  const pager = footer.find('#pager')
  const container = $('#main-container')
  const containerHeight = container.height()
  const footerTop = ($(window).scrollTop() + $(window).height())

  if (bottomBarDefaultPos === null) {
    bottomBarDefaultPos = footer.css('position')
  }

  if (bottomBarDisplayStyle === null) {
    bottomBarDisplayStyle = pager.css('display')
  }

  if (footerTop > containerHeight) {
    footer.css({
      position: 'static'
    })
    pager.css('display', 'inline-block')
  } else {
    footer.css({
      position: bottomBarDefaultPos
    })
    pager.css('display', bottomBarDisplayStyle)
  }
}

const toggleFullScreen = function () {
  const container = $('#main-container')
  const resizerIcon = $('#resizer i')

  container.toggleClass('container container-fluid')
  resizerIcon.toggleClass('glyphicon-resize-full glyphicon-resize-small')
}
$('#resizer').click(toggleFullScreen)

if (typeof FileReader === 'undefined') {
  $('#dropzone, #dropzone-dialog').hide()
  $('#compat-error').show()
} else {
  $('#dropzone, #dropzone-dialog').fileReaderJS(fileReaderOpts)
}

// Update pager position
$(window).resize(windowResize).scroll(positionFooter)
windowResize()

$('.no-propagate').on('click', function (el) { el.stopPropagation() })

// Check url to load remote DB
const loadUrlDB = $.urlParam('url')
if (loadUrlDB != null) {
  setIsLoading(true)
  const xhr = new XMLHttpRequest()
  xhr.open('GET', loadUrlDB, true)
  xhr.responseType = 'arraybuffer'

  xhr.onload = function (e) {
    loadZip(this.response)
  }
  xhr.onerror = function (e) {
    setIsLoading(false)
  }
  xhr.send()
}

function loadZip (file) {
  setIsLoading(true)

  resetTableList()

  setTimeout(function () {
    JSZip.loadAsync(file).then(function (zip) {
      currentZip = zip

      let firstFolderName = null
      const tableList = $('#tables')

      const rootFileCount = getFilesForRoot(zip).length
      if (rootFileCount > 0) {
        rowCounts['/'] = rootFileCount
        firstFolderName = '/'
      }

      zip.forEach(function (relativePath, zipEntry) {
        if (!zipEntry.dir) {
          return
        }

        const name = zipEntry.name

        if (firstFolderName === null) {
          firstFolderName = name
        }

        const rowCount = getFilesForFolder(zip, name).length
        rowCounts[name] = rowCount
      })

      if (firstFolderName === null) {
        // some zip files do not declare directories explicitly
        rowCounts[''] = 0
        firstFolderName = ''
      }

      for (const rowName in rowCounts) {
        const rowCount = rowCounts[rowName]
        tableList.append('<option value="' + rowName + '">' + rowName + ' (' + rowCount + ' files)</option>')
      }

      // Select first table and show It
      tableList.select2('val', firstFolderName)
      renderQuery(firstFolderName)

      $('#output-box').fadeIn()
      $('.nouploadinfo').hide()
      $('#sample-db-link').hide()
      $('#dropzone').delay(50).animate({ height: 50 }, 500)
      $('#success-box').show()

      setIsLoading(false)
    }, function (ex) {
      setIsLoading(false)
      alert(ex)
    })
  }, 50)
}

function resetTableList () {
  const tables = $('#tables')
  rowCounts = []
  tables.empty()
  tables.append('<option></option>')
  tables.select2({
    placeholder: 'Select a folder',
    formatSelection: selectFormatter,
    formatResult: selectFormatter
  })
  tables.on('change', function (e) {
    renderQuery(e.val)
  })
}

function setIsLoading (isLoading) {
  const dropText = $('#drop-text')
  const loading = $('#drop-loading')
  if (isLoading) {
    dropText.hide()
    loading.show()
  } else {
    dropText.show()
    loading.hide()
  }
}

function extractFileNameWithoutExt (filename) {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex > -1) {
    return filename.substr(0, dotIndex)
  } else {
    return filename
  }
}

function dropzoneClick () {
  $('#dropzone-dialog').click()
}

function showError (msg) {
  $('#data').hide()
  $('#bottom-bar').hide()
  errorBox.show()
  errorBox.text(msg)
}

function renderQuery (folder) {
  const dataBox = $('#data')
  const thead = dataBox.find('thead').find('tr')
  const tbody = dataBox.find('tbody')

  thead.empty()
  tbody.empty()
  errorBox.hide()
  dataBox.show()

  const columnNames = ['Name', 'Date', 'Comment', 'Permissions (DOS / UNIX)']
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

  let files
  if (folder === '/') {
    files = getFilesForRoot(currentZip)
  } else {
    files = getFilesForFolder(currentZip, folder)
  }

  let addedColums = false
  for (const fileName in files.sort((a, b) => collator.compare(a.name, b.name))) {
    const file = files[fileName]
    if (file.dir) {
      continue
    }

    if (!addedColums) {
      addedColums = true
      for (let i = 0; i < columnNames.length; i++) {
        const columnName = columnNames[i]
        thead.append('<th><span data-toggle="tooltip" data-placement="top" title="' + columnName + '">' + columnName + '</span></th>')
      }
    }

    const columnValues = []
    columnValues.push(file.name.replace(folder, ''))
    columnValues.push(file.date)
    columnValues.push(file.column)
    columnValues.push(file.dosPermissions + ' / ' + file.unixPermissions)

    const tr = $('<tr>')
    for (let i = 0; i < columnValues.length; i++) {
      const columnValue = columnValues[i]
      const fileElement = tr.append('<td><span title="' + columnValue + '">' + columnValue + '</span></td>')
      registerFileClickListener(file, fileElement)
    }
    tbody.append(tr)
  }

  $('[data-toggle="tooltip"]').tooltip({ html: true })

  setTimeout(function () {
    positionFooter()
  }, 100)
}

function registerFileClickListener (file, element) {
  element.click(function () {
    if (showFileClickExplanation) {
      showFileClickExplanation = false

      console.log('right click object in console and "Store as global variable". afterwards do something like "temp1.async(\'string\').then(console.log)"')
      console.log('more information here: https://stuk.github.io/jszip/documentation/api_zipobject/async.html')
      console.log('for example: "temp1.async(\'base64\').then(function (content) { window.open(\'data:;base64,\' + content)})"')
    }

    if (deBounce) {
      return
    }

    deBounce = true

    setTimeout(function () {
      deBounce = false
    }, 50)

    file.async('blob').then(function (blob) {
      const contentTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.jpe': 'image/jpeg',
        '.png': 'image/png'
      }
      const itemContentType = contentTypes[Object.keys(contentTypes).find(ext => file.name.endsWith(ext))]
      if (itemContentType) {
        const newTab = window.URL.createObjectURL(
          new window.Blob([blob], { type: itemContentType }))
        window.open(newTab, '_blank')
        setTimeout(function () {
          window.URL.revokeObjectURL(newTab)
        }, 1500)
      } else {
        if (lastShownFile === file) {
          return
        }
        lastShownFile = file

        // https://stackoverflow.com/a/35251739/198996

        const dlink = document.createElement('a')
        dlink.download = file.name
        dlink.href = window.URL.createObjectURL(blob)
        dlink.onclick = function (e) {
          // revokeObjectURL needs a delay to work properly
          const that = this
          setTimeout(function () {
            window.URL.revokeObjectURL(that.href)
          }, 1500)
        }

        dlink.click()
        dlink.remove()
      }
    })

    console.log(file)
  })
}

function getFilesForRoot (zip) {
  return zip.filter(function (relativePath, file) {
    return relativePath.indexOf('/') < 0
  })
}

function getFilesForFolder (zip, folder) {
  let isNoFolderZip = false
  if (folder !== '') {
    // some zip files do not declare directories explicitly
    zip = zip.folder(folder)
  } else {
    isNoFolderZip = true
  }

  return zip.filter(function (relativePath, file) {
    if (isNoFolderZip) {
      return true
    } else {
      return relativePath.replace(folder, '').indexOf('/') < 0
    }
  })
}
