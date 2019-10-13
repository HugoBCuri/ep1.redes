const ws = new WebSocket('ws://localhost:8080')

function createPaint(parent) {
  var canvas = elt('canvas', { width: 500, height: 300 })
  var cx = canvas.getContext('2d')
  var toolbar = elt('div', { class: 'toolbar' })

  for (var name in controls)
    toolbar.appendChild(controls[name](cx))

  var panel = elt('div', { class: 'picturepanel' }, canvas)
  parent.appendChild(elt('div', null, panel, toolbar))
}

function elt(name, attributes) {
  var node = document.createElement(name)
  if (attributes) {
    for (var attr in attributes)
      if (attributes.hasOwnProperty(attr))
        node.setAttribute(attr, attributes[attr])
  }
  for (var i = 2; i < arguments.length; i++) {
    var child = arguments[i]

    if (typeof child == 'string')
      child = document.createTextNode(child)
    node.appendChild(child)
  }
  return node
}

function relativePos(event, element) {
  var rect = element.getBoundingClientRect()

  return {
    x: Math.floor(event.clientX - rect.left),
    y: Math.floor(event.clientY - rect.top),
  }
}

function trackDrag(onMove, onEnd) {
  function end(event) {
    removeEventListener('mousemove', onMove)
    removeEventListener('mouseup', end)
    if (onEnd) {
      onEnd(event)
    }
  }
  addEventListener('mousemove', onMove)
  addEventListener('mouseup', end)
}

function loadImageURL(cx, url)  {
  var image = document.createElement('img')
  image.addEventListener('load', function() {
    var color = cx.fillStyle, size = cx.lineWidth
    cx.canvas.width = image.width
    cx.canvas.height = image.height
    cx.drawImage(image, 0, 0)
    cx.fillStyle = color
    cx.strokeStyle = color
    cx.lineWidth = size
  })
  image.src = url
}

function randomPointInRadius(radius) {
  for (;;) {
    var x = Math.random() * 2 - 1
    var y = Math.random() * 2 - 1
    // uses the Pythagorean theorem to test if a point is inside a circle
    if (x * x + y * y <= 1)
      return { x: x * radius, y: y * radius }
  }
}

var controls = {}

controls.tool = function(cx) {
  var select = elt('select')

  for (var name in tools)
    select.appendChild(elt('option', null, name))

  cx.canvas.addEventListener('mousedown', function(event) {
    if (event.which == 1) {
      tools[select.value](event, cx)
      event.preventDefault()
    }
  })

  return elt('span', null, 'Tool: ', select)
}

controls.color = function(cx) {
  var input = elt('input', {type: 'color'})

  input.addEventListener('change', function() {
    cx.fillStyle = input.value
    cx.strokeStyle = input.value
  })

  return elt('span', null, 'Color: ', input)
}

controls.brushSize = function(cx) {
  var select = elt('select')

  var sizes = [1, 2, 3, 5, 8, 12, 25, 35, 50, 75, 100]

  sizes.forEach(function(size) {
    select.appendChild(elt('option', {value: size}, size + ' pixels'))
  })

  select.addEventListener('change', function() {
    cx.lineWidth = select.value
  })
  return elt('span', null, 'Brush size: ', select)
}

controls.save = function(cx) {
  var link = elt('a', {href: '/', target: '_blank'}, 'Save')
  function update() {
    try {
      link.href = cx.canvas.toDataURL()
    } catch(e) {
      if (e instanceof SecurityError)
        link.href = 'javascript:alert(' +
          JSON.stringify('Can\'t save: ' + e.toString()) + ')'
      else
        window.alert("Nope.")
        throw e
    }
  }
  link.addEventListener('mouseover', update)
  link.addEventListener('focus', update)
  return link
}

controls.openFile = function(cx) {
  var input = elt('input', {type: 'file'})
  input.addEventListener('change', function() {
    if (input.files.length == 0) return
    var reader = new FileReader()
    reader.addEventListener('load', function() {
      loadImageURL(cx, reader.result)
    })
    reader.readAsDataURL(input.files[0])
  })
  return elt('div', null, 'Open file: ', input)
}

controls.openURL = function(cx) {
  var input = elt('input', {type: 'text'})
  var form = elt('form', null, 'Open URL: ', input,
                 elt('button', {type: 'submit'}, 'load'))
  form.addEventListener('submit', function(event) {
    event.preventDefault()
    loadImageURL(cx, form.querySelector('input').value)
  })
  return form
}

var tools = Object.create(null)

tools.Line = function(event, cx, onEnd) {
  cx.lineCap = 'round'

  var pos = relativePos(event, cx.canvas)
  trackDrag(function(event) {
    cx.beginPath()
    console.log(cx.fillStyle)
    cx.moveTo(pos.x, pos.y)

    ws.send(JSON.stringify({
      tool: 'Line',
      strokeStyle: cx.strokeStyle,
      position: {
        x: pos.x,
        y: pos.y,
      },
    }))

    pos = relativePos(event, cx.canvas)

    cx.lineTo(pos.x, pos.y)

    cx.stroke()
  }, onEnd)
}

tools.Erase = function(event, cx) {
  cx.globalCompositeOperation = 'destination-out'
  tools.Line(event, cx, function() {
    cx.globalCompositeOperation = 'source-over'
  })
}

tools.Text = function(event, cx) {
  var text = prompt('Text:', '')
  if (text) {
    var pos = relativePos(event, cx.canvas)
    cx.font = Math.max(7, cx.lineWidth) + 'px sans-serif'
    cx.fillText(text, pos.x, pos.y)
  }
}

tools.Spray = function(event, cx) {
  var radius = cx.lineWidth / 2
  var area = radius * radius * Math.PI
  var dotsPerTick = Math.ceil(area / 30)

  var currentPos = relativePos(event, cx.canvas)
  var spray = setInterval(function() {
    for (var i = 0; i < dotsPerTick; i++) {
      var offset = randomPointInRadius(radius)
      cx.fillRect(
        currentPos.x + offset.x,
        currentPos.y + offset.y, 1, 1
      )
    }
  }, 25)
  trackDrag(function(event) {
    currentPos = relativePos(event, cx.canvas)
  }, function() {
    clearInterval(spray)
  })
}

tools.Rectangle = function(event, cx) {
  var leftX, rightX, topY, bottomY
  var clientX = event.clientX,
      clientY = event.clientY

  var placeholder = elt('div', {class: 'placeholder'})

  var initialPos = relativePos(event, cx.canvas)

  var xOffset = clientX - initialPos.x,
      yOffset = clientY - initialPos.y

  trackDrag(function(event) {
    document.body.appendChild(placeholder)

    var currentPos = relativePos(event, cx.canvas)
    var startX = initialPos.x,
        startY = initialPos.y

    if (startX < currentPos.x) {
      leftX = startX
      rightX = currentPos.x
    } else {
      leftX = currentPos.x
      rightX = startX
    }

    if (startY < currentPos.y) {
      topY = startY
      bottomY = currentPos.y
    } else {
      topY = currentPos.y
      bottomY = startY
    }

    placeholder.style.background = cx.fillStyle

    placeholder.style.left = leftX + xOffset + 'px'
    placeholder.style.top = topY + yOffset + 'px'
    placeholder.style.width = rightX - leftX + 'px'
    placeholder.style.height = bottomY - topY + 'px'
  }, function() {

    const width = rightX - leftX
    const height = bottomY - topY

    cx.fillRect(leftX, topY, width, height)
    ws.send(JSON.stringify({
      tool: 'Rectangle',
      position: {
        x: leftX,
        y: topY,
      },
      width,
      height,
      fillStyle: cx.fillStyle,
    }))

    document.body.removeChild(placeholder)
  })
}

tools['Pick Color'] = function(event, cx) {
  try {
    var colorPos = relativePos(event, cx.canvas),
        imageData = cx.getImageData(colorPos.x, colorPos.y, 1, 1),
        colorVals = imageData.data,
        color = ''

    color += 'rgb('

    for (var i = 0; i < colorVals.length - 1; i++) {
      color += colorVals[i]

      if (i < 2)
        color += ','
    }
    color += ')'

    cx.fillStyle = color
    cx.strokeStyle = color

  } catch(e) {
    if (e instanceof SecurityError)
        alert('Whoops! Looks like you don\'t have permission to do that!')
      else
        throw e
  }
}

function forEachNeighbor(point, fn) {
  fn({x: point.x - 1, y: point.y})
  fn({x: point.x + 1, y: point.y})
  fn({x: point.x, y: point.y - 1})
  fn({x: point.x, y: point.y + 1})
}

function isSameColor(data, point1, point2) {
  var offset1 = (point1.x + point1.y * data.width) * 4
  var offset2 = (point2.x + point2.y * data.width) * 4

  for (var i = 0; i < 4; i++) {
    if (data.data[offset1 + i] != data.data[offset2 + i]) {
      return false
    }
  }
  return true
}

tools["Flood Fill"] = function(event, cx) {
  var imageData = cx.getImageData(0, 0, cx.canvas.width, cx.canvas.height),
  		sample = relativePos(event, cx.canvas),
      isPainted = new Array(imageData.width * imageData.height),
      toPaint = [sample]

  while(toPaint.length) {
    var current = toPaint.pop(),
        id = current.x + current.y * imageData.width

    if (isPainted[id]) continue
    else {
      cx.fillRect(current.x, current.y, 1, 1)
      isPainted[id] = true
    }

    forEachNeighbor(current, function(neighbor) {
      if (neighbor.x >= 0 && neighbor.x < imageData.width &&
          neighbor.y >= 0 && neighbor.y < imageData.height &&
          isSameColor(imageData, sample, neighbor)) {
        toPaint.push(neighbor)
      }
    })
  }
}

var appDiv = document.querySelector('#paint-app')
createPaint(appDiv)

const canvas = document.querySelector('canvas')
const cx = canvas.getContext('2d')

const statesMouse = new Map()
let lastPosition = new Map()

function dealWithLine (data) {
  const { position, strokeStyle } = data
  const oldStrokeStyle = cx.strokeStyle

  cx.beginPath()
  if (lastPosition.get(data.userId)) {
    cx.moveTo(lastPosition.get(data.userId).x, lastPosition.get(data.userId).y)
  } else {
    cx.moveTo(position.x, position.y)
  }

  cx.lineTo(position.x, position.y)
  cx.strokeStyle = strokeStyle
  cx.stroke()
  cx.strokeStyle = oldStrokeStyle
  lastPosition.set(data.userId, data.position)
}

function dealWithRectangle (data) {
  const { position, width, height, fillStyle } = data
  console.log(position, width, height)
  const oldFillStyle = cx.fillStyle
  cx.fillStyle = fillStyle
  cx.fillRect(position.x, position.y, width, height)
  cx.fillStyle = oldFillStyle
}

function dealWithMouse(data) {
  if (data.event === 'mousedown') statesMouse.set(data.userId, 'mousedown')
  if (data.event === 'mouseup') {
    statesMouse.set(data.userId, 'mouseup')
    lastPosition.set(data.userId, null)
  }
}

addEventListener('mousedown', function() {
  ws.send(JSON.stringify({
    tool: 'Mouse',
    event: 'mousedown',
  }))
})

addEventListener('mouseup', function() {
  ws.send(JSON.stringify({
    tool: 'Mouse',
    event: 'mouseup',
  }))
})

function decideTool (data) {
  console.log(data)
  switch (data.tool) {
    case 'Line':
      dealWithLine(data)
    case 'Rectangle':
        dealWithRectangle(data)
    case 'Mouse':
      dealWithMouse(data)
  }
}

ws.onmessage = function (event) {
  const data = JSON.parse(event.data)
  decideTool(data)
}
