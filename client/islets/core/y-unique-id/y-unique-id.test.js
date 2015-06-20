modules.define(
    'test',
    ['y-unique-id'],
    function (provide, uniqueId) {

    var should = chai.should();

    describe('uniqueId', function () {
        describe('generate()', function () {
            it('should generate unique id on each call', function () {
                var id1 = uniqueId.generate();
                var id2 = uniqueId.generate();
                var id3 = uniqueId.generate();

                should.exist(id1);
                should.exist(id2);
                should.exist(id3);

                id1.should.not.eq(id2);
                id1.should.not.eq(id3);
                id2.should.not.eq(id3);
            });
        });

        describe('identify()', function () {
            it('should generate different ids for different objects', function () {
                var obj1 = {};
                var obj2 = {};
                var id1 = uniqueId.identify(obj1);
                var id2 = uniqueId.identify(obj2);
                id1.should.not.eq(id2);
            });

            it('should generate same id for same objects', function () {
                var obj = {};
                var id1 = uniqueId.identify(obj);
                var id2 = uniqueId.identify(obj);
                id1.should.eq(id2);
            });
        });

        describe('isIdentified()', function () {
            it('should return true if object has unique id ', function () {
                var obj = {};
                uniqueId.isIdentified(obj).should.be.false;
                uniqueId.identify(obj);
                uniqueId.isIdentified(obj).should.be.true;
            });

            it('should check own object\'s property', function () {
                function Custom() {}
                uniqueId.identify(Custom.prototype);
                var custom = new Custom();
                uniqueId.isIdentified(custom).should.be.false;
            });
        });
    });

    provide();
});
