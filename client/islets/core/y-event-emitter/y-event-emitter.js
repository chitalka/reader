modules.define(
    'y-event-emitter',
    ['inherit'],
    function (provide, inherit) {

    var slice = Array.prototype.slice;

    /**
     * @name YEventEmitter
     */
    var YEventEmitter = inherit({
        /**
         * Добавляет обработчик события.
         *
         * @param {String} event
         * @param {Function} callback
         * @param {Object} [context]
         * @returns {YEventEmitter}
         */
        on: function (event, callback, context) {
            if (typeof callback !== 'function') {
                throw new TypeError('callback must be a function');
            }

            if (!this._events) {
                this._events = {};
            }

            var listener = {
                callback: callback,
                context: context
            };

            var listeners = this._events[event];
            if (listeners) {
                listeners.push(listener);
            } else {
                this._events[event] = [listener];
                this._onAddEvent(event);
            }

            return this;
        },

        /**
         * Добавляет обработчик события, который исполнится только 1 раз, затем удалится.
         *
         * @param {String} event
         * @param {Function} callback
         * @param {Object} [context]
         * @returns {YEventEmitter}
         */
        once: function (event, callback, context) {
            if (typeof callback !== 'function') {
                throw new TypeError('callback must be a function');
            }

            var _this = this;

            function once() {
                _this.off(event, once, context);
                callback.apply(context, arguments);
            }

            // Сохраняем ссылку на оригинальный колбэк. Благодаря этому можно удалить колбэк `once`,
            // используя оригинальный колбэк в методе `off()`.
            once._callback = callback;

            this.on(event, once, context);
            return this;
        },

        /**
         * Удаляет обработчик события.
         *
         * @param {String} event
         * @param {Function} callback
         * @param {Object} [context]
         * @returns {YEventEmitter}
         */
        off: function (event, callback, context) {
            if (typeof callback !== 'function') {
                throw new TypeError('callback must be a function');
            }

            if (!this._events) {
                return this;
            }

            var listeners = this._events[event];
            if (!listeners) {
                return this;
            }

            var len = listeners.length;
            for (var i = 0; i < len; i++) {
                var listener = listeners[i];
                var cb = listener.callback;
                if ((cb === callback || cb._callback === callback) && listener.context === context) {
                    if (len === 1) {
                        delete this._events[event];
                        this._onRemoveEvent(event);
                    } else {
                        listeners.splice(i, 1);
                    }
                    break;
                }
            }

            return this;
        },

        /**
         * Удаляет все обработчики всех событий или все обработчики переданного события `event`.
         *
         * @param {String} [event]
         * @returns {YEventEmitter}
         */
        offAll: function (event) {
            if (this._events) {
                if (event) {
                    if (this._events[event]) {
                        delete this._events[event];
                        this._onRemoveEvent(event);
                    }
                } else {
                    for (event in this._events) {
                        if (this._events.hasOwnProperty(event)) {
                            this._onRemoveEvent(event);
                        }
                    }
                    delete this._events;
                }
            }
            return this;
        },

        /**
         * Исполняет все обработчики события `event`.
         *
         * @param {String} event
         * @param {...*} [args] Аргументы, которые будут переданы в обработчики события.
         * @returns {YEventEmitter}
         */
        emit: function (event) {
            if (!this._events) {
                return this;
            }

            var listeners = this._events[event];
            if (!listeners) {
                return this;
            }

            // Копируем массив обработчиков, чтобы добавление/удаление обработчиков внутри колбэков не оказывало
            // влияния в цикле.
            var listenersCopy = listeners.slice(0);
            var len = listenersCopy.length;
            var listener;
            var i = -1;

            switch (arguments.length) {
                // Оптимизируем наиболее частые случаи.
                case 1:
                    while (++i < len) {
                        listener = listenersCopy[i];
                        listener.callback.call(listener.context);
                    }
                    break;
                case 2:
                    while (++i < len) {
                        listener = listenersCopy[i];
                        listener.callback.call(listener.context, arguments[1]);
                    }
                    break;
                case 3:
                    while (++i < len) {
                        listener = listenersCopy[i];
                        listener.callback.call(listener.context, arguments[1], arguments[2]);
                    }
                    break;
                default:
                    var args = slice.call(arguments, 1);
                    while (++i < len) {
                        listener = listenersCopy[i];
                        listener.callback.apply(listener.context, args);
                    }
            }

            return this;
        },

        /**
         * Вызывается когда было добавлено новое событие.
         *
         * @protected
         * @param {String} event
         */
        _onAddEvent: function () {},

        /**
         * Вызывается когда все обработчики события были удалены.
         *
         * @protected
         * @param {String} event
         */
        _onRemoveEvent: function () {}
    });

    provide(YEventEmitter);
});
