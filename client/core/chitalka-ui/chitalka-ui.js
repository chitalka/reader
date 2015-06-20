modules.define(
    'chitalka-ui',
    [
        'controls',
        'y-block',
        'jquery',
        'y-extend',
        'spin',
        'file-drag',
        'inherit'
    ],
    function (
        provide,
        Controls,
        YBlock,
        $,
        extend,
        Spin,
        FileDrag,
        inherit
    ) {

    var ChitalkaUI = inherit(YBlock, {
        __constructor: function () {
            this.__base.apply(this, arguments);

            //var params = extend({
                //menu: false,
                //progress: false
            //}, this._getOptions());
        },

        init: function (chitalka) {
            this._chitalka = chitalka;

            this._bindTo(this._chitalka, 'ready', this._onBookLoaded.bind(this));

            if (this._getOptions().controls) {
                this._initControls();
            }

            if (this._getOptions().progress) {
                this._initProgress();
            }

            if (this._getOptions()['progress-bar']) {
                this._initProgressBar();
            }

            if (this._getOptions().annotations) {
                this._initAnnotationsControl();
            }

            this._initEstimated();

            this._initDragListeners();

            return this;
        },

        _initControls: function () {
            this._controls = Controls.find(this.getDomNode());

            if (this._getOptions().controls.arrows) {
                this._initArrows();
            }

            this._bindTo(this._chitalka, 'ready', function () {
                if (this._getOptions().controls.zoom) {
                    this._controls.setFootnotesMode(this._chitalka.getFootnotesMode());
                    this._controls.setPageViewMode(this._chitalka.getPageViewMode());
                    this._initMenu();
                }
            }.bind(this));
        },

        _initArrows: function () {
            this._bindTo(this._controls, 'next-page', function () {
                this._chitalka.nextPage();
            });
            this._bindTo(this._controls, 'previous-page', function () {
                this._chitalka.previousPage();
            });

            this._bindTo(this._chitalka, 'page-changed', function () {
                 this._updateArrows();
            });
        },

        _initMenu: function () {
            this._bindTo(this._controls, 'zoom-in', function () {
                this._chitalka.zoomIn();
            });
            this._bindTo(this._controls, 'zoom-out', function () {
                this._chitalka.zoomOut();
            });

            this._bindTo(this._controls, 'footnotes-appendix', function () {
                this._chitalka.setFootnotesMode('appendix');
            });
            this._bindTo(this._controls, 'footnotes-inline', function () {
                this._chitalka.setFootnotesMode('inline');
            });

            this._bindTo(this._controls, 'pages-one', function () {
                this._chitalka.setPageViewMode('one');
                this._setState('mode', 'one-page');
            });
            this._bindTo(this._controls, 'pages-two', function () {
                this._chitalka.setPageViewMode('two');
                this._setState('mode', 'two-page');
            });
            this._bindTo(this._controls, 'pages-auto', function () {
                this._chitalka.setPageViewMode();
                this._removeState('mode');
            });

            this._bindTo(this._chitalka, 'disabled-zoom-in', function () {
                this._controls.disableZoomIn();
            });
            this._bindTo(this._chitalka, 'disabled-zoom-out', function () {
                this._controls.disableZoomOut();
            });
            this._bindTo(this._chitalka, 'reset-zoom-buttons', function () {
                this._controls.resetZoomButtons();
            });

            this._bindTo(this._chitalka, 'load-fail', function () {
                this._noBook();
                this._fileLoaded = false;
            }.bind(this));
        },

        /**
         * Переводит ui в состояние «нет книги
         */
        _noBook: function () {
            this._setState('no-book');
            Spin.find(this._findElement('loader')).stop();
        },

        /**
         * Активировать слушатели drag-событий
         */
        _initDragListeners: function () {
            this._drag = new FileDrag(this.getDomNode());

            this._bindTo(this._drag, 'show-drag', this._showDrag.bind(this));
            this._bindTo(this._drag, 'hide-drag', this._hideDrag.bind(this));
            this._bindTo(this._drag, 'file-dropped', this._onFileDropped.bind(this));
            this._bindTo(this._drag, 'file-loaded', this._onFileLoaded.bind(this));
        },

        /**
         * Активировать состояние drag
         */
        _showDrag: function () {
            this._setState('drag');
            this._removeState('no-book');
            this._controls.hide();
        },

        /**
         * Убрать состояние drag
         */
        _hideDrag: function () {
            if (this._fileLoaded) {
                this._removeState('drag');
                this._controls.show();
            }
        },

        /**
         * Действия по киданию файла внутрь интерфейса
         */
        _onFileDropped: function () {
            this._fileLoaded = true;
            this.loading();
        },

        /**
         * Действия по загрузке файла
         * @param {Event} e
         */
        _onFileLoaded: function (e) {
            this._chitalka._prepareBook(e.data).then(function () {
                this._removeState('drag');
                this._controls.show();
            }.bind(this));
        },

        /**
         * Вернуть UI в состояние «загрузка»
         */
        loading: function () {
            // Остановить кручения спиннера
            Spin.find(this._findElement('loader')).start();

            // Убирает стейт загрузки с текущего элемента
            this._setState('loading');

            // Показываем блок с контролами
            this._controls.hide();

        },

        /**
         * Действия после загрузки книги
         * @private
         */
        _onBookLoaded: function () {
            this._fileLoaded = true;

            // Остановить кручения спиннера
            Spin.find(this._findElement('loader')).stop();

            // Убирает стейт загрузки с текущего элемента
            this._removeState('loading');

            // Показываем блок с контролами
            this._controls.show();

        },

        /**
         * Если текущая страница первая/последняя,
         * то левая/правая(соответственно) стралка дизейблится.
         * @private
         */
        _updateArrows: function () {
            this._controls.resetArrows();

            if (this._chitalka.isFirstPage()) {
                this._controls.disableArrowPrev();
            }

            if (this._chitalka.isLastPage()) {
                this._controls.disableArrowNext();
            }
        },

        /**
         * Инициализация элемента, который отображает
         * номер текущей страницы из общего количества страниц
         * @private
         */
        _initProgress: function () {
            this._progress = this._findElement('progress');

            this._bindTo(this._chitalka, 'page-changed', this._updateProgress.bind(this));
            this._bindTo(this._chitalka, 'ready', this._updateProgress.bind(this));
        },

        /**
         * Инициализация элемента, который отображает
         * номер текущей страницы из общего количества страниц
         * @private
         */
        _initEstimated: function () {
            this._estimated = this._findElement('estimated');

            this._bindTo(this._chitalka, 'page-changed', this._updateEstimated.bind(this));
            this._bindTo(this._chitalka, 'ready', this._updateEstimated.bind(this));
        },

        _updateEstimated: function () {
            var estimatedTime = this._chitalka.getEstimatedTime();
            var estimatedPhrase = 'До конца книги ' +
                (estimatedTime[0] ? estimatedTime[0] + ' ч ' : '') +
                estimatedTime[1] + ' м';
            this._estimated.html(estimatedPhrase);
        },

        /**
         * Обновляет состояние элемента прогресса
         */
        _updateProgress: function () {
            this._progress.html(this._chitalka.getCurrentPage() + ' из ' + this._chitalka.getTotalPages());
        },

        /**
         * Инициализация прогресс-бара
         * @private
         */
        _initProgressBar: function () {
            this._progressBar = this._findElement('progress-bar');

            this._bindTo(this._chitalka, 'page-changed', function () {
                var progress = this._getCurrentProgress() + '%';

                this._progressBar.width(progress);
                this._progressBar.attr('title', progress);
            });
        },

        /**
         * Инициализация элемента работы с аннотациями
         * @private
         */
        _initAnnotationsControl: function () {
            this._backTo = this._findElement('back-to-page');
            var counter = 0;

            this._bindTo(this._chitalka, 'page-changed', function () {
                var prevPage = this._chitalka.getBackPage();

                // Когда нет prevPage значит его сбросили и надо убрать «возвращатор»
                if (!prevPage || counter === 1) {
                    this._setBackTo();
                    this._chitalka.resetBackPage();
                    counter = 0;
                } else if (counter) {
                    counter--;
                } else if (prevPage) {
                    this._setBackTo('Вернуться на страницу ' + prevPage);

                    // Сколько страниц даём пролистнуть
                    counter = 3;
                } else {
                    this._setBackTo();
                }
            });

            this._bindTo(this._backTo, 'click', function () {
                this._setBackTo();
                this._chitalka.moveBackFromAnnotation();
                counter = 0;
            });
        },

        _setBackTo: function (text) {
            if (text) {
                this._setElementState(this._backTo, 'visible');
                this._backTo.html(text);
            } else {
                this._removeElementState(this._backTo, 'visible');
            }
        },

        /**
         * Возвращает процент прочтения
         * @returns {number}
         * @private
         */
        _getCurrentProgress: function () {
            return ((this._chitalka.getCurrentPage() / this._chitalka.getTotalPages()) * 100).toFixed(2);
        }

    }, {
        getBlockName: function () {
            return 'chitalka-ui';
        }
    });

    provide(ChitalkaUI);
});
