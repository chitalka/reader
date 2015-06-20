modules.define('test', ['y-throttle'], function (provide, throttle) {

    describe('throttle', function () {
        it('should throttle given function', function (done) {
            var res = [];
            var throttledFn = throttle(function (arg) {
                res.push(arg);
            }, 20);

            throttledFn(1);
            throttledFn(2);
            throttledFn(3);

            setTimeout(function () {
                throttledFn(4);
            }, 10);

            setTimeout(function () {
                throttledFn(5);
                res.should.deep.eq([1, 4]);
                done();
            }, 30);
        });

        it('should not trigger leading call when option "leading" is set to false', function (done) {
            var res = [];
            var throttledFn = throttle(function (arg) {
                res.push(arg);
            }, 20, {leading: false});

            throttledFn(1);
            throttledFn(2);
            throttledFn(3);

            setTimeout(function () {
                throttledFn(4);
            }, 10);

            setTimeout(function () {
                throttledFn(5);
                res.should.deep.eq([4]);
                done();
            }, 30);
        });

        it('should not trigger trailing call when option "trailing" is set to false', function (done) {
            var res = [];
            var throttledFn = throttle(function (arg) {
                res.push(arg);
            }, 20, {trailing: false});

            throttledFn(1);
            throttledFn(2);
            throttledFn(3);

            setTimeout(function () {
                throttledFn(4);
            }, 10);

            setTimeout(function () {
                res.should.deep.eq([1]);
                done();
            }, 30);
        });

        it('should not trigger leading and trailing calls when both options are set to false', function (done) {
            var res = [];
            var throttledFn = throttle(function (arg) {
                res.push(arg);
            }, 20, {leading: false, trailing: false});

            throttledFn(1);
            throttledFn(2);
            throttledFn(3);

            setTimeout(function () {
                throttledFn(4);
            }, 10);

            setTimeout(function () {
                res.should.deep.eq([]);
                done();
            }, 30);
        });
    });

    provide();
});
