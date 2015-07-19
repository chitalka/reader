module.exports = function (bt) {
    bt.setDefaultView('controls', 'default');

    bt.match('controls*', function (ctx) {
        var content = [];
        ctx.enableAutoInit();

        var arrows = ctx.getParam('arrows') || false;
        var zoom = ctx.getParam('zoom') || false;
        var footnotes = ctx.getParam('footnotes') || false;
        var pages = ctx.getParam('pages') || false;

        ctx.setInitOption('zoom', zoom);
        ctx.setInitOption('footnotes', footnotes);
        ctx.setInitOption('pages', pages);
        ctx.setState('hidden');

        if (arrows) {
            ctx.setInitOption('arrows', arrows);

            content.push([
                {
                    elem: 'arrow-left',
                    disabled: true
                },
                {
                    elem: 'arrow-right'
                }
            ]);
        }

        if (zoom || footnotes || pages) {

            content.push({
                elem: 'menu',
                zoom: zoom,
                footnotes: footnotes,
                pages: pages
            });
        }

        ctx.setContent(content);
    });

    bt.match('controls*__menu', function (ctx) {
        ctx.setState('state', 'closed');

        ctx.setContent([
            {
                elem: 'trigger'
            },
            {
                elem: 'buttons',
                zoom: ctx.getParam('zoom'),
                footnotes: ctx.getParam('footnotes'),
                pages: ctx.getParam('pages')
            }
        ]);
    });

    bt.match(['controls*__arrow-left', 'controls*__arrow-right'], function (ctx) {
        if (ctx.getParam('disabled')) {
            ctx.setState('disabled');
        }
        ctx.setContent({
            elem: 'arrow-inner'
        });
    });

    bt.match('controls*__buttons', function (ctx) {
        var content = [];
        var baseHeight = 42;
        var items = 0;

        if (ctx.getParam('zoom')) {
            items += 2;

            content.push({
                elem: 'plus',
                alt: 'Увеличить размер шрифта'
            }, {
                elem: 'minus',
                alt: 'Уменьшить размер шрифта'
            });
        }
        if (ctx.getParam('footnotes')) {
            items += 1;

            content.push({
                elem: 'footnotes',
                footnotes: ctx.getParam('footnotes')
            });
        }

        if (ctx.getParam('pages')) {
            items += 1;

            content.push({
                elem: 'pages',
                pages: ctx.getParam('pages')
            });
        }

        ctx.setAttr('style', 'height: ' + baseHeight * items + 'px');

        ctx.setContent(content);
    });

    bt.match('controls*__footnotes', function (ctx) {
        ctx.setState('mode', ctx.getParam('footnotes') || 'appendix');
        ctx.setAttr('title', 'Изменить режим отображения сносок');
        ctx.setContent([{
                elem: 'footnotes-anchor'
            }, {
                elem: 'footnotes-footnote'
            }
        ]);
    });
    bt.match('controls*__footnotes-anchor', function (ctx) {
        ctx.setTag('span');
        ctx.setContent('x');
    });
    bt.match('controls*__footnotes-footnote', function (ctx) {
        ctx.setTag('span');
        ctx.setContent('[x]');
    });

    bt.match('controls*__pages', function (ctx) {
        ctx.setState('mode', ctx.getParam('pages') || 'auto');
        ctx.setAttr('title', 'Изменить режим отображения страниц');
        ctx.setContent([{
                elem: 'pages-one'
            }, {
                elem: 'pages-two'
            }
        ]);
    });
    bt.match(['controls*__plus', 'controls*__minus'], function (ctx) {
        ctx.setAttr('title', ctx.getParam('alt'));
    });
};
