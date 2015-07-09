module.exports = function(config) {
    config.includeConfig('enb-bevis-helper');

    var browserSupport = [
        'IE >= 9',
        'Safari >= 5',
        'Chrome >= 33',
        'Opera >= 12.16',
        'Firefox >= 28'
    ];

    var bevisHelper = config.module('enb-bevis-helper')
        .browserSupport(browserSupport)
        .useAutopolyfiller();

    config.setLanguages(['ru']);

    config.node('build/index', function (nodeConfig) {
        bevisHelper
            .sourceDeps('index')
            .sources({profile: 'index'})
            .forStaticHtmlPage()
            //.forServerPage()
            .configureNode(nodeConfig);
    });

    bevisHelper.configureUnitTests('test/client');
};
