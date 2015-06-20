modules.define(
    'test',
    ['bt'],
    function (provide, bt) {

    describe('y-page', function () {
        describe('bt', function () {
            describe('doctype', function () {
                it('should should render HTML5 doctype by default', function () {
                    bt.processBtJson({block: 'y-page'})[0].should.equal('<!DOCTYPE html>');
                });
                it('should should render given doctype', function () {
                    bt.processBtJson({block: 'y-page', doctype: '<!DOCTYPE>'})[0].should.equal('<!DOCTYPE>');
                });
            });
            describe('layout', function () {
                it('should render html tag', function () {
                    bt.processBtJson({block: 'y-page'})[1]._tag.should.equal('html');
                });
                it('should render head tag', function () {
                    bt.processBtJson({block: 'y-page'})[1].content[0]._tag.should.equal('head');
                });
                it('should render body tag', function () {
                    bt.processBtJson({block: 'y-page'})[1].content[1]._tag.should.equal('body');
                });
            });
            describe('js', function () {
                bt.apply({
                    block: 'y-page',
                    scripts: [{url: '1.js'}, {source: 'alert("Hello World!");'}]
                }).should.contain(
                    '<script src="1.js" type="text/javascript"></script>' +
                    '<script type="text/javascript">alert("Hello World!");</script>'
                );
            });
        });
    });

    provide();
});
