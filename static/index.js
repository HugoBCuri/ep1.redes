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

var tools = Object.create(null)

tools.Line = function(
  event,
  cx,
  onEnd,
  strokeStyle = null,
  globalCompositeOperation = null,
) {
  cx.lineCap = 'round'

  var pos = relativePos(event, cx.canvas)
  trackDrag(function(event) {
    cx.beginPath()
    cx.moveTo(pos.x, pos.y)

    ws.send(JSON.stringify({
      tool: 'Line',
      strokeStyle: strokeStyle ? strokeStyle : cx.strokeStyle,
      globalCompositeOperation: globalCompositeOperation ? globalCompositeOperation : cx.globalCompositeOperation,
      lineWidth: cx.lineWidth,
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
  }, 'white', 'destination-out')
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

var appDiv = document.querySelector('#paint-app')
createPaint(appDiv)

const canvas = document.querySelector('canvas')
const cx = canvas.getContext('2d')

const statesMouse = new Map()
let lastPosition = new Map()

function getCanvasStyle() {
  return {
    strokeStyle: cx.strokeStyle,
    lineWidth: cx.lineWidth,
    globalCompositeOperation: cx.globalCompositeOperation,
  }
}

function setCanvasStyle(actualConfig) {
  cx.strokeStyle = actualConfig.strokeStyle
  cx.lineWidth = actualConfig.lineWidth
  cx.globalCompositeOperation = actualConfig.globalCompositeOperation
}

function dealWithLine (data) {
  const { position, strokeStyle, lineWidth, globalCompositeOperation } = data
  const actualConfig = getCanvasStyle()

  cx.beginPath()
  if (lastPosition.get(data.userId)) {
    cx.moveTo(lastPosition.get(data.userId).x, lastPosition.get(data.userId).y)
  } else {
    cx.moveTo(position.x, position.y)
  }

  cx.lineTo(position.x, position.y)
  cx.strokeStyle = strokeStyle
  cx.lineWidth = lineWidth
  cx.lineCap = 'round'
  cx.strokeStyle = globalCompositeOperation
  cx.stroke()
  setCanvasStyle(actualConfig)
  lastPosition.set(data.userId, data.position)
}

function dealWithRectangle (data) {
  const { position, width, height, fillStyle } = data
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
  console.log(data)
  decideTool(data)
}
