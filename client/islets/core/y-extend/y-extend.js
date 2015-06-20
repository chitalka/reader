/**
 * Предоставляет функцию для расширения объектов.
 */
modules.define('y-extend', function (provide) {

    var hasOwnProperty = Object.prototype.hasOwnProperty;
    var toString = Object.prototype.toString;

    /**
     * Проверяет, что переданный объект является "плоским" (т.е. созданным с помощью "{}"
     * или "new Object").
     *
     * @param {Object} obj
     * @returns {Boolean}
     */
    function isPlainObject(obj) {
        // Не являются плоским объектом:
        // - Любой объект или значение, чьё внутреннее свойство [[Class]] не равно "[object Object]"
        // - DOM-нода
        // - window
        return !(toString.call(obj) !== '[object Object]' ||
            obj.nodeType ||
            obj.window === window);
    }

    /**
     * Копирует перечислимые свойства одного или нескольких объектов в целевой объект.
     *
     * @param {Boolean} [deep=false] При значении `true` свойства копируются рекурсивно.
     * @param {Object} target Объект для расширения. Он получит новые свойства.
     * @param {...Object} objects Объекты со свойствами для копирования. Аргументы со значениями
     *      `null` или `undefined` игнорируются.
     * @returns {Object}
     */
    provide(function extend() {
        var target = arguments[0];
        var deep;
        var i;

        // Обрабатываем ситуацию глубокого копирования.
        if (typeof target === 'boolean') {
            deep = target;
            target = arguments[1];
            i = 2;
        } else {
            deep = false;
            i = 1;
        }

        for (; i < arguments.length; i++) {
            var obj = arguments[i];
            if (!obj) {
                continue;
            }

            for (var key in obj) {
                if (hasOwnProperty.call(obj, key)) {
                    var val = obj[key];
                    var isArray = false;

                    // Копируем "плоские" объекты и массивы рекурсивно.
                    if (deep && val && (isPlainObject(val) || (isArray = Array.isArray(val)))) {
                        var src = target[key];
                        var clone;
                        if (isArray) {
                            clone = src && Array.isArray(src) ? src : [];
                        } else {
                            clone = src && isPlainObject(src) ? src : {};
                        }
                        target[key] = extend(deep, clone, val);
                    } else {
                        target[key] = val;
                    }
                }
            }
        }

        return target;
    });
});
