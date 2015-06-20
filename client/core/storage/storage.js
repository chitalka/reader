modules.define(
    'storage',
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

    var localStorage = window.localStorage;

    var Storage = inherit(YBlock, {
        __constructor: function (storageId) {
            this.__base.apply(this, arguments);

            this._id = storageId;
            this._restore();
        },

        /**
         * Возвращает значение из хранилища
         *
         * @param {String} key ключ хранилища
         *
         * @returns {String} значение
         */
        get: function (key) {
            return this._data && this._data[key];
        },

        /**
         * Удаляет ключ из хранилища
         *
         * @param {String} key
         */
        remove: function (key) {
            delete this._data[key];

            this._save();
        },

        /**
         * Сохранить данные в хранилище
         *
         * @param {String|Object} key ключ сохраняемого или же объект с данными для хранения
         * @param {String} [value] значение параметра для хранения
         */
        save: function (key, value) {
            if (!value && typeof key === 'object') {
                extend(this._data, key);
            } else {
                this._data[key] = value;
            }
            this._save();

        },

        /**
         * Взять данные из storage и наполнить ими текущий объект
         */
        _restore: function () {
            this._data = localStorage.getItem(this._id) || {};

            if (typeof this._data === 'string') {
                try {
                    this._data = JSON.parse(this._data);
                } catch (e) {
                    this._data = {};
                }
            }

            if (typeof this._data !== 'object') {
                this._data = {};
            }
        },

        /**
         * Выполнить сохранение всех данных в localStoarage
         */
        _save: function () {
            localStorage.setItem(this._id, JSON.stringify(this._data));
        }
    }, {
        getBlockName: function () {
            return 'storage';
        }
    });

    provide(Storage);
});
