module.exports = function (bt) {

    bt.lib.global = bt.lib.global || {};
    bt.lib.global.lang = bt.lib.global.lang || 'ru';
    bt.lib.global.tld = bt.lib.global.tld || 'ru';
    bt.lib.global['content-region'] = bt.lib.global['content-region'] || 'ru';
    bt.lib.global['click-host'] = bt.lib.global['click-host'] || '//clck.yandex.ru';
    bt.lib.global['passport-host'] = bt.lib.global['passport-host'] || 'https://passport.yandex.ru';
    bt.lib.global['pass-host'] = bt.lib.global['pass-host'] || '//pass.yandex.ru';
    bt.lib.global['social-host'] = bt.lib.global['social-host'] || '//social.yandex.ru';
    bt.lib.global['export-host'] = bt.lib.global['export-host'] || '//export.yandex.ru';

    /**
     * Changes top level domain.
     *
     * @param {String} tld Top level domain.
     */
    bt.lib.global.setTld = function (tld) {
        var xYaDomain = tld === 'tr' ? 'yandex.com.tr' : 'yandex.' + tld;
        var yaDomain = ['ua', 'by', 'kz'].indexOf(tld) !== -1 ? 'yandex.ru' : xYaDomain;
        var globalObj = bt.lib.global;
        globalObj['content-region'] = tld;
        globalObj['click-host'] = '//clck.' + yaDomain;
        globalObj['passport-host'] = 'https://passport.' + yaDomain;
        globalObj['pass-host'] = '//pass.' + xYaDomain;
        globalObj['social-host'] = '//social.' + xYaDomain;
        globalObj['export-host'] = '//export.' + xYaDomain;
        globalObj.tld = tld;
    };

    /**
     * @returns {String}
     */
    bt.lib.global.getTld = function () {
        return bt.lib.global.tld;
    };

    if (bt.lib.i18n && bt.lib.i18n.getLanguage) {
        var tld = bt.lib.i18n.getLanguage();
        if (tld === 'uk') {
            tld = 'ua';
        }
        bt.lib.global.setTld(tld);
    }

};
