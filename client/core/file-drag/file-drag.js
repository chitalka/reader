/* global FileReader */
modules.define(
    'file-drag',
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

    var FileDrag = inherit(YBlock, {
        __constructor: function (element) {
            this.__base.apply(this, arguments);

            if (!element) {
                return;
            }

            this._bindTo(element, 'dragstart', this._onDragOver.bind(this));
            this._bindTo(element, 'dragenter', this._onDragOver.bind(this));
            this._bindTo(element, 'dragover',  this._onDragOver.bind(this));

            this._bindTo(element, 'dragleave', this._onDragEnd.bind(this));
            this._bindTo(element, 'dragend',   this._onDragEnd.bind(this));
            this._bindTo(element, 'drop',      this._onDrop.bind(this));
        },

        /**
         * Действия по окончанию drag-событий
         *
         * @param {Event} e
         */
        _onDragEnd: function (e) {
            this._stopEvent(e);
            this._drag = false;

            setTimeout(function () {
                if (!this._drag) {
                    this.emit('hide-drag');
                }
            }.bind(this), 100);
        },

        /**
         * Действия во время drag-событий
         *
         * @param {Event} e
         */
        _onDragOver: function (e) {
            this._stopEvent(e);
            this._drag = true;
            this.emit('show-drag');
        },

        /**
         * Действия по бросания файла (drop-событие)
         *
         * @param {Event} e
         */
        _onDrop: function (e) {
            this._stopEvent(e);

            this.emit('hide-drag');

            var files = e.originalEvent.dataTransfer.files;

            if (files.length > 0 && window.FormData !== undefined && files[0]) {
                this.emit('file-dropped');
                var file = files[0];
                var reader = new FileReader();

                reader.onload = function (e) {
                    var res = e.target.result;
                    this.emit('file-loaded', {
                        result: res,
                        file: file
                    });
                }.bind(this);

                reader.readAsDataURL(file);
            }
        },

        /**
         * Останавливает всплытие события
         *
         * @param {Event} e событие
         */
        _stopEvent: function (e) {
            e.stopPropagation();
            e.preventDefault();
        }

    }, {
        getBlockName: function () {
            return 'file-drag';
        }
    });

    provide(FileDrag);
});
