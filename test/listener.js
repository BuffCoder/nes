'use strict';

// Load modules

const Code = require('code');
const Hapi = require('hapi');
const Lab = require('lab');
const Nes = require('../');


// Declare internals

const internals = {};


// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;


describe('Listener', () => {

    describe('_beat()', () => {

        it('disconnects client after timeout', (done) => {

            const server = new Hapi.Server();
            server.connection();
            server.register({ register: Nes, options: { auth: false, heartbeat: { interval: 20, timeout: 10 } } }, (err) => {

                expect(err).to.not.exist();

                server.start((err) => {

                    const client = new Nes.Client('http://localhost:' + server.info.port);
                    client.onDisconnect = function () {

                        server.stop(done);
                    };

                    client.connect((err) => {

                        expect(err).to.not.exist();
                        expect(client._heartbeatTimeout).to.equal(30);

                        client._onMessage = function () { };
                    });
                });
            });
        });

        it('disables heartbeat', (done) => {

            const server = new Hapi.Server();
            server.connection();
            server.register({ register: Nes, options: { auth: false, heartbeat: false } }, (err) => {

                expect(err).to.not.exist();

                server.start((err) => {

                    const client = new Nes.Client('http://localhost:' + server.info.port);
                    client.connect((err) => {

                        expect(err).to.not.exist();
                        expect(client._heartbeatTimeout).to.be.false();

                        client.disconnect();
                        server.stop(done);
                    });
                });
            });
        });
    });

    describe('broadcast()', () => {

        it('sends message to all clients', (done) => {

            const server = new Hapi.Server();
            server.connection();
            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();

                server.start((err) => {

                    const client = new Nes.Client('http://localhost:' + server.info.port);
                    client.onUpdate = function (message) {

                        expect(message).to.equal('hello');
                        client.disconnect();
                        server.stop(done);
                    };

                    client.connect((err) => {

                        expect(err).to.not.exist();
                        server.broadcast('hello');
                    });
                });
            });
        });

        it('sends message to all clients (non participating connections)', (done) => {

            const server = new Hapi.Server();
            server.connection();
            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();

                server.start((err) => {

                    const client = new Nes.Client('http://localhost:' + server.info.port);
                    client.onUpdate = function (message) {

                        expect(message).to.equal('hello');
                        client.disconnect();
                        server.stop(done);
                    };

                    client.connect((err) => {

                        expect(err).to.not.exist();
                        server.connection();
                        server.broadcast('hello');
                    });
                });
            });
        });

        it('logs invalid message', (done) => {

            const server = new Hapi.Server();
            let client;
            server.connection();
            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();

                server.on('log', (event, tags) => {

                    expect(event.data).to.equal('update');
                    client.disconnect();
                    server.stop(done);
                });

                server.start((err) => {

                    client = new Nes.Client('http://localhost:' + server.info.port);
                    client.connect((err) => {

                        expect(err).to.not.exist();
                        const a = { b: 1 };
                        a.c = a;                    // Circular reference

                        server.broadcast(a);
                    });
                });
            });
        });
    });

    describe('subscription()', () => {

        it('ignores non participating connections', (done) => {

            const server = new Hapi.Server();
            server.connection();
            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();
                server.connection();

                server.subscription('/');

                server.start((err) => {

                    const client = new Nes.Client('http://localhost:' + server.connections[0].info.port);
                    client.connect(() => {

                        client.subscribe('/', (err, update) => {

                            expect(err).to.not.exist();
                            expect(update).to.equal('heya');
                            client.disconnect();
                            server.stop(done);
                        });

                        setTimeout(() => {

                            server.publish('/', 'heya');
                        }, 10);
                    });
                });
            });
        });

        it('provides subscription notifications', (done) => {

            const server = new Hapi.Server();
            let client;

            const onSubscribe = function (socket, path) {

                expect(socket).to.exist();
                expect(path).to.equal('/');
                client.disconnect();
            };

            const onUnsubscribe = function (socket, path) {

                expect(socket).to.exist();
                expect(path).to.equal('/');
                server.stop(done);
            };

            server.connection();
            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();
                server.connection();

                server.subscription('/', { onSubscribe: onSubscribe, onUnsubscribe: onUnsubscribe });

                server.start((err) => {

                    client = new Nes.Client('http://localhost:' + server.connections[0].info.port);
                    client.connect(() => {

                        client.subscribe('/', (err, update) => { });
                    });
                });
            });
        });

        it('removes subscription notification by path', (done) => {

            const server = new Hapi.Server();
            let client;

            const onSubscribe = function (socket, path) {

                expect(socket).to.exist();
                expect(path).to.equal('/foo');
                client.unsubscribe('/foo');
            };

            const onUnsubscribe = function (socket, path) {

                expect(socket).to.exist();
                expect(path).to.equal('/foo');
                server.stop(done);
            };

            server.connection();
            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();
                server.connection();

                server.subscription('/{params*}', { onSubscribe: onSubscribe, onUnsubscribe: onUnsubscribe });

                server.start((err) => {

                    client = new Nes.Client('http://localhost:' + server.connections[0].info.port);
                    client.connect(() => {

                        client.subscribe('/foo', (err, update) => { });
                    });
                });
            });
        });
    });

    describe('publish()', () => {

        it('publishes to a parameterized path', (done) => {

            const server = new Hapi.Server();
            server.connection();

            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();

                server.subscription('/a/{id}');

                server.start((err) => {

                    const client = new Nes.Client('http://localhost:' + server.info.port);
                    client.connect((err) => {

                        expect(err).to.not.exist();
                        client.subscribe('/a/b', (err, update) => {

                            expect(err).to.not.exist();
                            expect(update).to.equal('2');
                            client.disconnect();
                            server.stop(done);
                        });

                        setTimeout(() => {

                            server.publish('/a/a', '1');
                            server.publish('/a/b', '2');
                        }, 10);
                    });
                });
            });
        });

        it('publishes with filter', (done) => {

            const server = new Hapi.Server();
            server.connection();

            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();

                const filter = function (path, update, options, next) {

                    return next(update.a === 1);
                };

                server.subscription('/updates', { filter: filter });

                server.start((err) => {

                    const client = new Nes.Client('http://localhost:' + server.info.port);
                    client.connect((err) => {

                        expect(err).to.not.exist();
                        client.subscribe('/updates', (err, update) => {

                            expect(err).to.not.exist();
                            expect(update).to.deep.equal({ a: 1 });
                            client.disconnect();
                            server.stop(done);
                        });

                        setTimeout(() => {

                            server.publish('/updates', { a: 2 });
                            server.publish('/updates', { a: 1 });
                        }, 10);
                    });
                });
            });
        });

        it('passes internal options to filter', (done) => {

            const server = new Hapi.Server();
            server.connection();

            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();

                const filter = function (path, update, options, next) {

                    return next(options.internal.b === 1);
                };

                server.subscription('/updates', { filter: filter });

                server.start((err) => {

                    const client = new Nes.Client('http://localhost:' + server.info.port);
                    client.connect((err) => {

                        expect(err).to.not.exist();
                        client.subscribe('/updates', (err, update) => {

                            expect(err).to.not.exist();
                            expect(update).to.deep.equal({ a: 1 });
                            client.disconnect();
                            server.stop(done);
                        });

                        setTimeout(() => {

                            server.publish('/updates', { a: 2 }, { internal: { b: 2 } });
                            server.publish('/updates', { a: 1 }, { internal: { b: 1 } });
                        }, 10);
                    });
                });
            });
        });

        it('ignores unknown path', (done) => {

            const server = new Hapi.Server();
            server.connection();
            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();
                server.publish('/', 'ignored');
                done();
            });
        });

        it('throws on missing path', (done) => {

            const server = new Hapi.Server();
            server.connection();
            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();
                expect(() => {

                    server.publish('', 'ignored');
                }).to.throw('Missing or invalid subscription path: empty');
                done();
            });
        });

        it('throws on invalid path', (done) => {

            const server = new Hapi.Server();
            server.connection();
            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();
                expect(() => {

                    server.publish('a', 'ignored');
                }).to.throw('Missing or invalid subscription path: a');
                done();
            });
        });
    });

    describe('_subscribe()', () => {

        it('subscribes to two paths on same subscription', (done) => {

            const server = new Hapi.Server();
            server.connection();
            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();

                server.subscription('/{id}', {});

                server.start((err) => {

                    const client = new Nes.Client('http://localhost:' + server.info.port);
                    client.connect(() => {

                        let called = false;
                        client.subscribe('/5', (err, update) => {

                            expect(err).to.not.exist();
                            called = true;
                        });

                        client.subscribe('/6', (err, update) => {

                            expect(err).to.not.exist();

                            expect(called).to.be.true();
                            client.disconnect();

                            setTimeout(() => {

                                server.stop(() => {

                                    const listener = server.connections[0].plugins.nes._listener;
                                    expect(listener._sockets._items).to.deep.equal({});
                                    const match = listener._router.route('sub', '/5');
                                    expect(match.route.subscribers._items).to.deep.equal({});
                                    done();
                                });
                            }, 10);
                        });

                        setTimeout(() => {

                            server.publish('/5', 'a');
                            server.publish('/6', 'b');
                        }, 10);
                    });
                });
            });
        });

        it('errors on double subscribe to same paths', (done) => {

            const server = new Hapi.Server();
            server.connection();
            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();

                server.subscription('/{id}', {});

                server.start((err) => {

                    const client = new Nes.Client('http://localhost:' + server.info.port);
                    client.connect(() => {

                        let called = false;
                        client.subscribe('/5', (err, update) => {

                            if (!called) {
                                called = true;

                                const request = {
                                    type: 'sub',
                                    path: '/5'
                                };

                                return client._send(request);
                            }

                            expect(err).to.exist();
                            expect(err.message).to.equal('Client already subscribed');
                            client.disconnect();
                            server.stop(done);
                        });

                        setTimeout(() => {

                            server.publish('/5', 'a');
                        }, 10);
                    });
                });
            });
        });

        it('errors on path with query', (done) => {

            const server = new Hapi.Server();
            server.connection();
            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();

                server.subscription('/');

                server.start((err) => {

                    const client = new Nes.Client('http://localhost:' + server.info.port);
                    client.connect((err) => {

                        expect(err).to.not.exist();
                        client.subscribe('/?5', (err, update) => {

                            expect(err).to.exist();
                            expect(err.message).to.equal('Subscription path cannot contain query');

                            client.disconnect();
                            server.stop(done);
                        });
                    });
                });
            });
        });
    });


    describe('eachSocket()', () => {

        it('returns connected sockets', (done) => {

            const server = new Hapi.Server();
            server.connection();

            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();

                server.start((err) => {

                    const client = new Nes.Client('http://localhost:' + server.info.port);
                    client.connect((err) => {

                        expect(err).to.not.exist();
                        expect(countSockets(server)).to.equal(1);

                        server.stop(done);
                    });
                });
            });
        });

        it('returns sockets on a subscription', (done) => {

            const server = new Hapi.Server();
            server.connection();

            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();

                server.subscription('/a/{id}');
                server.subscription('/b');

                server.start((err) => {

                    let client = new Nes.Client('http://localhost:' + server.info.port);
                    client.connect((err) => {

                        expect(err).to.not.exist();

                        client.subscribe('/b', () => { });

                        client = new Nes.Client('http://localhost:' + server.info.port);
                        client.connect((err) => {

                            expect(err).to.not.exist();
                            client.subscribe('/a/b', () => { });

                            setTimeout(() => {

                                expect(countSockets(server)).to.equal(2);
                                expect(countSockets(server, { subscription: '/a/a' })).to.equal(0);
                                expect(countSockets(server, { subscription: '/a/b' })).to.equal(1);

                                expect(countSockets(server, { subscription: '/b' })).to.equal(1);

                                expect(countSockets(server, { subscription: '/foo' })).to.equal(0);

                                server.stop(done);
                            }, 10);
                        });
                    });
                });
            });
        });

        it('ignores not participating connections', (done) => {

            const server = new Hapi.Server();
            server.connection();

            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();

                server.start((err) => {

                    const client = new Nes.Client('http://localhost:' + server.info.port);
                    client.connect((err) => {

                        expect(err).to.not.exist();

                        server.connection();
                        expect(countSockets(server)).to.equal(1);

                        server.stop(done);
                    });
                });
            });
        });

        const countSockets = function (server, options) {

            let seen = 0;
            server.eachSocket((socket) => {

                expect(socket).to.exist();
                seen++;
            }, options);
            return seen;
        };
    });

    describe('_generateId()', () => {

        it('rolls over when reached max sockets per millisecond', (done) => {

            const server = new Hapi.Server();
            server.connection();
            server.register({ register: Nes, options: { auth: false } }, (err) => {

                expect(err).to.not.exist();

                const listener = server.connections[0].plugins.nes._listener;
                listener._socketCounter = 99999;
                let id = listener._generateId();
                expect(id.split(':')[4]).to.equal('99999');
                id = listener._generateId();
                expect(id.split(':')[4]).to.equal('10000');

                done();
            });
        });
    });
});
