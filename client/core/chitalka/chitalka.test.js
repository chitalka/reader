modules.define(
    'test',
    [
        'chitalka',
        'y-dom',
        'jquery',
        'inherit'
    ],
    function (
        provide,
        Chitalka,
        dom,
        $,
        inherit
    ) {
        describe('Chitalka', function () {
            var chitalka;
            var expect = chai.expect;

            // Подменяем для тестов функцию доступности читалки для работы
            var ChitalkaStub = inherit(Chitalka, {
                _isAvailable: function () {
                    return true;
                },

                _initUI: function () {
                },

                _setUpSpeed: function () {
                }
            });

            var emulateKeyDown = function (keycode) {
                if (typeof keycode === 'string' || typeof keycode === 'number') {
                    keycode = {keyCode: keycode};
                }
                var e = $.Event('keydown', keycode);
                $(document).trigger(e);
            };

            describe('js', function () {
                afterEach(function () {
                    chitalka.destruct();
                });

                describe('chitalka methods not implemented', function () {
                    beforeEach(function () {
                        chitalka = new ChitalkaStub();
                    });

                    it('last page', function () {
                        expect(chitalka.lastPage).to.throw('UNIMPLEMENTED METHOD: lastPage');
                    });

                    it('first page', function () {
                        expect(chitalka.firstPage).to.throw('UNIMPLEMENTED METHOD: firstPage');
                    });

                    it('previous page', function () {
                        expect(chitalka.previousPage).to.throw('UNIMPLEMENTED METHOD: previousPage');
                    });

                    it('next page', function () {
                        expect(chitalka.nextPage).to.throw('UNIMPLEMENTED METHOD: nextPage');
                    });

                    it('zoom in', function () {
                        expect(chitalka.zoomIn).to.throw('UNIMPLEMENTED METHOD: zoomIn');
                    });

                    it('zoom out', function () {
                        expect(chitalka.zoomOut).to.throw('UNIMPLEMENTED METHOD: zoomOut');
                    });

                    it('zoom reset', function () {
                        expect(chitalka.zoomReset).to.throw('UNIMPLEMENTED METHOD: zoomReset');
                    });
                });

                describe('chitalka reacts on keyboard events', function () {
                    beforeEach(function () {
                        chitalka = new ChitalkaStub(null, {keyboard: true});
                    });

                    it('should call firstPage on home press', function () {
                        var spy = sinon.stub(chitalka, 'firstPage');
                        emulateKeyDown(36);
                        sinon.assert.called(spy);
                    });
                    it('should call previousPage on left arrow press', function () {
                        var spy = sinon.stub(chitalka, 'previousPage');
                        emulateKeyDown(37);
                        sinon.assert.called(spy);
                    });
                    it('should call nextPage on right arrow press', function () {
                        var spy = sinon.stub(chitalka, 'nextPage');
                        emulateKeyDown(39);
                        sinon.assert.called(spy);
                    });
                    it('should call lastPage on End press', function () {
                        var spy = sinon.stub(chitalka, 'lastPage');
                        emulateKeyDown(35);
                        sinon.assert.called(spy);
                    });
                    it('should call zoomIn on "+" press', function () {
                        var spy = sinon.stub(chitalka, 'zoomIn');
                        emulateKeyDown(61);
                        emulateKeyDown(187);
                        sinon.assert.callCount(spy, 2);
                    });
                    it('should call zoomOut on "-" press', function () {
                        var spy = sinon.stub(chitalka, 'zoomOut');
                        emulateKeyDown(173);
                        emulateKeyDown(189);
                        sinon.assert.callCount(spy, 2);
                    });
                    it('should call zoomReset on "0" press', function () {
                        var spy = sinon.stub(chitalka, 'zoomReset');
                        emulateKeyDown({
                            keyCode: 48,
                            metaKey: true
                        });
                        sinon.assert.called(spy);
                    });
                });
            });
        });

        provide();
    }
);
