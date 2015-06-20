/**
 * Загружает (если нет на странице) и предоставляет jQuery.
 */

/* global jQuery */
modules.define(
    'jquery',
    [
        'y-load-script',
        'jquery-config'
    ],
    function (
        provide,
        loadScript,
        config
    ) {

    function doProvide() {
        provide(jQuery.noConflict(true));
    }

    if (typeof jQuery !== 'undefined') {
        doProvide();
    } else {
        loadScript(config.url, doProvide);
    }
});
