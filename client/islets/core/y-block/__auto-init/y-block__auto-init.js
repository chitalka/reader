modules.require(['jquery', 'y-block'], function ($, YBlock) {
    $(function () {
        YBlock.initDomTree(window.document).done();
    });
});
