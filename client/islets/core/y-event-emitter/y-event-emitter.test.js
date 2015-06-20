modules.define(
    'test',
    ['y-event-emitter'],
    function (provide, YEventEmitter) {

    describe('YEventEmitter', function () {
        var emitter;

        beforeEach(function () {
            emitter = new YEventEmitter();
        });

        function testWrongCallbacks(action) {
            var wrongCallbacks = [
                undefined,
                null,
                0,
                '',
                [],
                {},
                /\w/
            ];

            wrongCallbacks.forEach(function (wrongCallback) {
                var fn = function () {
                    action(wrongCallback);
                };
                fn.should.throw(TypeError, 'callback must be a function');
            });
        }

        describe('on()', function () {
            it('should add event listeners', function () {
                var spy1 = sinon.spy();
                var spy1_1 = sinon.spy();
                var spy2 = sinon.spy();

                emitter
                    .on('event1', spy1)
                    .on('event1', spy1_1)
                    .on('event2', spy2)
                    .emit('event1');

                spy1.calledOnce.should.be.true;
                spy1.firstCall.calledWithExactly().should.be.true;

                spy1_1.calledOnce.should.be.true;
                spy2.called.should.be.false;

                emitter.emit('event2', 2, 3, 'foo');
                spy2.calledOnce.should.be.true;
                spy2.firstCall.calledWithExactly(2, 3, 'foo').should.be.true;

                var obj = {a: 'b'};
                emitter.emit('event1', obj);
                spy1.calledTwice.should.be.true;
                spy1.secondCall.calledWithExactly(obj).should.be.true;
                spy1_1.calledTwice.should.be.true;
                spy1_1.secondCall.calledWithExactly(obj).should.be.true;
            });

            it('should add event listener with context', function () {
                var spy1 = sinon.spy();
                var context1 = {foo: 1};
                var spy2 = sinon.spy();
                var context2 = {bar: 2};

                emitter.on('event', spy1, context1);
                emitter.on('event', spy2, context2);

                emitter.emit('event');

                spy1.firstCall.calledOn(context1).should.be.true;
                spy2.firstCall.calledOn(context2).should.be.true;
            });

            it('should can add the same listener many times', function () {
                var spy1 = sinon.spy();
                var spy2 = sinon.spy();
                var ctx = {};

                emitter
                    .on('event', spy1)
                    .on('event', spy1)
                    .on('event', spy2, ctx)
                    .on('event', spy2, ctx)
                    .emit('event');

                spy1.callCount.should.eq(2);
                spy2.callCount.should.eq(2);
                spy2.alwaysCalledOn(ctx).should.be.true;
            });

            it('should throw error if callback is not a function', function () {
                testWrongCallbacks(function (callback) {
                    emitter.on('event', callback);
                });
            });
        });

        describe('once()', function () {
            it('should add a single-shot listener', function () {
                var spy = sinon.spy();

                emitter
                    .once('event', spy)
                    .emit('event')
                    .emit('event')
                    .emit('event');

                spy.calledOnce.should.be.true;
            });

            it('should add a single-shot listener with context', function () {
                var ctx1 = {};
                var spy1 = sinon.spy();
                var ctx2 = {};
                var spy2 = sinon.spy();

                emitter
                    .once('event', spy1, ctx1)
                    .once('event', spy2, ctx2)
                    .emit('event')
                    .emit('event')
                    .emit('event');

                spy1.calledOnce.should.be.true;
                spy1.firstCall.calledOn(ctx1).should.be.true;
                spy2.calledOnce.should.be.true;
                spy2.firstCall.calledOn(ctx2).should.be.true;
            });

            it('should throw error if callback is not a function', function () {
                testWrongCallbacks(function (callback) {
                    emitter.once('event', callback);
                });
            });
        });

        describe('emit()', function () {
            it('should work before add any event', function () {
                emitter.emit('event', 1, 2).should.eq(emitter);
            });

            describe('while emiting event', function () {
                it('should not call listener that was added in another listener', function () {
                    var spy = sinon.spy();

                    emitter.on('event', function () {
                        emitter.on('event', spy);
                    });

                    emitter.emit('event');
                    spy.called.should.be.false;

                    emitter.emit('event');
                    spy.called.should.be.true;
                });

                it('should call listener that was removed in another listener', function () {
                    var spy = sinon.spy();

                    emitter.on('event', spy);
                    emitter.on('event', function () {
                        emitter.off('event', spy);
                    });

                    emitter.emit('event');
                    spy.calledOnce.should.be.true;
                    spy.reset();

                    emitter.emit('event');
                    spy.called.should.be.false;
                });
            });
        });

        describe('off()', function () {
            it('should remove listener according to event', function () {
                var spy1 = sinon.spy();
                var spy2 = sinon.spy();

                emitter
                    .on('event', spy1)
                    .on('event', spy2)
                    .on('event2', spy1)
                    .off('event', spy1)
                    .off('event2', spy2)
                    .emit('event');

                spy1.called.should.be.false;
                spy2.called.should.be.true;

                emitter.emit('event2');
                spy1.called.should.be.true;
            });

            it('should remove listener according to event and context', function () {
                var spy = sinon.spy();
                var ctx1 = {};
                var ctx2 = {};

                emitter
                    .on('event', spy, ctx1)
                    .on('event', spy, ctx2)
                    .on('event', spy)
                    .off('event', spy, ctx1)
                    .emit('event');

                spy.callCount.should.eq(2);
            });

            it('should remove once listener according to event', function () {
                var spy = sinon.spy();

                emitter
                    .once('event', spy)
                    .off('event', spy)
                    .emit('event')
                    .emit('event')
                    .emit('event');

                spy.called.should.be.false;
            });

            it('should remove once listener according to event and context', function () {
                var ctx1 = {};
                var ctx2 = {};
                var spy = sinon.spy();

                emitter
                    .once('event', spy, ctx1)
                    .once('event', spy, ctx2)
                    .off('event', spy, ctx1)
                    .off('event', spy)
                    .emit('event')
                    .emit('event');

                spy.calledOnce.should.be.true;
                spy.firstCall.calledOn(ctx2).should.be.true;
            });

            it('should work before add any event', function () {
                emitter.off('event', function () {}).should.eq(emitter);
            });

            it('should remove first listener from the list of same listeners', function () {
                var spy = sinon.spy();
                emitter
                    .on('event', spy)
                    .on('event', spy)
                    .on('event', spy);

                emitter.off('event', spy);
                emitter.emit('event');
                spy.callCount.should.eq(2);
                spy.reset();

                emitter.off('event', spy);
                emitter.emit('event');
                spy.callCount.should.eq(1);
                spy.reset();

                emitter.off('event', spy);
                emitter.emit('event');
                spy.called.should.be.false;
            });

            it('should throw error if callback is not a function', function () {
                testWrongCallbacks(function (callback) {
                    emitter.off('event', callback);
                });
            });
        });

        describe('offAll()', function () {
            it('should remove all listeners of all events', function () {
                var spy1 = sinon.spy();
                var spy2 = sinon.spy();

                emitter.on('event1', spy1);
                emitter.on('event2', spy2);

                emitter.emit('event1');
                emitter.emit('event2');

                emitter
                    .offAll()
                    .emit('event1')
                    .emit('event2');

                spy1.calledOnce.should.be.true;
                spy2.calledOnce.should.be.true;
            });

            it('should work before add any event', function () {
                emitter.offAll().should.eq(emitter);
            });
        });

        describe('offAll(event)', function () {
            it('should remove all listeners for the specified event', function () {
                var spy1 = sinon.spy();
                var spy2 = sinon.spy();
                var spy3 = sinon.spy();

                emitter
                    .on('event1', spy1)
                    .on('event1', spy2)
                    .on('event2', spy1)
                    .on('event2', spy3)
                    .offAll('event2')
                    .emit('event1')
                    .emit('event2');

                spy1.calledOnce.should.be.true;
                spy2.calledOnce.should.be.true;
                spy3.called.should.be.false;
            });

            it('should work before add any event', function () {
                emitter.offAll('event').should.eq(emitter);
            });
        });

        describe('_onAddEvent()', function () {
            it('should be called when new event was added', function () {
                var _onAddEvent = sinon.spy(emitter, '_onAddEvent');
                var fn1 = function () {};
                var fn2 = function () {};
                var fn3 = function () {};

                emitter.on('event1', fn1);
                _onAddEvent.callCount.should.eq(1);
                _onAddEvent.getCall(0).calledWithExactly('event1').should.be.true;

                emitter.on('event1', fn2);
                _onAddEvent.callCount.should.eq(1);

                emitter.on('event2', fn1);
                _onAddEvent.callCount.should.eq(2);
                _onAddEvent.getCall(1).calledWithExactly('event2').should.be.true;

                emitter.on('event1', fn3);
                emitter.on('event2', fn2);
                _onAddEvent.callCount.should.eq(2);
            });
        });

        describe('_onRemoveEvent()', function () {
            var _onRemoveEvent;

            beforeEach(function () {
                _onRemoveEvent = sinon.spy(emitter, '_onRemoveEvent');
            });

            it('should be called when event was removed', function () {
                var fn1 = function () {};
                var fn2 = function () {};
                var fn3 = function () {};
                var fn4 = function () {};

                emitter.on('event1', fn1);
                emitter.on('event1', fn2);

                emitter.on('event2', fn3);
                emitter.on('event2', fn4);

                emitter.off('event1', fn2);
                _onRemoveEvent.called.should.be.false;

                emitter.off('event1', fn1);
                _onRemoveEvent.callCount.should.eq(1);
                _onRemoveEvent.getCall(0).calledWithExactly('event1').should.be.true;

                emitter.offAll('event1');
                _onRemoveEvent.callCount.should.eq(1, 'should not be called for already removed event');

                emitter.offAll('event2');
                _onRemoveEvent.callCount.should.eq(2);
                _onRemoveEvent.getCall(1).calledWithExactly('event2').should.be.true;
            });

            describe('when remove all events using offAll()', function () {
                it('should be called for each removed event', function () {
                    emitter
                        .on('event1', function () {})
                        .on('event2', function () {})
                        .on('event2', function () {})
                        .on('event3', function () {})
                        .offAll();

                    _onRemoveEvent.callCount.should.eq(3);
                    _onRemoveEvent.getCall(0).calledWithExactly('event1').should.be.true;
                    _onRemoveEvent.getCall(1).calledWithExactly('event2').should.be.true;
                    _onRemoveEvent.getCall(2).calledWithExactly('event3').should.be.true;
                });
            });
        });
    });

    provide();
});
