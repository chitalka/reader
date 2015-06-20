modules.define(
    'y-block-mixin',
    ['inherit', 'y-event-emitter', 'y-event-manager'],
    function (provide, inherit, YEventEmitter, YEventManager) {

    var YBlockMixin = inherit(YEventEmitter, {
        __constructor: function (blockInstance, options) {
            this._block = blockInstance;
            this._options = options;
            this._eventManager = new YEventManager(this);
        },

        _getBlock: function () {
            return this._block;
        },

        _bindTo: function (emitter, event, callback) {
            this._eventManager.bindTo(emitter, event, callback);
            return this;
        }
    }, {

        /**
         * Возвращает имя миксина.
         * Этот метод следует перекрывать при создании новых миксинов.
         *
         * @static
         * @returns {String|null}
         *
         * @example
         * provide(inherit(YBlockMixin, {}, {
         *     getMixinName: function() {
         *         return 'auto-focus';
         *     }
         * });
         */
        getMixinName: function () {
            return 'y-block-mixin';
        },

        fromBlock: function (blockInstance, options) {
            var mixinName = this.getMixinName();
            var mixins = this._getMixinsFromDomNode(blockInstance.getDomNode());
            if (!mixins[mixinName]) {
                var Mixin = this;
                mixins[mixinName] = new Mixin(blockInstance, options);
            }
            return mixins[mixinName];
        },

        /**
         * Возвращает инстанции миксинов для данного DOM-элемента.
         *
         * @param {jQuery} domNode
         * @param {Boolean} [skipCreating]
         */
        _getMixinsFromDomNode: function (domNode, skipCreating) {
            var data = domNode.data(this._mixinsStorageKey);
            if (!data && !skipCreating) {
                data = {};
                domNode.data(this._mixinsStorageKey, data);
            }
            return data;

        },

        _mixinsStorageKey: 'y-block-mixin'
    });
    provide(YBlockMixin);
});
