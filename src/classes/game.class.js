const Snake = require('./snake.class')
module.exports = class Game {
  constructor(cycleTime = 150, players, fruit, gridSize) {
    this.id = global.uuid()
    this.flags = {
      started: false,
      ended: false,
    }
    this.players = players || []
    this.fruit = fruit || []
    this.gridSize = gridSize || 25,
    this.gameInterval = null
    this.cycleTime = cycleTime
    this.gameInstance = new GameInstance(this)
  }

  get sendableInfo () {
    return {
      id: this.id,
      flags: this.flags,
      fruit: this.fruit,
      gridSize: this.gridSize,
      players: this.players.map(p => p.sendableInfo)
    }
  }

  get isAvailableToJoin () {
    return !this.flags.started && !this.flags.ended
  }

  // ---------------------METHODS---------------------

  addPlayer(player) {
    this.players.push(player)
    console.log('Player', player.name, 'connected to game', this.id)
  }
  removePlayer(player) {
    this.players = this.players.filter(p => p !== player)
  }
  get connectedPlayers () {
    return this.players.filter(player => player.flags.connected)
  }
  // ---------------------GAME---------------------
  startGame () {
    this.flags.started = true
    this.gameInstance.startGame()
  }
  sendToAllPlayers (data = {}) {
    data = JSON.stringify(global._.merge({ game: this.sendableInfo }, data))
    this.players.forEach(player => this.sendToPlayer(player, data))
  }
  sendToPlayer (player, data = JSON.stringify({ game: this.sendableInfo })) {
    player.flags.connected && player.ws.send(data)
  }
  // ---------------------EVENTS---------------------
  onPlayerReady () {
    const allReady = this.players.every(player => player.flags.prepared)
    allReady && this.startGame()
    return allReady
  }
  onPlayerConnected () {
    this.sendToAllPlayers()
  }
  onPlayerDisconnected () {
    this.gameInstance && this.gameInstance.areAllPlayersGone()
  }
  onSnakeDead (player) {
    this.players = this.players.sort((a, b) => {
      if (a === player) return 1
      if (b === player) return -1
    })
  }
}


class GameInstance {
  constructor (parent) {
    this.parent = parent
  }

  get game () {
    return this.parent
  }

  positionSnakes () {
    this.game.players.forEach((player, index) => {
      // TODO position snakes
      player.snake = new Snake(player)
      player.snake.resetPosition()
    })
  }

  randomPosition () {
    return [
      Math.floor(Math.random() * 1000) % this.game.gridSize,
      Math.floor(Math.random() * 1000) % this.game.gridSize
    ]
  }

  randomValidPosition () {
    let pos
    do {
      pos = this.randomPosition()
    } while (this.isColliding(pos))
    return pos
  }

  createFruit () {
    this.game.fruit = this.randomValidPosition()
  }

  removeFruit () {
    this.game.fruit = []
  }

  // ---------------------
  isColliding (pos) {
    return this.isOOB(pos) || this.isCollidingWithSnakes(pos)
  }

  isOOB (pos = this.head) {
    const max = this.game.gridSize
    const Y = pos[0]
    const X = pos[1]
    return (Y < 0 || Y > max) || (X < 0 || X > max)
  }

  isCollidingWithSnakes (pos) {
    return this.game.connectedPlayers.some(p => this.isCollidingWithSnake(p.snake, pos))
  }
  isCollidingWithSnake (snake, pos) {
    const isSame = snake === this

    const movePointer = (segment) => {
      switch (segment.direction) {
        case 0:
          pointer[0] += segment._length
          break
        case 1:
          pointer[1] -= segment._length
          break
        case 2:
          pointer[0] -= segment._length
          break
        case 3:
          pointer[1] += segment._length
          break
      }
    }

    const pointer = [...snake.head]
    const body = snake.body

    return body.some((segment, i) => {
      if (i === 0 && isSame) return movePointer(segment)
      const isY = pointer[0] === pos[0]
      const isX = pointer[1] === pos[1]

      if (isY && isX) return true

      if (isY) {
        if (segment.direction === 1) { if (pos[1] < pointer[1] && pos[1] > (pointer[1] - segment._length)) return true }
        else if (segment.direction === 3) { if (pos[1] > pointer[1] && pos[1] < (pointer[1] + segment._length)) return true }
      } else if (isX) {
        if (segment.direction === 0) { if (pos[0] > pointer[0] && pos[0] < (pointer[0] + segment._length)) return true }
        else if (segment.direction === 2) { if (pos[0] < pointer[0] && pos[0] > (pointer[0] - segment._length)) return true }
      }

      movePointer(segment)
    })
  }
  // ---------------------
  checkFruit (snake) {
    if (!(snake.head[0] === this.game.fruit[0] && snake.head[1] === this.game.fruit[1])) return
    this.eatFruit(snake)
    snake.grow()
  }

  eatFruit (snake) {
    snake.counter++
    // this.removeFruit()
    this.createFruit()
  }

  areAllPlayersGone () {
    if (this.game.players.some(player => player.flags.connected)) return
    console.log('All players disconnected')
    this.closeGame()
  }

  async closeGame () {
    try {
      clearInterval(this.game.gameInterval)
      this.game.flags.ended = true
      await this.game.sendToAllPlayers({event: 'game-over'})
      console.log('Game Closed')
    } catch (error) {
      console.error('ERROR WHEN CLOSING GAME WITH ID ', this.game.id, error)
    }
  }

  gameCycle () {
    let alive = 0
    this.game.players.forEach(({snake}) => {
      if (snake.flags.dead) return
      snake.move()
      if (snake.flags.dead) return
      this.checkFruit(snake)
      alive++
    })
    if (!alive) return this.closeGame()
    this.game.sendToAllPlayers()
  }


  startGame () {
    this.positionSnakes()
    this.createFruit()
    this.game.gameInterval = setInterval(() => this.gameCycle(), this.game.cycleTime)
  }
}