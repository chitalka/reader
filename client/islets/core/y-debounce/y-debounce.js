modules.define('y-debounce', function (provide) {
    /**
     * Вернет версию функции, исполнение которой начнется не ранее,
     * чем истечет промежуток wait, после ее последнего вызова.
     *
     * Полезно для реализации логики, которая зависит от завершения
     * действий пользователя. Например, проверить орфографию комментария
     * пользователя лучше будет после того, как он его окончательно введет,
     * а динамечески перерассчитать разметку после того, как пользователь
     * закончит изменять размер окна.
     *
     * @name debounce
     * @param {Function} func
     * @param {Number} wait
     * @param {Boolean} [immediate=false] Если true, выполнит функцию в начале
     *      интервала wait, иначе - в конце.
     * @returns {Function}
     *
     * @example
     * var calculateLayout = function() {};
     * var lazyLayout = debounce(calculateLayout, 300);
     * $(window).resize(lazyLayout);
     */
    provide(function (func, wait, immediate) {
        var result;
        var timeout = null;
        return function () {
            var context = this;
            var args = arguments;
            var later = function () {
                timeout = null;
                if (!immediate) {
                    result = func.apply(context, args);
                }
            };
            var callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) {
                result = func.apply(context, args);
            }
            return result;
        };
    });
});
