module.exports = function (bt) {
    bt.match('config', function (ctx) {
        ctx.setTag('script');
        ctx.setAttr('id', 'config');
        ctx.setAttr('type', 'text/json');
        ctx.setContent(JSON.stringify(ctx.getParam('config')));
    });
};
