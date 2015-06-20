modules.define('y-throttle', function (provide) {
    /**
     * Возвращает новую функцию, которая при повторных вызовах,
     * вызывает функцию func не чаще одного раза в заданный
     * промежуток wait.
     *
     * Полезна для использования при обработке событий, которые
     * происходят слишком часто.
     *
     * @name throttle
     * @param {Function} func
     * @param {Number} wait Минимальный промежуток времени в миллисекундах,
     *      который должен пройти между вызовами func.
     * @param {Object} [options]
     * @param {Boolean} [options.leading=true] Включает исполнение функции вначале.
     * @param {Boolean} [options.trailing=true] Включает исполнение функции вконце.
     * @returns {Function}
     *
     * @example
     * var updatePosition = function () {};
     * var throttled = throttle(updatePosition, 100);
     * $(window).scroll(throttled);
     */
    provide(function (func, wait, options) {
        var context;
        var args;
        var result;
        var timeout = null;
        var previous = 0;
        options = options || {};

        var later = function () {
            previous = options.leading === false ? 0 : Date.now();
            timeout = null;
            result = func.apply(context, args);
        };

        return function () {
            var now = Date.now();
            if (!previous && options.leading === false) {
                previous = now;
            }
            var remaining = wait - (now - previous);
            context = this;
            args = arguments;
            if (remaining <= 0) {
                clearTimeout(timeout);
                timeout = null;
                previous = now;
                result = func.apply(context, args);
            } else if (!timeout && options.trailing !== false) {
                timeout = setTimeout(later, remaining);
            }
            return result;
        };
    });
});
