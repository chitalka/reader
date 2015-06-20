modules.define(
    'y-focus-holder',
    ['inherit', 'jquery', 'y-event-emitter'],
    function (provide, inherit, $, YEventEmitter) {

    var YFocusHolder = inherit(YEventEmitter, {
        __constructor: function () {
            this._domElement = $('<button>focus</button>');
            this._domElement.css({
                position: 'absolute',
                top: '-1000px',
                left: '-1000px'
            });
            this._focused = false;
        },

        focus: function () {
            if (this._focused) {
                return;
            }
            this.emit('focus');
            this._domElement.on('blur', this._onBlur.bind(this));
            this._domElement.appendTo(document.body);
            this._domElement.focus();
            this._focused = true;
        },

        blur: function () {
            if (!this._focused) {
                return;
            }
            this._domElement.blur();
        },

        _onBlur: function () {
            this.emit('blur');
            this._domElement.remove();
            this._focused = false;
        },

        destruct: function () {
            this._domElement.remove();
        }

    });

    provide(YFocusHolder);
});
