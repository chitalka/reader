modules.define(
    'test',
    [
        'y-block-event'
    ],
    function (
        provide,
        YBlockEvent
    ) {

    describe('YBlockEvent', function () {
        describe('new YBlockEvent("type")', function () {
            var event;

            beforeEach(function () {
                event = new YBlockEvent('foo');
            });

            it('should not stop propagation and not stop default action', function () {
                event.isPropagationStopped().should.be.false;
                event.isDefaultPrevented().should.be.false;
            });

            it('should have property `type`', function () {
                event.type.should.eq('foo');
            });
        });

        describe('new YBlockEvent("type", true, false)', function () {
            it('should stop propagation', function () {
                var event = new YBlockEvent('type', true, false);
                event.isPropagationStopped().should.be.true;
                event.isDefaultPrevented().should.be.false;
            });
        });

        describe('new YBlockEvent("type", false, true)', function () {
            it('should prevent default action', function () {
                var event = new YBlockEvent('type', false, true);
                event.isPropagationStopped().should.be.false;
                event.isDefaultPrevented().should.be.true;
            });
        });

        describe('preventDefault()', function () {
            it('should prevent default action of event', function () {
                var event = new YBlockEvent('type');
                event.preventDefault();
                event.isDefaultPrevented().should.be.true;
            });
        });

        describe('stopPropagation()', function () {
            it('should stop propagation of event', function () {
                var event = new YBlockEvent('type');
                event.stopPropagation();
                event.isPropagationStopped().should.be.true;
            });
        });
    });

    provide();
});
