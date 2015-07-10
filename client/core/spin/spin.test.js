modules.define(
    'test',
    [
        'spin',
        'y-dom',
        'jquery',
        'inherit'
    ],

    function (
        provide,
        Spin,
        dom,
        $,
        inherit
    ) {
        describe('Spin', function () {
            var spin;
            var expect = chai.expect;

            var SpinStub = inherit(Spin, {
                _classes: function() {
                    return [].slice.call(this.getDomNode()[0].classList)
                }
            });

            beforeEach(function(){
                spin = new SpinStub();
                spin.getDomNode().appendTo(document.body);
            });

            afterEach(function(){
                spin.destruct();
            });


            it('should have class _progressed after creation', function (){
                expect(spin._classes()).to.contain('_progressed');
            });

            it('should remove class _progressed, on spin stop', function () {
                spin.stop();

                expect(spin._classes()).to.not.contain('_progressed');
            });

            it('should add class _progressed, on spin start', function () {
                spin.stop();
                spin.start();

                expect(spin._classes()).to.contain('_progressed');
            });
        });

        provide();
    }
);
