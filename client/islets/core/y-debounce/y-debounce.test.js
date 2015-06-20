modules.define('test', ['y-debounce'], function (provide, debounce) {

    describe('debounce', function () {
        it('should debounce given function', function (done) {
            var counter = 0;
            var incr = function () {
                counter++;
            };
            var debouncedIncr = debounce(incr, 32);
            debouncedIncr();
            debouncedIncr();
            setTimeout(debouncedIncr, 16);
            setTimeout(function () {
                counter.should.eq(1, 'incr was debounced');
                done();
            }, 96);
        });

        it('should call given function immediately if "immediate" param is true', function (done) {
            var a;
            var b;
            var counter = 0;
            var incr = function () {
                return ++counter;
            };
            var debouncedIncr = debounce(incr, 64, true);
            a = debouncedIncr();
            b = debouncedIncr();
            a.should.eq(1);
            b.should.eq(1);
            counter.should.eq(1, 'incr was called immediately');
            setTimeout(debouncedIncr, 16);
            setTimeout(debouncedIncr, 32);
            setTimeout(debouncedIncr, 48);
            setTimeout(function () {
                counter.should.eq(1, 'incr was debounced');
                done();
            }, 128);
        });

        it('should work properly when debounced function called recursively', function (done) {
            var counter = 0;
            var debouncedIncr = debounce(function () {
                counter++;
                if (counter < 10) {
                    debouncedIncr();
                }
            }, 32, true);
            debouncedIncr();
            counter.should.eq(1, 'incr was called immediately');
            setTimeout(function () {
                counter.should.eq(1, 'incr was debounced');
                done();
            }, 96);
        });
    });

    provide();
});
