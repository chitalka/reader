module.exports = function (bt) {

    /**
     * @param {Bemjson} body Содержимое страницы. Следует использовать вместо `content`.
     * @param {String} doctype Доктайп. По умолчанию используется HTML5 doctype.
     * @param {Object[]} styles Набор CSS-файлов для подключения.
     *                          Каждый элемент массива должен содержать ключ `url`, содержащий путь к файлу.
     * @param {Object[]} scripts Набор JS-файлов для подключения.
     *                           Каждый элемент массива должен содержать ключ `url`, содержащий путь к файлу.
     * @param {Bemjson} head Дополнительные элементы для заголовочной части страницы.
     * @param {String} favicon Путь к фавиконке.
     */

    bt.setDefaultView('y-page', 'islet');

    bt.match('y-page_islet*', function (ctx) {
        var styleElements;
        var styles = ctx.getParam('styles');
        if (styles) {
            styleElements = styles.map(function (style) {
                return {
                    elem: 'css',
                    url: style.url,
                    ie: style.ie
                };
            });
        }
        return [
            ctx.getParam('doctype') || '<!DOCTYPE html>',
            {
                elem: 'html',
                content: [
                    {
                        elem: 'head',
                        content: [
                            [
                                {
                                    elem: 'meta',
                                    charset: 'utf-8'
                                },
                                ctx.getParam('x-ua-compatible') === false ?
                                    false :
                                    {
                                        elem: 'meta',
                                        'http-equiv': 'X-UA-Compatible',
                                        content: ctx.getParam('x-ua-compatible') || 'IE=edge'
                                    },
                                {
                                    elem: 'title',
                                    content: ctx.getParam('title')
                                },
                                ctx.getParam('favicon') ?
                                    {
                                        elem: 'favicon',
                                        url: ctx.getParam('favicon')
                                    } :
                                    '',
                                {
                                    block: 'y-ua'
                                }
                            ],
                            styleElements,
                            ctx.getParam('head')
                        ]
                    },
                    ctx.getJson()
                ]
            }
        ];
    });

    bt.match('y-page_islet*', function (ctx) {
        ctx.setTag('body');
        ctx.enableAutoInit();
        var scriptElements;
        var scripts = ctx.getParam('scripts');
        if (scripts) {
            var global = bt.lib.global;
            scriptElements = scripts.map(function (script) {
                return {
                    elem: 'js',
                    url: script.url ? script.url.replace('{lang}', global.lang) : undefined,
                    source: script.source
                };
            });
        }
        ctx.setContent([ctx.getParam('body'), scriptElements]);
    });

    bt.match('y-page_islet*__title', function (ctx) {
        ctx.disableCssClassGeneration();
        ctx.setTag('title');
        ctx.setContent(ctx.getParam('content'));
    });

    bt.match('y-page_islet*__html', function (ctx) {
        ctx.setTag('html');
        ctx.disableCssClassGeneration();
        ctx.setAttr('class', 'y-ua_js_no y-ua_css_standard');
        ctx.setContent(ctx.getParam('content'));
    });

    bt.match('y-page_islet*__head', function (ctx) {
        ctx.setTag('head');
        ctx.disableCssClassGeneration();
        ctx.setContent(ctx.getParam('content'));
    });

    bt.match('y-page_islet*__meta', function (ctx) {
        ctx.setTag('meta');
        ctx.disableCssClassGeneration();
        ctx.setAttr('content', ctx.getParam('content'));
        ctx.setAttr('http-equiv', ctx.getParam('http-equiv'));
        ctx.setAttr('charset', ctx.getParam('charset'));
    });

    bt.match('y-page_islet*__favicon', function (ctx) {
        ctx.disableCssClassGeneration();
        ctx.setTag('link');
        ctx.setAttr('rel', 'shortcut icon');
        ctx.setAttr('href', ctx.getParam('url'));
    });

    bt.match('y-page_islet*__js', function (ctx) {
        ctx.disableCssClassGeneration();
        ctx.setTag('script');
        var url = ctx.getParam('url');
        if (url) {
            ctx.setAttr('src', url);
        }
        var source = ctx.getParam('source');
        if (source) {
            ctx.setContent(source);
        }
        ctx.setAttr('type', 'text/javascript');
    });

    bt.match('y-page_islet*__css', function (ctx) {
        ctx.disableCssClassGeneration();
        var url = ctx.getParam('url');

        if (url) {
            ctx.setTag('link');
            ctx.setAttr('rel', 'stylesheet');
            ctx.setAttr('href', url);
        } else {
            ctx.setTag('style');
        }

        var ie = ctx.getParam('ie');
        if (ie !== undefined) {
            if (ie === true) {
                return ['<!--[if IE]>', ctx.getJson(), '<![endif]-->'];
            } else if (ie === false) {
                return ['<!--[if !IE]> -->', ctx.getJson(), '<!-- <![endif]-->'];
            } else {
                return ['<!--[if ' + ie + ']>', ctx.getJson(), '<![endif]-->'];
            }
        }
    });

};
