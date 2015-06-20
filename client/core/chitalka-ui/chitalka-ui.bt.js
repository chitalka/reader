module.exports = function (bt) {
    bt.match('chitalka-ui', function (ctx) {
        ctx.enableAutoInit();

        var content = [];

        if (ctx.getParam('controls')) {
            var controls = ctx.getParam('controls');
            ctx.setInitOption('controls', controls);

            if (ctx.getParam('book')) {
                if (ctx.getParam('book').footnotes) {
                    controls.footnotes = ctx.getParam('book').footnotes;
                }

                if (ctx.getParam('book').pages) {
                    controls.pages = ctx.getParam('book').pages;
                }
            }

            controls.block = 'controls';
            content.push({
                elem: 'controls',
                /*
                 Передается объект вида(по умолчанию)
                 {
                     block: controls,
                     zoom: true,
                     arrows: true
                 }
                 */
                content: controls
            });
        }

        content.push({
            elem: 'book',
            content: ctx.getParam('book')
        });

        if (ctx.getParam('progress')) {
            ctx.setInitOption('progress', true);

            content.push({
                elem: 'progress'
            });
        }

        if (ctx.getParam('progress_bar')) {
            ctx.setInitOption('progress-bar', true);

            content.push({
                elem: 'progress-bar'
            });
        }

        if (ctx.getParam('annotations')) {
            ctx.setInitOption('annotations', true);

            content.push({
                elem: 'back-to-page'
            });
        }

        content.push({
            elem: 'estimated'
        });

        ctx.setState('loading');
        content.push({
            elem: 'loader'
        });

        ctx.setContent(content);
    });

    bt.match('chitalka-ui*__loader', function (ctx) {
        ctx.setContent({
            block: 'spin',
            view: 'default-large'
        });
    });

    bt.match([
        'chitalka-ui*__controls',
        'chitalka-ui*__book'
    ], function (ctx) {
        ctx.setContent(ctx.getParam('content'));
    });
};
