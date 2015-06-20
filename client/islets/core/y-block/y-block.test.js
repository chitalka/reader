modules.define(
    'test',
    [
        'y-block',
        'y-block-event',
        'jquery',
        'inherit'
    ],
    function (
        provide,
        YBlock,
        YBlockEvent,
        $,
        inherit
    ) {

    describe('YBlock', function () {
        var modulesStorage;

        beforeEach(function () {
            modulesStorage = {};

            sinon.stub(modules, 'require', function (blocks, callback) {
                var result = blocks.map(function (blockName) {
                    return modulesStorage[blockName];
                });
                setTimeout(function () {
                    callback.apply(null, result);
                }, 0);
            });

            sinon.stub(modules, 'isDefined', function (moduleName) {
                return modulesStorage[moduleName];
            });
        });

        afterEach(function () {
            modules.require.restore();
            modules.isDefined.restore();
        });

        describe('__constructor', function () {
            it('should add _init class', function () {
                var block = new YBlock($('<div class="y-block"></div>'));
                block.getDomNode().hasClass('_init').should.be.true;
            });

            it('should accept domNode as the first argument', function () {
                var domNode = $('<div class="y-block"></div>');
                var block = new YBlock(domNode);
                block.getDomNode().should.equal(domNode);
            });

            it('should accept domNode as the first argument and options as the second', function () {
                var domNode = $('<div class="y-block"></div>');
                var block = new YBlock(domNode, {opt: 'val'});
                block.getDomNode().should.equal(domNode);
                block._getOptions().opt.should.equal('val');
            });

            it('should accept options as the first argument', function () {
                var block = new YBlock({opt: 'val'});
                block.getDomNode().should.not.equal(null);
                block.getDomNode().should.not.equal(undefined);
                block._getOptions().opt.should.equal('val');
            });
        });

        describe('_findElement', function () {
            it('should return element by name', function () {
                var block = new YBlock(
                    $('<div class="y-block"><a class="y-block__elem" data-attr="42"></a></div>')
                );
                block._findElement('elem').attr('data-attr').should.equal('42');
            });
        });

        describe('_findAllElements', function () {
            it('should return elements by name', function () {
                var block = new YBlock($(
                    '<div class="y-block">' +
                        '<a class="y-block__elem" data-attr="41"></a>' +
                        '<a class="y-block__elem" data-attr="42"></a>' +
                        '<a class="y-block__elem" data-attr="43"></a>' +
                    '</div>'
                ));
                block._findAllElements('elem').map(function (elem) {
                    return elem.attr('data-attr');
                }).should.have.members(['41', '42', '43']);
            });
        });

        describe('_findAllParentElements', function () {
            it('should return parent elements by name', function () {
                var block = new YBlock($(
                    '<div class="y-block">' +
                        '<div class="y-block__parent" data-attr="43">' +
                            '<div class="y-block__parent" data-attr="42">' +
                                '<div class="y-block__parent" data-attr="41">' +
                                    '<a class="y-block__elem"></a>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>'
                ));
                block._findAllParentElements('parent', block._findElement('elem')).map(function (parent) {
                    return parent.attr('data-attr');
                }).should.have.members(['41', '42', '43']);
            });
            it('should return parent elements by name in block bounds', function () {
                var block = new YBlock($(
                    '<div class="y-block">' +
                        '<div class="y-block__parent" data-attr="43">' +
                            '<div class="y-block__parent" data-attr="42">' +
                                '<div class="y-block__parent" data-attr="41">' +
                                    '<a class="y-block__elem"></a>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                    '</div>'
                ));
                var outer = $('<div class="y-block2__parent" data-attr="44"></div>');
                block.getDomNode().appendTo(outer);
                block._findAllParentElements('parent', block._findElement('elem')).map(function (parent) {
                    return parent.attr('data-attr');
                }).should.have.members(['41', '42', '43']);
            });
        });

        describe('_findParentElement', function () {
            it('should return first parent element by name', function () {
                var block = new YBlock($(
                    '<div class="y-block">' +
                        '<div class="y-block__parent" data-attr="41">' +
                            '<div class="y-block__parent" data-attr="42">' +
                                '<a class="y-block__elem"></a>' +
                            '</div>' +
                        '</div>' +
                    '</div>'
                ));
                block._findParentElement('parent', block._findElement('elem')).attr('data-attr').should.equal('42');
            });
        });

        describe('find', function () {
            var SubBlock;
            var block;

            beforeEach(function () {
                SubBlock = inherit(YBlock, {
                    getTheAnswer: function () {
                        return this.getDomNode().attr('data-attr');
                    }
                }, {
                    getBlockName: function () {
                        return 'sub-block';
                    }
                });
                block = new YBlock($(
                    '<div class="y-block">' +
                        '<a class="sub-block" data-block="sub-block" data-attr="42"></a>' +
                        '<a class="sub-block" data-block="sub-block" data-attr="24"></a>' +
                        '<a class="sub-block" data-block="sub-block" data-attr="12"></a>' +
                    '</div>'
                ));
            });

            it('should find first block', function () {
                SubBlock.find(block).getTheAnswer().should.equal('42');
            });
        });

        describe('findAll', function () {
            var SubBlock;
            var block;

            beforeEach(function () {
                SubBlock = inherit(YBlock, {
                    getTheAnswer: function () {
                        return this.getDomNode().attr('data-attr');
                    }
                }, {
                    getBlockName: function () {
                        return 'sub-block';
                    }
                });
                block = new YBlock($(
                    '<div class="y-block">' +
                        '<a class="sub-block" data-block="sub-block" data-attr="42"></a>' +
                        '<a class="sub-block" data-block="sub-block" data-attr="24"></a>' +
                        '<a class="sub-block" data-block="sub-block" data-attr="12"></a>' +
                    '</div>'
                ));
            });

            it('should find all blocks', function () {
                SubBlock.findAll(block).map(function (subBlock) {
                    return subBlock.getTheAnswer();
                }).should.have.members(['42', '24', '12']);
            });
        });

        describe('initDomTree', function () {
            it('should initialize block without params', function (done) {
                modulesStorage['sub-block'] = inherit(YBlock, {
                    __constructor: function () {
                        this.__base.apply(this, arguments);
                        done();
                    }
                }, {
                    getBlockName: function () {
                        return 'sub-block';
                    }
                });

                YBlock.initDomTree($(
                    '<div class="y-block">' +
                        '<a class="sub-block _init" data-block="sub-block"></a>' +
                    '</div>'
                )).fail(done);
            });

            it('should initialize block inside DOM Tree', function (done) {
                modulesStorage['sub-block'] = inherit(YBlock, {
                    __constructor: function (domNode, params) {
                        this.__base.apply(this, arguments);
                        params.answer.should.equal(42);
                        done();
                    }
                }, {
                    getBlockName: function () {
                        return 'sub-block';
                    }
                });
                YBlock.initDomTree($(
                    '<div class="y-block">' +
                        '<a' +
                            ' class="sub-block _init"' +
                            ' data-block="sub-block" ' +
                            ' data-options="{&quot;options&quot;:{&quot;answer&quot;:42}}"></a>' +
                    '</div>'
                )).fail(done);
            });

            it('should not initialize block twice', function (done) {
                var counter = 0;
                modulesStorage['sub-block'] = inherit(YBlock, {
                    __constructor: function () {
                        this.__base.apply(this, arguments);
                        counter++;
                    }
                }, {
                    getBlockName: function () {
                        return 'sub-block';
                    }
                });
                var dom = $(
                    '<div class="y-block">' +
                        '<a class="sub-block _init"' +
                            ' data-block="sub-block" data-options="{&quot;options&quot;:{}}"></a>' +
                    '</div>'
                );
                YBlock
                    .initDomTree(dom)
                    .then(function () {
                        return YBlock.initDomTree(dom);
                    })
                    .then(function () {
                        counter.should.equal(1);
                        done();
                    })
                    .fail(done);
            });

            it('should not initialize block without `_init`', function (done) {
                modulesStorage['sub-block'] = inherit(YBlock, {
                    __constructor: function () {
                        this.__base.apply(this, arguments);
                        throw new Error('Initialized');
                    }
                }, {
                    getBlockName: function () {
                        return 'sub-block';
                    }
                });
                YBlock.initDomTree($(
                    '<div class="y-block">' +
                        '<a class="sub-block"' +
                            ' data-block="sub-block"' +
                            ' data-options="{&quot;options&quot;:{&quot;answer&quot;:42}}"></a>' +
                    '</div>'
                )).then(done, done);
            });

            it('should not initialize block without `data-block`', function (done) {
                modulesStorage['sub-block'] = inherit(YBlock, {
                    __constructor: function () {
                        this.__base.apply(this, arguments);
                        throw new Error('Initialized');
                    }
                }, {
                    getBlockName: function () {
                        return 'sub-block';
                    }
                });
                YBlock.initDomTree($(
                    '<div class="y-block">' +
                        '<a class="sub-block _init"></a>' +
                    '</div>'
                )).then(done, done);
            });
        });

        describe('destructDomTree()', function () {
            it('should destruct once all blocks inside given DOM tree', function (done) {
                var spies = {};

                ['block1', 'block2', 'block3'].forEach(function (blockName) {
                    var Block = inherit(YBlock, null, {
                        getBlockName: function () {
                            return blockName;
                        }
                    });
                    spies[blockName] = sinon.spy(Block.prototype, 'destruct');
                    modulesStorage[blockName] = Block;
                });

                var elem = $(
                    '<div>' +
                        '<div data-block="block1" class="_init">' +
                            '<div>' +
                                '<div data-block="block2" class="_init"></div>' +
                            '</div>' +
                        '</div>' +
                        '<div data-block="block3" class="_init"></div>' +
                    '</div>'
                );

                YBlock.initDomTree(elem).done(function () {
                    YBlock.destructDomTree(elem);
                    spies.block1.calledOnce.should.be.true;
                    spies.block2.calledOnce.should.be.true;
                    spies.block3.calledOnce.should.be.true;

                    YBlock.destructDomTree(elem);
                    spies.block1.calledOnce.should.be.true;
                    spies.block2.calledOnce.should.be.true;
                    spies.block3.calledOnce.should.be.true;

                    done();
                });
            });

            it('should destruct emitters', function () {
                var Block = inherit(YBlock, null, {
                    getBlockName: function () {
                        return 'block';
                    }
                });
                modulesStorage.block = Block;

                var subElem = $(
                    '<div>' +
                        '<div data-block="block"></div>' +
                    '</div>'
                );
                var elem = $('<div>').append(subElem);

                var emitter = Block.getEmitter(elem);
                var subEmitter = Block.getEmitter(subElem);
                var spy = sinon.spy();
                emitter.on('event', spy);
                subEmitter.on('event', spy);

                Block._getDomNodeDataStorage(elem).blockEvents.block.should.equal(emitter);
                Block._getDomNodeDataStorage(subElem).blockEvents.block.should.equal(subEmitter);

                Block.destructDomTree(elem);

                Block._getDomNodeDataStorage(elem).blockEvents.should.be.empty;
                Block._getDomNodeDataStorage(subElem).blockEvents.should.be.empty;

                var eventName = Block._getPropagationEventName('event');
                elem.trigger(eventName);
                subElem.trigger(eventName);
                spy.called.should.be.false;
            });
        });

        describe('emit()', function () {
            var block;
            var spy1;
            var spy2;

            beforeEach(function () {
                block = new YBlock();
                spy1 = sinon.spy();
                spy2 = sinon.spy();

                block.on('event1', spy1);
                block.on('event2', spy2);
            });

            afterEach(function () {
                block.destruct();
            });

            it('should emit event on block', function () {
                block.emit('event1');

                var event2 = new YBlockEvent('event2');
                block.emit(event2);

                spy1.calledOnce.should.be.true;
                var e = spy1.firstCall.args[0];
                e.should.be.instanceof(YBlockEvent);
                e.type.should.eq('event1');
                e.target.should.eq(block);

                spy2.calledOnce.should.be.true;
                e = spy2.firstCall.args[0];
                e.should.be.eq(event2);
                e.type.should.eq('event2');
                e.target.should.eq(block);
            });

            it('should emit event width additional data', function () {
                var data = {foo: 'bar'};
                block.emit('event1', data);
                var event2 = new YBlockEvent('event2');
                block.emit(event2, data);

                spy1.calledOnce.should.be.true;
                var e = spy1.firstCall.args[0];
                e.should.be.instanceof(YBlockEvent);
                e.type.should.eq('event1');
                e.target.should.eq(block);
                e.data.should.eq(data);

                spy2.calledOnce.should.be.true;
                e = spy2.firstCall.args[0];
                e.should.be.eq(event2);
                e.type.should.eq('event2');
                e.target.should.eq(block);
                e.data.should.eq(data);
            });
        });

        describe('getEmitter()', function () {
            it('should return the same instance for same DOM node', function () {
                var dom = $('<div></div>');
                YBlock.getEmitter(dom).should.equal(YBlock.getEmitter(dom));
            });

            it('should listen handle bubbling events', function (done) {
                var SubBlock = inherit(YBlock, {
                    __constructor: function () {
                        this.__base.apply(this, arguments);
                        this._bindTo(this._findElement('button'), 'click', function () {
                            this.emit('button-click');
                        });
                    }
                }, {
                    getBlockName: function () {
                        return 'sub-block';
                    }
                });
                var dom = $(
                    '<div><div><div>' +
                    '<div class="sub-block" data-block="sub-block">' +
                        '<div class="sub-block__button"></div>' +
                    '</div>' +
                    '</div></div></div>'
                );
                var block = SubBlock.find(dom);
                SubBlock.getEmitter(dom).on('button-click', function (event) {
                    event.target.should.equal(block);
                    done();
                });
                dom.find('.sub-block__button').click();
            });

            it('should stop propagation', function (done) {
                var SubBlock = inherit(YBlock, {
                    __constructor: function () {
                        this.__base.apply(this, arguments);
                        this._bindTo(this._findElement('button'), 'click', function () {
                            this.emit('button-click');
                        });
                    }
                }, {
                    getBlockName: function () {
                        return 'sub-block';
                    }
                });
                var subDom = $(
                    '<div>' +
                        '<div class="sub-block" data-block="sub-block">' +
                            '<div class="sub-block__button"></div>' +
                        '</div>' +
                    '</div>'
                );
                var clickTriggered = false;
                var dom = $('<div></div>').append(subDom);
                SubBlock.find(dom); // init sub-block
                SubBlock.getEmitter(subDom).on('button-click', function (event) {
                    clickTriggered = true;
                    event.stopPropagation();
                });
                SubBlock.getEmitter(dom).on('button-click', function () {
                    done(new Error('Stop propagation should work'));
                });
                dom.find('.sub-block__button').click();
                clickTriggered.should.be.true;
                done();
            });
        });

        describe('_getDomNodeDataStorage', function () {
            it('should return the same instance for the same DOM node', function () {
                var dom = $('<div></div>');
                YBlock._getDomNodeDataStorage(dom).should.equal(YBlock._getDomNodeDataStorage(dom));
            });
        });

        describe('_liveBindToElement', function () {
            it('should catch event on element', function (done) {
                var Block = inherit(YBlock, {}, {
                    getBlockName: function () {
                        return 'block1';
                    },
                    _liveInit: function () {
                        this._liveBindToElement('button', 'click', function () {
                            this.emit('button-click');
                        });
                    }
                });
                var block = new Block($(
                    '<div class="block1" data-block="block1">' +
                        '<div class="block1__button"></div>' +
                    '</div>'
                ));
                block.getDomNode().appendTo(document.body);
                block.on('button-click', function () {
                    block.getDomNode().remove();
                    done();
                });
                block._findElement('button').trigger('click');
            });
            it('should catch event on element with exact name', function () {
                var Block = inherit(YBlock, {}, {
                    getBlockName: function () {
                        return 'block2';
                    },
                    _liveInit: function () {
                        this._liveBindToElement('button', 'click', function () {
                            this.emit('button-click');
                        });
                    }
                });
                var block = new Block($(
                    '<div class="block2" data-block="block2">' +
                        '<div class="block2__button"></div>' +
                        '<div class="block2__buttons"></div>' +
                    '</div>'
                ));
                var triggerCount = 0;
                block.getDomNode().appendTo(document.body);
                block.on('button-click', function () {
                    triggerCount++;
                });
                block._findElement('button').trigger('click');
                block._findElement('buttons').trigger('click');
                block.getDomNode().remove();
                triggerCount.should.equal(1);
            });
        });

        describe('state', function () {
            describe('_getState', function () {
                it('should return mod value', function () {
                    var block = YBlock.fromDomNode(
                        $('<div class="y-block _color_red"></div>')
                    );
                    block._getState('color').should.equal('red');
                    block._getState('type').should.equal(false);
                });

                it('should return mod value after set', function () {
                    var block = YBlock.fromDomNode(
                        $('<div class="y-block _color_red"></div>')
                    );
                    block._getState('color').should.equal('red');
                    block._setState('color', 'blue');
                    block._getState('color').should.equal('blue');
                });

                it('should not return mod value after del', function () {
                    var block = YBlock.fromDomNode(
                        $('<div class="y-block _color_red"></div>')
                    );
                    block._getState('color').should.equal('red');
                    block._removeState('color');
                    block._getState('color').should.equal(false);
                });
            });

            describe('_setState', function () {
                it('should set mod value', function () {
                    var block = YBlock.fromDomNode(
                        $('<div class="y-block"></div>')
                    );
                    block._setState('color', 'red');
                    block.getDomNode().attr('class').should.equal('y-block _init _color_red');
                    block._setState('color', 'blue');
                    block.getDomNode().attr('class').should.equal('y-block _init _color_blue');
                    block._setState('color', null);
                    block._setState('size', 'm');
                    block.getDomNode().attr('class').should.equal('y-block _init _size_m');
                });
            });

            describe('_removeState', function () {
                it('should remove mod value', function () {
                    var block = YBlock.fromDomNode(
                        $('<div class="y-block _color_red"></div>')
                    );
                    block._removeState('color');
                    block.getDomNode().attr('class').should.equal('y-block _init');
                    block._setState('color', 'blue');
                    block._removeState('color');
                    block.getDomNode().attr('class').should.equal('y-block _init');
                });
            });

            describe('_getState', function () {
                it('should return mod value', function () {
                    var block = YBlock.fromDomNode(
                        $('<div class="y-block _color_red"></div>')
                    );
                    block._getState('color').should.equal('red');
                    block._setState('color', 'blue');
                    block._getState('color').should.equal('blue');
                    block._setState('color', null);
                    block._getState('color').should.equal(false);
                    block._setState('color', undefined);
                    block._getState('color').should.equal(false);
                });
            });

            describe('_toggleState', function () {
                it('should toggle mod value', function () {
                    var block = YBlock.fromDomNode(
                        $('<div class="y-block _color_red"></div>')
                    );
                    block._toggleState('color', 'red', false);
                    block._getState('color').should.equal(false);
                    block._toggleState('color', false, 'red');
                    block._getState('color').should.equal('red');
                    block._toggleState('color', 'red', 'blue');
                    block._getState('color').should.equal('blue');
                    block._toggleState('color', null, 'blue');
                    block._toggleState('color', null, 'blue');
                    block._getState('color').should.equal('blue');
                });
            });

            describe('_setElementState', function () {
                it('should set mod value', function () {
                    var block = YBlock.fromDomNode($(
                        '<div class="y-block">' +
                            '<div class="y-block__button"></div>' +
                        '</div>'
                    ));
                    block._setElementState(block._findElement('button'), 'color', 'red');
                    block._findElement('button')
                        .attr('class').should.equal('y-block__button _color_red');
                    block._setElementState(block._findElement('button'), 'color', 'blue');
                    block._findElement('button')
                        .attr('class').should.equal('y-block__button _color_blue');
                    block._setElementState(block._findElement('button'), 'color', '');
                    block._findElement('button')
                        .attr('class').should.equal('y-block__button');
                });
                it('should set true mod value', function () {
                    var block = YBlock.fromDomNode($(
                        '<div class="y-block">' +
                            '<div class="y-block__button"></div>' +
                        '</div>'
                    ));
                    block._setElementState(block._findElement('button'), 'active');
                    block._findElement('button')
                        .attr('class').should.equal('y-block__button _active');
                    block._setElementState(block._findElement('button'), 'active', false);
                    block._findElement('button')
                        .attr('class').should.equal('y-block__button');
                });
                it('should set mod value with another view', function () {
                    var block = YBlock.fromDomNode($(
                        '<div class="y-block_red" data-block="y-block">' +
                            '<div class="y-block_red__button"></div>' +
                        '</div>'
                    ));
                    block._setElementState(block._findElement('button'), 'color', 'red');
                    block._findElement('button')
                        .attr('class').should.equal('y-block_red__button _color_red');
                    block._setElementState(block._findElement('button'), 'color', 'blue');
                    block._findElement('button')
                        .attr('class').should.equal('y-block_red__button _color_blue');
                    block._setElementState(block._findElement('button'), 'color', '');
                    block._findElement('button')
                        .attr('class').should.equal('y-block_red__button');
                });
            });

            describe('_removeElementState', function () {
                it('should remove mod value', function () {
                    var block = YBlock.fromDomNode($(
                        '<div class="y-block">' +
                            '<div class="y-block__button _color_red"></div>' +
                        '</div>'
                    ));
                    block._removeElementState(block._findElement('button'), 'color');
                    block._findElement('button')
                        .attr('class').should.equal('y-block__button');
                    block._setElementState(block._findElement('button'), 'color', 'blue');
                    block._removeElementState(block._findElement('button'), 'color');
                    block._findElement('button')
                        .attr('class').should.equal('y-block__button');
                });
            });

            describe('_getElementState', function () {
                it('should return mod value', function () {
                    var block = YBlock.fromDomNode($(
                        '<div class="y-block">' +
                            '<div class="y-block__button _color_red"></div>' +
                        '</div>'
                    ));

                    var button = block._findElement('button');
                    block._getElementState(button, 'color').should.equal('red');
                    block._setElementState(button, 'color', 'blue');
                    block._getElementState(button, 'color').should.equal('blue');
                    block._setElementState(button, 'color', null);
                    block._getElementState(button, 'color').should.equal(false);
                    block._setElementState(button, 'color', undefined);
                    block._getElementState(button, 'color').should.equal(false);
                });
            });

            describe('_toggleElementState', function () {
                it('should toggle mod value', function () {
                    var block = YBlock.fromDomNode($(
                        '<div class="y-block">' +
                            '<div class="y-block__button _color_red"></div>' +
                        '</div>'
                    ));

                    var button = block._findElement('button');
                    block._toggleElementState(button, 'color', 'red', false);
                    block._getElementState(button, 'color').should.equal(false);
                    block._toggleElementState(button, 'color', false, 'red');
                    block._getElementState(button, 'color').should.equal('red');
                    block._toggleElementState(button, 'color', 'red', 'blue');
                    block._getElementState(button, 'color').should.equal('blue');
                    block._toggleElementState(button, 'color', null, 'blue');
                });
            });
        });

        describe('options', function () {
            it('should return block options', function () {
                var block = YBlock.fromDomNode($(
                    '<div class="y-block" data-options="{&quot;options&quot;:{&quot;level&quot;:5}}"></div>'
                ));
                block._getOptions().level.should.equal(5);
            });
            it('should return element options', function () {
                var block = YBlock.fromDomNode($(
                    '<div class="y-block">' +
                        '<div class="y-block__test" data-options="{&quot;options&quot;:{&quot;level&quot;:5}}"></div>' +
                    '</div>'
                ));
                block._getElementOptions(block._findElement('test')).level.should.equal(5);
            });
        });

        describe('destruct()', function () {
            it('should remove DOM Node on destruct', function () {
                var SubBlock = inherit(YBlock, {}, {
                    getBlockName: function () {
                        return 'sub-block';
                    }
                });
                var block = new SubBlock();
                var blockDomNode = block.getDomNode();
                blockDomNode.appendTo(document.body);
                $.contains(document.body, blockDomNode[0]).should.be.true;
                block.destruct();
                $.contains(document.body, blockDomNode[0]).should.be.false;
            });

            it('should destruct child blocks in descending order', function () {
                var SubBlock = inherit(YBlock, {}, {
                    getBlockName: function () {
                        return 'sub-block';
                    }
                });
                var InnerBlock = inherit(YBlock, {}, {
                    getBlockName: function () {
                        return 'inner-block';
                    }
                });
                var block = new SubBlock();
                sinon.spy(block, 'destruct');

                var innerBlock = new InnerBlock();
                sinon.spy(innerBlock, 'destruct');
                block.getDomNode().append(innerBlock.getDomNode());

                var innerSubBlock = new SubBlock();
                sinon.spy(innerSubBlock, 'destruct');
                innerBlock.getDomNode().append(innerSubBlock.getDomNode());

                block.destruct();
                sinon.assert.callOrder(block.destruct, innerBlock.destruct, innerSubBlock.destruct);
            });

            it('should throw error on double destruct', function () {
                var block = new YBlock($('<div class="y-block"></div>'));
                block.destruct();
                function destructBlockAgain() {
                    block.destruct();
                }
                destructBlockAgain.should.throw(Error, 'Block `y-block` was already destroyed');
            });
        });

        describe('YBlock.fromDomNode()', function () {
            it('should return instance of block for given DOM node', function () {
                var elem = $('div');
                var block = YBlock.fromDomNode(elem);
                block.should.be.instanceof(YBlock);
            });

            it('should return same instance for same DOM node', function () {
                var elem = document.createElement('div');
                var block = YBlock.fromDomNode($(elem));
                YBlock.fromDomNode($(elem)).should.eq(block);
            });
        });
    });

    provide();
});
