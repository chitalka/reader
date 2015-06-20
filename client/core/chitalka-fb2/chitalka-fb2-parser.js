/* global escape */

modules.define(
    'chitalka-fb2-parser',
    [
        'chitalka',
        'jquery',
        'inherit',
        'y-extend',
        'unzip'
    ],
    function (
        provide,
        Chitalka,
        $,
        inherit,
        extend,
        zip
    ) {

    var TIMEOUT = 2 * 1000;

    /**
     * Функция выполняет трансформацию строки в XMLDocument
     * @param {String} text
     *
     * @returns {Document} XMLDocument
     */
    var _parseXml = (function () {
        var parseXml;

        if (window.DOMParser) {
            parseXml = function (xmlStr) {
                return (new window.DOMParser()).parseFromString(xmlStr, 'text/xml');
            };
        } else if (typeof window.ActiveXObject !== 'undefined' && new window.ActiveXObject('Microsoft.XMLDOM')) {
            parseXml = function (xmlStr) {
                var xmlDoc = new window.ActiveXObject('Microsoft.XMLDOM');
                xmlDoc.async = 'false';
                xmlDoc.loadXML(xmlStr);
                return xmlDoc;
            };
        } else {
            parseXml = function () {
                return null;
            };
        }

        return parseXml;
    })();

    /**
     * По расщирению файла проверяет,
     * запакованный файл или нет
     * @param {string} url
     * @returns {boolean}
     * @private
     */
    var _isZipArchive = function (url) {
        return /(\.zip)$/i.test(url);
    };

    var parserFb2 = {
        unzip: function (url, encoding) {
            var d = $.Deferred();
            var isBase64 = /^data:/.test(url);

            // наша ручка /data/ проксируется на http://partnersdnld.litres.ru/static/trials
            //url = url.replace('http://partnersdnld.litres.ru/static/trials', '/data');

            zip.workerScriptsPath = window.document.location.pathname + 'lib/';
            zip.createReader((isBase64 ? new zip.Data64URIReader(url) : new zip.HttpReader(url)), function (reader) {
                // get all entries from the zip
                reader.getEntries(function (entries) {
                    if (!entries.length) {
                        return;
                    }
                    // get first entry content as text
                    entries[0].getData(new zip.TextWriter(encoding), function (str) {

                        // close the zip reader
                        reader.close(function () {
                            // onclose callback
                            d.resolve(str);
                        });

                    }, function (/*current, total*/) {
                        // onprogress callback
                    });
                });
            }, function (error) {
                // onerror callback
                d.reject(error);
            });

            return d.promise();
        },

        getXml: function (xmlStr) {
            var d = $.Deferred();

            var xml = _parseXml(xmlStr);
            d.resolve(xml);

            return d.promise();
        },

        /**
         * Читает файл по урлу или DataURI,
         * если файл в архиве - распаковывает.
         * @param {string} obj
         * @returns {Promise}
         */
        readFile: function (obj) {
            var url = obj.file ? obj.result : obj;

            if (/^data:/.test(url)) {

                return this._readAsDataUri(obj);
            }
            if (_isZipArchive(url)) {
                return this.unzip(url);
            }
            return $.ajax({
                url: url,
                dataType: 'text',
                contentType: 'text/plain',
                timeout: TIMEOUT
            });
        },

        /**
         * Читает файл по DataURI
         * @param {Object} obj
         * @param {String} obj.url данные из файла
         * @param {Blob} obj.file файл для чтения
         *
         * @returns {Promise}
         */
        _readAsDataUri: function (obj) {
            var file = obj.file;
            var url = file ? obj.result : obj;
            var mediaInfo = url.split(',')[0];
            var data = url.substring(url.indexOf(',') + 1);

            var encodingRegExp = /encoding=\"UTF\-8\"/;

            // zip-архив
            if (mediaInfo.indexOf('zip') > 0) {
                // Сразу возвращаем промис unzip, но затем перепроверяем результат относительно кодировки
                return this.unzip(url).then(function (res) {

                    // Если кодировка не UTF-8, то нужно перезиповать с учётом прочитанной кодировки
                    if (!encodingRegExp.test(res)) {
                        var encoding = /encoding="([^"]+)"/.exec(res)[1];

                        return this.unzip(url, encoding);
                    } else {
                    // Иначе результат
                        var d = $.Deferred();
                        d.resolve(res);

                        return d.promise();
                    }
                }.bind(this));

            // Иначе получили просто текст
            } else {
                var d = $.Deferred();

                // Магия чтения DataURI
                // INFO: https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/atob
                data = window.atob(data);

                // Опять же если кодировка не соответствует, то нужно перечитать файл
                if (!encodingRegExp.test(data)) {
                    var encoding = /encoding="([^"]+)"/.exec(data);

                    if (!encoding || !Array.isArray(encoding) || encoding.length > 1) {
                        d.reject('файл повреждён или книга неподдерживаемого формата');
                    } else {
                        encoding = encoding[1];

                        var reader = new FileReader();

                        reader.readAsText(file, encoding);
                        reader.onloadend = function () {
                            d.resolve(reader.result);
                        };
                    }
                } else {
                    try {
                        var result = decodeURIComponent(escape(data));
                        d.resolve(result);
                    } catch (e) {
                        d.reject(e);
                    }
                }

                return d.promise();
            }
        }
    };

    provide(parserFb2);
});
