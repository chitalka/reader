modules.define(
    'y-block-event',
    [
        'inherit'
    ],
    function (
        provide,
        inherit
    ) {

    /**
     * Класс, представляющий событие блока.
     */
    var YBlockEvent = inherit({
        /**
         * @param {String} type Тип события.
         * @param {Boolean} [isPropagationStopped=false] Запрещает распространение события.
         * @param {Boolean} [isDefaultPrevented=false] Запрещает действие по умолчанию.
         */
        __constructor: function (type, isPropagationStopped, isDefaultPrevented) {
            this.type = type;
            this._isPropagationStopped = Boolean(isPropagationStopped);
            this._isDefaultPrevented = Boolean(isDefaultPrevented);
        },

        /**
         * Определяет, прекращено ли распространение события.
         *
         * @returns {Boolean}
         */
        isPropagationStopped: function () {
            return this._isPropagationStopped;
        },

        /**
         * Проверяет, отменена ли реакция по умолчанию на событие.
         *
         * @returns {Boolean}
         */
        isDefaultPrevented: function () {
            return this._isDefaultPrevented;
        },

        /**
         * Прекращает распространение события.
         */
        stopPropagation: function () {
            this._isPropagationStopped = true;
        },

        /**
         * Отменяет реакцию по умолчанию на событие.
         */
        preventDefault: function () {
            this._isDefaultPrevented = true;
        }
    });

    provide(YBlockEvent);
});
