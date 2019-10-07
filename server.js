const WebSocketServer = require('websocket').server
const http = require('http')
const fs = require('fs')
const cuid = require('cuid')

let page, client

fs.readFile('static/index.html', (err, data) => {
  page = data
})

fs.readFile('static/index.js', (err, data) => {
  client = data
})

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Length': page.length
    })
    res.write(page)
    res.end()
  }

  if (req.url === '/client.js') {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Length': client.length
    })
    res.write(client)
    res.end()
  }

  console.log((new Date()) + ' Received request for ' + req.url)
  res.writeHead(404)
  res.end()

})

server.listen(8080, () => {
  console.log((new Date()) + ' Server is listening on port 8080')
})

wsServer = new WebSocketServer({
  httpServer: server,
})

const clients = new Map()

const sendToAllClientsExceptSender = (message, exceptSenderId) => {
  for (var [key, client] of clients) {
    if (key !== exceptSenderId) {
      client.sendUTF(message.utf8Data)
      console.log(message)
      console.log(key)
    }
  }
}

wsServer.on('request', (request) => {
  const connection = request.accept(null, request.origin)
  const id = cuid()
  clients.set(id, connection)

  console.log((new Date()) + ' Connection accepted.')

  connection.on('message', (message) => {
    console.log('Received Message: ' + message.utf8Data)
    sendToAllClientsExceptSender(message, id);
  })

  connection.on('close', (reasonCode, description) => {
    console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.')
    clients.delete(id)
  })
})
