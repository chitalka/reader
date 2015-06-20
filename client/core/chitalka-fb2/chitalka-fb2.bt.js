module.exports = function (bt) {
    bt.setDefaultView('chitalka-fb2', 'default');

    bt.match('chitalka-fb2*', function (ctx) {
        ctx.setInitOption('keyboard', true);
        ctx.setInitOption('url', ctx.getParam('url'));
        ctx.enableAutoInit();

        var footnotes = ctx.getParam('footnotes') || false;
        if (footnotes) {
            ctx.setState('footnotes', footnotes);
        }

        var pages = ctx.getParam('pages') || false;
        if (pages) {
            ctx.setState('pages', pages);
        }

        var content = [
        {
            elem: 'title'
        },
        {
            elem: 'bookholder'
        }];
        if (ctx.getParam('ui')) {
            ctx.setInitOption('ui', true);

            content.push({
                elem: 'ui',
                content: ctx.getParam('ui')
            });
        }

        ctx.setContent(content);
    });

    bt.match('chitalka-fb2*__ui', function (ctx) {
        ctx.setContent(ctx.getParam('content'));
    });
};
