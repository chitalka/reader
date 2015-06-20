/**
 * Загружает js-файлы добавляя тэг <script> в DOM.
 */
modules.define('y-load-script', function (provide) {
    var loading = {};
    var loaded = {};
    var head = document.getElementsByTagName('head')[0];

    /**
     * @param {String} path
     */
    function onLoad(path) {
        loaded[path] = true;
        var cbs = loading[path];
        delete loading[path];
        cbs.forEach(function (cb) {
            cb();
        });
    }

    /**
     * Загружает js-файл по переданному пути `path` и вызывает
     * колбэк `cb` по окончании загрузки.
     *
     * @name loadScript
     * @param {String} path
     * @param {Function} cb
     */
    provide(function (path, cb) {
        if (loaded[path]) {
            cb();
            return;
        }

        if (loading[path]) {
            loading[path].push(cb);
            return;
        }

        loading[path] = [cb];

        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.charset = 'utf-8';
        // Добавляем `http:` к `//` если страница была открыта, используя `file://`-протокол.
        // Полезно для тестирования через PhantomJS, локальной отладки с внешними скриптами.
        script.src = (location.protocol === 'file:' && path.indexOf('//') === 0 ? 'http:' : '') + path;

        if (script.onreadystatechange === null) {
            script.onreadystatechange = function () {
                var readyState = this.readyState;
                if (readyState === 'loaded' || readyState === 'complete') {
                    script.onreadystatechange = null;
                    onLoad(path);
                }
            };
        } else {
            script.onload = script.onerror = function () {
                script.onload = script.onerror = null;
                onLoad(path);
            };
        }

        head.insertBefore(script, head.lastChild);
    });
});
