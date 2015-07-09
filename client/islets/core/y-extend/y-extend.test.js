modules.define('test', ['y-extend'], function (provide, extend) {

    describe('extend', function () {
        it('should return target object', function () {
            var target = {a: true};
            extend(target).should.eq(target);
        });

        it('should copy properties of one object to target object', function () {
            var source = {num: 1, str: 'str', obj: {b: 2}, arr: null, undef: undefined};
            var sourceCopy = {num: 1, str: 'str', obj: {b: 2}, arr: null, undef: undefined};

            var destination = {num: 2, newstr: 'newstr', obj: {a: 1}, arr: [1, 2]};

            extend(destination, source);
            destination.should.deep.eq({
                num: 1, str: 'str', newstr: 'newstr', obj: {b: 2}, arr: null, undef: undefined
            });
            source.should.deep.eq(sourceCopy);
        });

        it('should copy properties of many objects to target object', function () {
            var source1 = {a: 1, b: 2};
            var source1Copy = {a: 1, b: 2};

            var source2 = {b: 3, c: {y: 2}};
            var source2Copy = {b: 3, c: {y: 2}};

            var destination = {d: 'str', c: {x: 1}};

            extend(destination, source1, null, source2);
            destination.should.deep.eq({d: 'str', c: {y: 2}, a: 1, b: 3});
            source1.should.deep.eq(source1Copy);
            source2.should.deep.eq(source2Copy);

            extend(destination, source2, undefined, source2, source1);
            destination.should.deep.eq({d: 'str', c: {y: 2}, a: 1, b: 2});
            source1.should.deep.eq(source1Copy);
            source2.should.deep.eq(source2Copy);
        });

        it('should properly extend object with "hasOwnProperty" property', function () {
            /* jshint -W001 */
            extend({hasOwnProperty: 1}, {hasOwnProperty: 'yes'}).should.deep.eq({hasOwnProperty: 'yes'});
        });

        describe('deep extend', function () {
            it('should copy recursively plain objects and arrays', function () {
                var deep1 = {foo: {bar: true}, arr: [1, 2]};
                var deep1Copy = {foo: {bar: true}, arr: [1, 2]};

                var deep2 = {foo: {baz: true}, arr: [1, 3, 4]};
                var deep2Copy = {foo: {baz: true}, arr: [1, 3, 4]};

                extend(true, {}, deep1, deep2).should.deep.eq({foo: {bar: true, baz: true}, arr: [1, 3, 4]});
                deep1.should.deep.eq(deep1Copy);
                deep2.should.deep.eq(deep2Copy);
            });

            it('should not copy recursively not plain objects', function () {
                var obj = {date: new Date(), div: document.createElement('div'), window: window};
                var target = {};
                extend(true, target, obj);
                target.date.should.eq(obj.date);
                target.div.should.eq(obj.div);
            });
        });
    });

    provide();
});
