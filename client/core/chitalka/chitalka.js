modules.define(
    'chitalka',
    [
        'y-block',
        'jquery',
        'inherit',
        'y-extend',
        'chitalka-ui',
        'hammer',
        'storage'
    ],
    function (
        provide,
        YBlock,
        $,
        inherit,
        extend,
        ChitalkaUI,
        Hammer,
        Storage
    ) {

    var doc = $(document);

    var reportUnimplemented = function (method) {
        throw new Error('UNIMPLEMENTED METHOD: ' + method);
    };

    /**
     * Detect if device is touch
     * @see http://stackoverflow.com/questions/4817029/whats-the-best-way-to-detect-a-touch-screen-device-using-javascript
     */
    var isTouch = function () {
        return 'ontouchstart' in window // works on most browsers 
            || 'onmsgesturechange' in window; // works on ie10
    };

    /**
     * Расширение объекта Math для вычисления медианы массива
     *
     * @param {Array} array
     * @returns {Number} медиана
     */
    Math.median = function (array) {
        if (!array) {
            return;
        }

        var entries = array.length;
        var median;

        if (entries % 2 === 0) {
            median = (array[entries / 2] + array[entries / 2 - 1]) / 2;
        } else {
            median = array[(entries - 1) / 2];
        }

        return median;
    };

    /**
     * Выбирает из массива массив медиан в заданном количестве
     *
     * @param {Array} array
     * @param {Number} q количество
     *
     * @return {Array}
     */
    var limitArrayByMedians = function (array, q) {
        var result = [];

        if (!Array.isArray(array)) {
            return result;
        }
        if (array.length <= q) {
            return array;
        }

        var median = Math.median(array);
        var index = array.indexOf(median);
        var start = Math.round(index - q / 2);

        return array.splice(start, q);
    };

    /**
     * Хэлпер для сортировки массивов чисел
     *
     * @param {Number} a
     * @param {Number} b
     * @returns {Number} 1 - a >=b, else -1
     */
    var numSort = function (a, b) {
        a = parseInt(a, 10);
        b = parseInt(b, 10);

        return a >= b ? 1 : -1;
    };

    var Chitalka = inherit(YBlock, {
        __constructor: function () {
            this.__base.apply(this, arguments);

            var params = extend({
                keyboard: false,
                touch: false,
                controls: false,

                fontSize: [9, 21],

                // Длина свайпа в пикселах
                swipeLength: 20
            }, this._getOptions());

            this._defaultFontSize = 15;
            this._settings = new Storage('settings');

            // Если читалка не доступна, то кидаем событие и больше
            // ничего не делаем
            if (!this._isAvailable()) {
                this.emit('unavailable');

                return;
            }

            if (params.keyboard) {
                this._initKeyboardEvents();
            }

            if (params.touch) {
                isTouch() && this._initTouchEvents();
            }

            this._fontSizeLimits = params.fontSize;

            this._setUpSpeed();
            this._initUI();
        },

        /**
         * Выставить скорость чтения книги
         */
        _setUpSpeed: function () {
            this._speed = Math.median(this._settings.get('speeds')) || 500;
        },

        _isAvailable: function () {
            return false;
        },

        /**
         * Активирует реакцию читалки на события с клавиатуры
         */
        _initKeyboardEvents: function () {
            this._bindTo(doc, 'keydown', this._onKeyDown);
        },

        /**
         * Активирует реакцию читалки на события блока «Controls»
         */
        _initUI: function () {
            this._ui = ChitalkaUI.find(doc).init(this);

            //var controls = Controls.find(this.getDomNode());
        },

        /**
         * Активация обработки тач-событий (в частности события swipe)
         * в функции выполняется навешивание соответствующих событий
         */
        _initTouchEvents: function () {
            this._swiper = new Hammer(this.getDomNode()[0]);

            this._swiper.on('swipe', function(e) {
                var direction = (e.direction === 2)? 'left' : 'right';

                switch (direction) {
                    case 'left': 
                        this.nextPage();
                        break;

                    case 'right': 
                        this.previousPage();
                        break;
                }
            }.bind(this));

        },

        _onKeyDown: function (e) {
            switch (e.keyCode) {
                // Fn + Right
                case 35:
                    this.lastPage();
                    break;

                // Fn + Left
                case 36:
                    this.firstPage();
                    break;

                // Left
                case 37:
                    this.previousPage();
                    e.preventDefault();
                    break;

                // Right
                case 39:
                    this.nextPage();
                    e.preventDefault();
                    break;

                // +
                case 61:
                case 187:
                    this.zoomIn();

                    if (e.metaKey) {
                        e.preventDefault();
                    }
                    break;

                // -
                case 173:
                case 189:
                    this.zoomOut();
                    if (e.metaKey) {
                        e.preventDefault();
                    }
                    break;

                // reset
                case 48:
                    if (e.metaKey) {
                        this.zoomReset();
                    }
                    break;
            }
        },

        /**
         * События перемещения по книге
         */
        firstPage: function () {
            reportUnimplemented('firstPage');
        },
        previousPage: function () {
            reportUnimplemented('previousPage');
        },
        nextPage: function () {
            reportUnimplemented('nextPage');
        },
        lastPage: function () {
            reportUnimplemented('lastPage');
        },

        /**
         * Функция сохранения скорости в аккумулируемый объект
         *
         * @param {Number} speed
         */
        _storeSpeed: function (speed) {
            this._speedAccumulator = this._speedAccumulator || [];

            if (this._speedAccumulator.length > 9) {
                do {
                    this._speedAccumulator.shift();
                } while (this._speedAccumulator.length !== 9);
            }
            this._speedAccumulator.push(speed);

            this._speedAccumulator = this._speedAccumulator.sort(numSort);
        },

        /**
         * Функция проверки скорости и её корректировки
         * общий принцип работы:
         * есть два массива
         *    this._speedAccumulator – аккумулирует чтение текущей книги
         *    speeds, который хранится в сторадже settings – хранит 10 меток скорости для пользователя
         * метки – это медианы, которые всегда вычисляются из аккумулятора
         * как только пользователь прочитывает 10 и более страниц, мы начинаем считать медиану и
         * править speeds и класть туда новую скорость, вычисленную из аккумулятора
         * При этом глобальная скорость чтения значительно изменится только если пользователь прочитает
         * 15 страниц значительно быстрее/медленнее чем раньше.
         * Во всех остальных случаях медиана поменяется совсем незначительно
         */
        _checkSpeed: function () {
            var speedEntries = this._speedAccumulator.length;
            if (speedEntries >= 10) {
                this._speedAccumulator = this._speedAccumulator.sort(numSort);

                var median = Math.median(this._speedAccumulator);

                // Отсекаем совсем неадекватные скорости
                if (median < 100000 && median > 10) {
                    this._speedAccumulator = this._speedAccumulator.sort(numSort);
                    if (!this._settings.get('speeds')) {
                        this._settings.save({
                            speeds: this._speedAccumulator
                        });
                    } else {
                        var speeds = limitArrayByMedians(this._settings.get('speeds'), 10);

                        if (speeds.length < 10) {
                            speeds.push(median);
                        } else {
                            if (median <= speeds[5]) {
                                speeds.pop();
                                speeds.unshift(median);
                            } else {
                                speeds.shift();
                                speeds.push(median);
                            }
                        }
                        speeds = speeds.sort(numSort);

                        this._settings.save({
                            speeds: speeds
                        });
                    }
                    this._speed = Math.median(this._settings.get('speeds'));
                }
            }
        },

        /**
         * Вернуть текущую скорость чтения
         * @returns {Number}
         */
        getSpeed: function () {
            return this._speed;
        },

        /**
         * События зума книги
         */
        zoomIn: function () {
            reportUnimplemented('zoomIn');
        },
        zoomOut: function () {
            reportUnimplemented('zoomOut');
        },
        zoomReset: function () {
            reportUnimplemented('zoomReset');
        }

    });

    provide(Chitalka);
});
