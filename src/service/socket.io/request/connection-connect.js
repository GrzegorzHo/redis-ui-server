const consolePrefix = 'socket.io connection-connect';
const Redis = require('../../../lib/ioredis-cluster')

const sharedIoRedis = require('../shared')

const generateConnectInfo = async (options) => {
    const {socket, redis} = options

    // console.warn('generateConnectInfo', options.payload)


    let databases
    let results
    let commands
    if (options.payload.connection.awsElastiCache === true) {
        databases = 0
        commands = await redis.command()
    } else {
        results = await Promise.all([
            redis.config('get', 'databases'),
            redis.command(),
        ])
        databases = parseInt(results[0][1])
        commands = results[1]
    }
    //socket.p3xrs.commands = commands.map(e => e[0].toLowerCase())

    //console.log('databases', databases)

    await sharedIoRedis.getFullInfoAndSendSocket({
        redis: redis,
        responseEvent: options.responseEvent,
        socket: socket,
        extend: {
            databases: databases,
            commands: commands
        }
    })
}

module.exports = async (options) => {
    const {socket, payload} = options;

    const {connection, db} = payload

    try {
        if (socket.p3xrs.connectionId !== connection.id) {
            sharedIoRedis.disconnectRedis({
                socket: socket,
            })
        }

        if (!p3xrs.redisConnections.hasOwnProperty(connection.id)) {
            p3xrs.redisConnections[connection.id] = {
                connection: connection,
                clients: []
            }
        }
        if (!p3xrs.redisConnections[connection.id].clients.includes(socket.id)) {
            console.info(consolePrefix, 'added new socket.id', socket.id, 'to', connection.id, 'name with', connection.name)
            p3xrs.redisConnections[connection.id].clients.push(socket.id)
        }

        if (socket.p3xrs.ioredis !== undefined) {
            console.info(consolePrefix, 'redis was already connected')
            socket.p3xrs.connectionId = connection.id
            await generateConnectInfo({
                redis: socket.p3xrs.ioredis,
                socket: socket,
                responseEvent: options.responseEvent,
                payload: payload
            })

            sharedIoRedis.sendStatus({
                socket: socket,
            })
        } else {
            const actualConnection = p3xrs.connections.list.find(con => options.payload.connection.id === con.id)
            let redisConfig = Object.assign({}, actualConnection);
            delete redisConfig.name
            delete redisConfig.id
            redisConfig.retryStrategy = () => {
                return false
            }


            if (db !== undefined) {
                redisConfig.db = db
            }

            if (redisConfig.cluster === true) {
                redisConfig = [redisConfig].concat(actualConnection.nodes)
            }

            let redis = new Redis(redisConfig)
            let redisSubscriber = new Redis(redisConfig)
            // let redis = await new Redis(redisConfig, {autoDetectCluster: true})
            // let redisSubscriber = await new Redis(redisConfig, {autoDetectCluster: true})
            socket.p3xrs.connectionId = connection.id
            socket.p3xrs.ioredis = redis
            socket.p3xrs.ioredisSubscriber = redisSubscriber
            let didConnected = false

            const redisErrorFun = async function (error) {
                const consolePrefix = 'socket.io connection-connect redis error fun'
                console.warn(consolePrefix, connection.id, connection.name, 'error')
                console.error(error)
                console.warn(consolePrefix, 'didConnected', didConnected)
                if (!didConnected) {
                    socket.emit(options.responseEvent, {
                        status: 'error',
                        error: error
                    })
                }
                const disconnectedData = {
                    connectionId: socket.p3xrs.connectionId,
                    error: error,
                    status: 'error',
                }
                console.warn(consolePrefix, 'disconnectedData', disconnectedData)
                socket.p3xrs.io.emit('redis-disconnected', disconnectedData)

                try {
                    await sharedIoRedis.disconnectRedis({
                        socket: socket,
                    })
                } catch (e) {
                    console.warn(consolePrefix, 'disconnectRedis')
                    console.error(e)
                }
                delete p3xrs.redisConnections[socket.connectionId]

                socket.p3xrs.connectionId = undefined
                socket.p3xrs.ioredis = undefined
                socket.p3xrs.ioredisSubscriber = undefined

                sharedIoRedis.sendStatus({
                    socket: socket,
                })
            }

            redis.on('error', redisErrorFun)
            redisSubscriber.on('error', redisErrorFun)

            //console.warn('create psubscribe', actualConnection.id)
            redisSubscriber.psubscribe('*', function (error, count) {
                if (error) {
                    console.error(error)
                }
            })

            //console.warn('create pmessage', actualConnection.id)
            redisSubscriber.on('pmessage', function (channel, pattern, message) {
                console.log(`receive pmessage channel: ${channel} - pattern: ${pattern}, message: ${message}`);
                //console.log('list clients', actualConnection.id, JSON.stringify(p3xrs.redisConnections[actualConnection.id].clients, null, 4))
                socket.emit('pubsub-message', {
                    channel: pattern,
                    message: message,
                })
            });

            redis.on('connect', async function () {

                try {
                    console.info(consolePrefix, options.payload.connection.id, options.payload.connection.name, 'connected')
                    didConnected = true


                    await generateConnectInfo({
                        redis: redis,
                        socket: socket,
                        responseEvent: options.responseEvent,
                        payload: options.payload,
                    })

                } catch (e) {
                    console.error(e)
                    socket.emit(options.responseEvent, {
                        status: 'error',
                        error: e,
                    })
                } finally {
                    sharedIoRedis.sendStatus({
                        socket: socket,
                    })

                }


            })

        }

    } catch (error) {
        console.error(error)
        socket.emit(options.responseEvent, {
            status: 'error',
            error: error
        })

    }

}
