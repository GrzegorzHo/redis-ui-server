const sharedIoRedis = require('../shared')

module.exports = async(options) => {
    const { socket } = options;

    const connectionSave = options.payload.model;

    let disableReadonlyConnections = true

    try {
        sharedIoRedis.ensureReadonlyConnections()
        disableReadonlyConnections = false

        let connectionIndexExisting;
        for(let connectionIndex in p3xrs.connections.list) {
            const connection = p3xrs.connections.list[connectionIndex]
            if (connection.id === connectionSave.id) {
                connectionIndexExisting = connectionIndex
                break;
            }
        }
        p3xrs.connections.update = new Date()
        if (connectionIndexExisting !== undefined) {

            if (p3xrs.connections.list[connectionIndexExisting].id === connectionSave.password) {
                connectionSave.password = p3xrs.connections.list[connectionIndexExisting].password;
            }

            //TODO fix secured nodes password
            /*
            for(let node of connectionSave.nodes) {
                if (node.password === p3xrs.connections.list[connectionIndexExisting].id) {
                    const findNode = p3xrs.connections.list[connectionIndexExisting].password.nodes.find((findNode) => {
                        return findNode.host === node.host && findNode.port === node.port
                    })
                    if (findNode === undefined) {
                        throw new Error('password-not-found')
                    }
                    node.password = findNode.password
                }
            }
             */

            p3xrs.connections.list[connectionIndexExisting] = connectionSave
        } else {
            p3xrs.connections.list.push(connectionSave)
        }


        const fs = require('fs')
        fs.writeFileSync(p3xrs.cfg.connections.home, JSON.stringify(p3xrs.connections, null, 4))

        socket.emit(options.responseEvent, {
            status: 'ok',
        })

    } catch (e) {
        console.error(e)
        socket.emit(options.responseEvent, {
            status: 'error',
            error: e
        })

    } finally {
        if (!disableReadonlyConnections) {
            sharedIoRedis.sendConnections({
                socket: socket,
            })


            sharedIoRedis.triggerDisconnect({
                connectionId: connectionSave.id,
                code: 'save-connection',
                socket: socket,
            })
        }

    }

}
