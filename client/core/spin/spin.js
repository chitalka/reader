modules.define(
    'spin',
    [
        'y-block',
        'inherit'
    ],
    function (
        provide,
        YBlock,
        inherit
    ) {

    var Spin = inherit(YBlock, {
        __constructor: function () {
            this.__base.apply(this, arguments);
        },
        /**
         * Останаваливает анимацию спиннера
         */
        stop: function () {
            this._removeState('progressed');
        },

        /**
         * Запускает анимацию спиннера
         */
        start: function () {
            this._setState('progressed');
        }

    }, {
        getBlockName: function () {
            return 'spin';
        }
    });

    provide(Spin);
});
