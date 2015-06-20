modules.define(
    'test',
    [
        'y-event-manager',
        'y-event-emitter',
        'jquery'
    ],
    function (
        provide,
        YEventManager,
        YEventEmitter,
        $
    ) {

    describe('YEventManager', function () {
        var manager;
        var owner;

        beforeEach(function () {
            owner = {};
            manager = new YEventManager(owner);
        });

        describe('bindTo()', function () {
            it('should bind event listeners to YEventEmitter', function () {
                var emitter = new YEventEmitter();
                var spy1 = sinon.spy();
                var spy2 = sinon.spy();
                var spy3 = sinon.spy();

                manager.bindTo(emitter, 'event1', spy1).should.eq(manager);
                manager.bindTo(emitter, 'event2', spy2);
                manager.bindTo(emitter, 'event2', spy3);

                emitter.emit('event1', 1, 2);
                spy1.callCount.should.eq(1);
                spy1.calledWithExactly(1, 2).should.be.true;
                spy1.calledOn(owner).should.be.true;
                spy2.callCount.should.eq(0);
                spy3.callCount.should.eq(0);

                emitter.emit('event2', 3, 4);
                spy1.callCount.should.eq(1);
                spy2.callCount.should.eq(1);
                spy2.calledWithExactly(3, 4).should.be.true;
                spy2.calledOn(owner).should.be.true;
                spy3.callCount.should.eq(1);
                spy3.calledWithExactly(3, 4).should.be.true;
                spy3.calledOn(owner).should.be.true;
            });

            it('should bind event listeners to jQuery', function () {
                var jqObj = $({});
                var spy1 = sinon.spy();
                var spy2 = sinon.spy();
                var spy3 = sinon.spy();

                manager.bindTo(jqObj, 'event1', spy1).should.eq(manager);
                manager.bindTo(jqObj, 'event2', spy2);
                manager.bindTo(jqObj, 'event2', spy3);

                var data = {};
                jqObj.trigger('event1', data);
                spy1.callCount.should.eq(1);
                var args = spy1.getCall(0).args;
                args[1].should.eq(data);
                spy2.called.should.be.false;
                spy3.called.should.be.false;

                jqObj.trigger('event2', [3, 4]);
                spy1.callCount.should.eq(1);
                spy2.callCount.should.eq(1);
                args = spy2.getCall(0).args;
                args[1].should.eq(3);
                args[2].should.eq(4);
                spy3.callCount.should.eq(1);
                args = spy3.getCall(0).args;
                args[1].should.eq(3);
                args[2].should.eq(4);
            });

            it('should throw error for unsupported emitter type', function () {
                /* jshint -W068 */
                (function () {
                    var FakeEmitter = {
                        events: [],
                        on: function () {}
                    };
                    manager.bindTo(FakeEmitter, 'event', function () {});
                }).should.throw(Error, 'Unsupported emitter type');
            });

            it('should work with different emitters together', function () {
                var emitter = new YEventEmitter();
                var jqObj = $({});
                var emitterSpy1 = sinon.spy();
                var emitterSpy2 = sinon.spy();
                var jqSpy1 = sinon.spy();
                var jqSpy2 = sinon.spy();

                manager.bindTo(emitter, 'event', emitterSpy2);
                manager.bindTo(jqObj, 'event', jqSpy1);
                manager.bindTo(jqObj, 'event', jqSpy2);
                manager.bindTo(emitter, 'event', emitterSpy1);

                jqObj.trigger('event');
                jqSpy1.callCount.should.eq(1);
                jqSpy2.callCount.should.eq(1);
                emitterSpy1.callCount.should.eq(0);
                emitterSpy2.callCount.should.eq(0);

                emitter.emit('event');
                jqSpy1.callCount.should.eq(1);
                jqSpy2.callCount.should.eq(1);
                emitterSpy1.callCount.should.eq(1);
                emitterSpy2.callCount.should.eq(1);

                jqSpy1.alwaysCalledOn(owner);
                jqSpy2.alwaysCalledOn(owner);
                emitterSpy1.alwaysCalledOn(owner);
                emitterSpy2.alwaysCalledOn(owner);
            });
        });

        describe('unbindFrom()', function () {
            function testUnbind(emitter, anotherEmitter, emitFn) {
                var spy1 = sinon.spy();
                var spy2 = sinon.spy();
                var spy3 = sinon.spy();

                manager.bindTo(anotherEmitter, 'event1', spy1);
                manager.bindTo(emitter, 'event1', spy1);
                manager.bindTo(emitter, 'event1', spy2);
                manager.bindTo(emitter, 'event2', spy3);

                manager.unbindFrom(emitter, 'event1', spy1).should.eq(manager);

                emitter[emitFn]('event1');
                spy1.called.should.be.false;
                spy2.calledOnce.should.be.true;
                spy2.calledOn(owner);

                emitter[emitFn]('event2');
                spy3.calledOnce.should.be.true;
                spy3.calledOn(owner);

                manager.unbindFrom(emitter, 'event1', spy2);
                manager.unbindFrom(emitter, 'event2', spy3);

                emitter[emitFn]('event1');
                emitter[emitFn]('event2');

                spy1.called.should.be.false;
                spy2.calledOnce.should.be.true;
                spy3.calledOnce.should.be.true;

                anotherEmitter[emitFn]('event1');
                spy1.calledOnce.should.be.true;
            }

            function testUnbindFirst(emitter, emitFn) {
                var spy = sinon.spy();

                manager.bindTo(emitter, 'test', spy);
                manager.bindTo(emitter, 'test', spy);
                manager.bindTo(emitter, 'test', spy);
                manager.unbindFrom(emitter, 'test', spy);

                emitter[emitFn]('test');
                spy.callCount.should.eq(2);

                manager.unbindFrom(emitter, 'test', spy);
                emitter[emitFn]('test');
                spy.callCount.should.eq(3);

                manager.unbindFrom(emitter, 'test', spy);
                emitter[emitFn]('test');
                spy.callCount.should.eq(3);
            }

            it('should unbind event listeners from YEventEmitter', function () {
                var emitter1 = new YEventEmitter();
                var emitter2 = new YEventEmitter();
                testUnbind(emitter1, emitter2, 'emit');
            });

            it('should unbind event listeners from jQuery', function () {
                var jqObj1 = $({});
                var jqObj2 = $({});
                testUnbind(jqObj1, jqObj2, 'trigger');
            });

            it('should unbind first listener from list of same listeners', function () {
                var emitter = new YEventEmitter();
                testUnbindFirst(emitter, 'emit');
                var jqObj = $({});
                testUnbindFirst(jqObj, 'trigger');
            });

            it('should work with different emitters together', function () {
                var emitter = new YEventEmitter();
                var jqObj = $({});

                var emitterSpy1 = sinon.spy();
                var emitterSpy2 = sinon.spy();
                var jqSpy1 = sinon.spy();
                var jqSpy2 = sinon.spy();

                manager.bindTo(emitter, 'event', emitterSpy2);
                manager.bindTo(jqObj, 'event', jqSpy1);
                manager.bindTo(jqObj, 'event', jqSpy2);
                manager.bindTo(emitter, 'event', emitterSpy1);

                manager.unbindFrom(emitter, 'event', emitterSpy1);
                manager.unbindFrom(jqObj, 'event', jqSpy2);

                jqObj.trigger('event');
                jqSpy1.callCount.should.eq(1);
                emitterSpy2.callCount.should.eq(0);

                emitter.emit('event');
                jqSpy1.callCount.should.eq(1);
                emitterSpy2.callCount.should.eq(1);

                emitterSpy1.called.should.be.false;
                jqSpy2.called.should.be.false;
                jqSpy1.alwaysCalledOn(owner);
                emitterSpy2.alwaysCalledOn(owner);
            });
        });

        describe('unbindAll()', function () {
            it('should unbind all events from different emitters', function () {
                var emitter = new YEventEmitter();
                var jqObj = $({});
                var spy = sinon.spy();

                emitter.on('event5', spy);
                jqObj.on('event5', spy);

                manager.bindTo(emitter, 'event1', spy);
                manager.bindTo(emitter, 'event2', spy);
                manager.bindTo(emitter, 'event2', spy);
                manager.bindTo(jqObj, 'event3', spy);
                manager.bindTo(jqObj, 'event4', spy);
                manager.bindTo(jqObj, 'event4', spy);

                manager.unbindAll().should.eq(manager);

                emitter.emit('event1');
                emitter.emit('event2');

                jqObj.trigger('event3');
                jqObj.trigger('event4');

                spy.called.should.be.false;

                emitter.emit('event5');
                spy.calledOnce.should.be.true;
                jqObj.trigger('event5');
                spy.calledTwice.should.be.true;
            });
        });
    });

    provide();
});
