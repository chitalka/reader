modules.define(
    'controls',
    [
        'y-block',
        'jquery',
        'y-extend',
        'inherit'
    ],
    function (
        provide,
        YBlock,
        $,
        extend,
        inherit
        ) {

    /*jshint devel:true*/
    var Controls = inherit(YBlock, {
        __constructor: function () {
            this.__base.apply(this, arguments);

            var menu = this._findElement('menu');
            var params = extend({
                zoom: false,

                // Длина свайпа в пикселах
                swipeLength: 20
            }, this._getOptions());

            this._trigger = this._findElement('trigger');
            this._bindTo(this._trigger, 'click', function () {
                this._toggleElementState(menu, 'state', 'opened', 'closed');
            });

            if (params.zoom) {
                this._initZoomControls();
            }

            if (params.footnotes) {
                this._initFootnotes();
            }

            if (params.pages) {
                this._initPageModes();
            }

            if (params.arrows) {
                this._initArrowControls();
            }
        },

        _initArrowControls: function () {
            this.arrowLeft = this._findElement('arrow-left');
            this.arrowRight = this._findElement('arrow-right');

            this._bindTo(this.arrowRight, 'click', function () {
                this.emit('next-page');
            });

            this._bindTo(this.arrowLeft, 'click', function () {
                this.emit('previous-page');
            });
        },

        _initZoomControls: function () {
            this._bindTo(this._findElement('plus'), 'click', function () {
                this.emit('zoom-in');
            });

            this._bindTo(this._findElement('minus'), 'click', function () {
                this.emit('zoom-out');
            });
        },

        /**
         * Инициализация блока со сносками
         */
        _initFootnotes: function () {
            this._bindTo(this._findElement('footnotes'), 'click', function (e) {
                this._toggleElementState($(e.currentTarget), 'mode', 'appendix', 'inline');

                this.emit('footnotes-' + this._getElementState($(e.currentTarget), 'mode'));
            });
        },

        /**
         * Устанавливает режим сносок в нужный
         *
         * @param {String} mode
         */
        setFootnotesMode: function (mode) {
            this._setElementState(this._findElement('footnotes'), 'mode', mode);
        },

        /**
         * Инициализация контрола страничного отображения
         */
        _initPageModes: function () {
            var pages = this._findElement('pages');
            var modes = ['auto', 'one', 'two'];
            this._pageMode = modes.indexOf(this._getElementState(pages, 'mode'));
            this._bindTo(pages, 'click', function () {
                this._pageMode = (this._pageMode + 1) % 3;
                this._setElementState(pages, 'mode', modes[this._pageMode]);

                this.emit('pages-' + this._getElementState(pages, 'mode'));
            });
        },

        /**
         * Устанавливает режим отображения в нужный
         *
         * @param {String} mode
         */
        setPageViewMode: function (mode) {
            var pages = this._findElement('pages');
            var modes = ['auto', 'one', 'two'];
            this._setElementState(pages, 'mode', mode);
            this._pageMode = modes.indexOf(mode);
        },

        resetZoomButtons: function () {
            this._removeElementState(
                this._findElement('plus'),
                'disabled'
            );
            this._removeElementState(
                this._findElement('minus'),
                'disabled'
            );
        },
        disableZoomIn: function () {
            this._setElementState(
                this._findElement('plus'),
                'disabled'
            );
        },
        disableZoomOut: function () {
            this._setElementState(
                this._findElement('minus'),
                'disabled'
            );
        },

        resetArrows: function () {
            this._removeElementState(
                this.arrowLeft,
                'disabled'
            );
            this._removeElementState(
                this.arrowRight,
                'disabled'
            );
        },
        disableArrowNext: function () {
            this._setElementState(
                this.arrowRight,
                'disabled'
            );
        },
        disableArrowPrev: function () {
            this._setElementState(
                this.arrowLeft,
                'disabled'
            );
        },

        /**
         * Показывает блок с контролами контролы
         */
        show: function () {
            this._removeState('hidden');
        },
        /**
         * Показывает блок с контролами контролы
         */
        hide: function () {
            this._setState('hidden');
        }
    }, {
        getBlockName: function () {
            return 'controls';
        }
    });

    provide(Controls);
});
