/**
 * Модуль для генерации уникальных идентификаторов.
 */
modules.define('y-unique-id', function (provide) {

    // Префикс имеет 3 применения:
    // - гарантирует уникальность идентификаторов для каждой загрузки страницы
    // - имя свойства, в котором хранятся id, выданные объектам
    // - уникальный id для window
    var prefix = 'id_' + Date.now() + Math.round(Math.random() * 10000);
    var counterId = 0;

    provide({
        /**
         * Генерирует уникальный идентификатор.
         *
         * @returns {String}
         */
        generate: function () {
            return prefix + (++counterId);
        },

        /**
         * Генерирует уникальный идентификатор и присваивает его переданному объекту.
         * Если объект уже имеет идентификатор, просто возвращает его.
         *
         * @param {Object} obj
         * @returns {String}
         */
        identify: function (obj) {
            return obj === window ? prefix : obj[prefix] || (obj[prefix] = this.generate());
        },

        /**
         * Возвращает `true`, если объект имеет уникальный идентификатор.
         *
         * @param {Object} obj
         * @returns {Boolean}
         */
        isIdentified: function (obj) {
            return obj.hasOwnProperty(prefix);
        }
    });
});
