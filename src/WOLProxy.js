const net = require('net');
const tls = require('tls');
const wol = require('wol');
const debug = require('debug')('wol-proxy');

class WOLProxy {

    constructor() {
        this._WOLSentDate = null;
        this._wakeUpTimeout = 60000;
    }

    /**
     * Wake up timeout for target machine.
     * If machine won't start within given period of time then WOL signal will be send again.
     *
     * @param {number} timeout in milliseconds
     * @returns {WOLProxy}
     */
    wakeUpTimeout(timeout) {
        this._wakeUpTimeout = 60000;
        return this;
    }

    /**
     * @param {(number|object)} sourceDefinition port number or object
     * @param {number} sourceDefinition.port
     * @param {string} [sourceDefinition.interface='0.0.0.0']
     */
    source(sourceDefinition) {
        if (typeof sourceDefinition === 'number' || typeof sourceDefinition === 'string') {
            this.source = {port: sourceDefinition};
        } else {
            this.source = sourceDefinition;
        }
        return this;
    }

    sourceSSL(sourceSSL) {
        this.sourceSSLOptions = sourceSSL;
        return this;
    }

    /**
     *
     * @param {Object} targetDefinition
     * @param {string} [targetDefinition.hostname='localhost']
     * @param {number} targetDefinition.port
     * @param {string} targetDefinition.MAC MAC address to machine to wake up
     */
    target(targetDefinition) {
        this.target = targetDefinition;
        return this;
    }

    targetSSL(targetSSL) {
        this.targetSSLOptions = targetSSL;
        return this;
    }


    run() {
        if (!this.source) {
            throw new Error('Missing source configuration');
        }

        if (!this.target) {
            throw new Error('Missing target configuration');
        }

        this._createServer();
        this._createTargetSocket();
    }

    _createServer() {
        const options = Object.assign({}, this.sourceSSLOptions || {}, {
            pauseOnConnect: true
        });

        this.server = this.sourceSSLOptions ? tls.createServer(options) : net.createServer(options);
        this.server.on('connection', (connection) => {

            debug('New connection arrived');
            const targetSocket = this._createTargetSocket();
            targetSocket.on('connect', () => {
                connection.pipe(targetSocket).pipe(connection);
            });
            this._connectToTarget(targetSocket);

            connection.on('close', () => {
                targetSocket.destroy();
                connection.destroy();
            });
        });
        this.server.listen(this.source.port, this.source.interface);
    }

    _createTargetSocket() {
        const options = Object.assign({}, this.targetSSLOptions || {});
        const targetSocket = (() => {
            const basicSocket = new net.Socket();
            if (!this.targetSSLOptions) {
                return basicSocket;
            }
            return tls.TLSSocket(basicSocket, options);
        })();

        targetSocket.on('connect', () => {
            debug('Connected to target endpoint');
            targetSocket.isConnected = true;
        });
        targetSocket.on('close', () => {
            targetSocket.isConnected = false;
        });
        targetSocket.on('error', (error) => {
            debug('Target error', error);
            switch (error.code) {
                case 'EHOSTDOWN':
                case 'ECONNREFUSED':
                case 'ETIMEDOUT':
                    if (this.hasWOLBeenSent) {
                        this._connectToTarget(targetSocket);
                    }
                    break;

                default:
                    debug('Unhandled error', error);
                    break;
            }
        });
        return targetSocket;
    }

    _connectToTarget(socket) {
        if (socket.isConnected || socket.connecting) {
            return;
        }

        debug('Connection to target');
        const options = Object.assign({}, this.targetSSLOptions || {});
        socket.connect(this.target.port, this.target.host, options);

        setTimeout(() => {
            if (!socket.isConnected) {
                this._wakeUpTarget();
            }
        }, 3000);
    }

    _wakeUpTarget() {
        if (this.hasWOLBeenSent) {
            return;
        }

        debug('sending WOL');
        wol.wake(this.target.MAC, (err) => {
            if (err) {
                debug('Unabled to send WOL', err);
                return;
            }
            debug('WOL sent');
            this._WOLSentDate = new Date();
        });
    }

    get hasWOLBeenSent() {
        return this._WOLSentDate && (Date.now() - this._WOLSentDate.getTime()) < this._wakeUpTimeout;
    }
}

module.exports = WOLProxy;