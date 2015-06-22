/* global XSLTProcessor, TweenLite, Power2, alert */

modules.define(
    'chitalka-fb2',
    [
        'chitalka',
        'jquery',
        'inherit',
        'y-extend',
        'y-debounce',
        'unzip',
        'chitalka-fb2-parser',
        'storage',
        'y-next-tick'
    ],
    function (
        provide,
        Chitalka,
        $,
        inherit,
        extend,
        debounce,
        zip,
        parser,
        Storage,
        nextTick
    ) {

    var win = $(window);

    var FONT_SIZE_STEP = 2;
    var TEXT_NODE = 3;

    var ChitalkaFb2 = inherit(Chitalka, {
        __constructor: function () {
            this.__base.apply(this, arguments);

            this._bookPlaceholder = this._findElement('bookholder');
            this._title = this._findElement('title');
            this._prepareBook();
        },

        _render: function (book) {
            this._bookPlaceholder.html(book);
        },

        _setup: function () {
            this._bookPlaceholder.scrollLeft(0);
            this._setTitle();
            this._afterDomAppending();
        },

        _setTitle: function () {
            // Ищем ноду с заголовком книги
            var titleNode = this._find(this._xml, 'title');

            if (!titleNode) {
                return;
            }

            // Ищем все параграфы в ноде, кастуем к массиву
            var titleParagraphs = [].slice.call(titleNode.querySelectorAll('p'));

            if (titleParagraphs.length === 0) {
                return;
            }

            // Вытягиваем тексты параграфов и конкатенируем
            var bookTitle = titleParagraphs.map(function (p) {
                return p.textContent;
            });

            var bookTitleHTML = bookTitle.join('&nbsp;&ndash;&nbsp;');
            var bookTitleAttr = bookTitle.join(' - ');

            this._title
                .attr('title', bookTitleAttr)
                .html(bookTitleHTML);
        },

        /**
         * Задаёт режим отображения сноски и триггерит событие change
         * @public
         *
         * @param {String} mode тип отображения сносок
         *                 'inline' – внутри текста
         *                 'appendix' – в конце
         */
        setFootnotesMode: function (mode) {
            this._setFootnotesMode(mode);
            this._settings.save('footnotes', mode);
            this._onBookChange();
        },

        /**
         * Задаёт режим количества отображаемых страниц
         * @public
         *
         * @param {String} mode тип режима:
         *                 – auto автоматический
         *                 – one всегда одна страница на листе
         *                 – two всегда две страницы на листt
         */
        setPageViewMode: function (mode) {
            this._setPageViewMode(mode);
            this._settings.save('pages', mode);
            this._onBookChange();
        },

        /**
         * Задаёт режим отображения сноски
         * @private
         *
         * @param {String} mode тип отображения сносок
         *                 'inline' – внутри текста
         *                 'appendix' – в конце
         */
        _setFootnotesMode: function (mode) {
            this._subscribeToLinksEvents();
            if (mode === 'inline') {
                this._footnotesMode = mode;
                this._setState('footnotes', 'inline');
            } else {
                this._footnotesMode = 'appendix';
                this._removeState('footnotes');
            }
        },

        /**
         * Задаёт режим количества отображаемых страниц
         * @private
         *
         * параметры см public метод
         */
        _setPageViewMode: function (mode) {
            if (mode === 'one' || mode === 'two') {
                this._setState('pages', mode);
            } else {
                this._removeState('pages');
            }
        },

        /**
         * Возвращает значение параметра «режим отображения сносок»
         *
         * @returns {String}
         */
        getFootnotesMode: function () {
            return this._footnotesMode;
        },

        /**
         * Возвращает значение параметра «режим отображения страниц»
         *
         * @returns {String}
         */
        getPageViewMode: function () {
            return this._getState('pages');
        },

        /**
         * Действия, которые необходимо проивести, когда книга физически
         * появится в DOM-дереве
         */
        _afterDomAppending: function () {
            this._book = this._findElement('book');
            /**
             * FIXME: https://st.yandex-team.ru/CHITALKA-84
             * Не до конца работают флексы, надо поискать более лаконичное решение,
             * нежели задавать контейнеру картинки размеры
             */
            this._images = this.getDomNode().find('.image');
            this._bookDOM = this._book[0];

            if (this._settings.get('font-size')) {
                this._setFontSize(this._settings.get('font-size'));
            } else {
                this._fontSize = parseInt(this._bookPlaceholder.css('font-size'), 10);
                this._settings.save('font-size', this._fontSize);
            }
            this._lineHeight = parseInt(this._bookPlaceholder.css('line-height'), 10);
            this._annotations = this.getDomNode().find('.annotation');

            this._subscribeToWindowEvents();

            this._setFootnotesMode(this._settings.get('footnotes') || this._getState('footnotes') || 'appendix');
            this._setPageViewMode(this._settings.get('pages') || this._getState('pages') || 'auto');

            this._storage = new Storage(this.getBookId());

            // В FF есть бага, что нельзя сразу после вставки в DOM начинать работать с ним
            // возможны пропуски элементов и их значений, поэтому работу с размерами DOM
            // откладываем до следующего tick'а, когда браузер закончит вставлять данные
            // связанный баг https://st.yandex-team.ru/CHITALKA-65
            nextTick(function () {
                this._buildCFIs();
                this._countSymbols();
                this._calcDimensions();

                this._restoreSavedPosition();

                this._firstElementOnPage = this._getKeeper();

                this.emit('ready');

            }.bind(this));
        },

        /**
         * Строит CSS-селектор для выбора ноды по CFI
         *
         * @param {String} cfi
         * @return {String}
         */
        _buildSelectorByCfi: function (cfi) {
            return '[data-4cfi="' + cfi + '"]';
        },

        _storePagePosition: debounce(function () {
            this._storage.save({
                page: this._currentPage,
                '4cfi': this._getKeeper().getAttribute('data-4cfi')
            });
        }, 500),

        /**
         * Восстановление позиции последнего чтения книги
         */
        _restoreSavedPosition: function () {
            var storagePage;

            // Восстанавливаем страницу из инфы о местоположении (старая нотация)
            if (this._storage.get('page')) {
                storagePage = this._storage.get('page');
            }

            // Или из data-4cfi
            if (this._storage.get('4cfi')) {
                var selector = this._buildSelectorByCfi(this._storage.get('4cfi'));

                if ($(selector).size() > 0) {
                    storagePage = this._whatPageIsDOMElem($(selector));
                } else {
                    this._storage.remove('cfi');
                }
            }

            // Если есть что восстанавилвать, то идем туда
            if (storagePage) {
                this._currentPage = storagePage;
                this._updateScrollPosition({
                    noAnimation: true,
                    dontChangeFirstElement: true
                });
            } else {
                this._currentPage = 0;
            }
        },

        /**
         * Математика внутри читалки - считаем отступы, ширины колонок, колоичество страниц
         */
        _calcDimensions: function () {
            // Ширина разрыва между колонками
            this._gapWidth = parseInt(this._book.css('column-gap'), 10);

            // Магия, т.к в вебките есть баг columnt-count: 1 – контент вытягивается в высоту
            // из-за этого приходится создавать вторую фейковую колонку (для применения свойства)
            // и компенисировать фейк математикой, что и происходит

            // Количество колонок
            // Если gapWidth === 0, то значит одна колонка и включается режим удвоения ширины и количества колонок
            // возвращаем количество в исходную позицию, если же ширина gapWidth > 0, то ничего не делаем.
            this._gaps = parseInt(this._book.css('column-count'), 10);

            // По сколько страниц пролистывать
            this._listBy = this._gapWidth === 40 ? 1 : 2;

            // Ширина книжного холста
            // Если колонка одна (gapWidth === 0), то book.width() вернет значение для 200% width, делим пополам

            // Приоритетнее для определения ширины использовать getComputedStyle, т.к он не округляет ширину
            if (window.getComputedStyle) {
                this._bookCanvasWidth = parseFloat(window.getComputedStyle(this._book[0]).width);
            } else {
                this._bookCanvasWidth = this._book.width();
            }
            this._bookCanvasWidth /= this._gapWidth ? 1 : 2;
            this._bookCanvasHeight = this._book.height();

            //this._updateMaxMins();

            // Ширина страницы книги
            // FIXME: Нужно будет переделать и ограничить ширину по количеству символов
            //        task https://st.yandex-team.ru/EBOOKS-106
            this._pageWidth = (this._bookCanvasWidth - this._gapWidth) / this._gaps;

            // Ширина шага для скролла страницы
            this._pageStepWidth = this._pageWidth + this._gapWidth;

            // Суммарное количество страниц в книге
            this._pageCount = this._getBookPages();

            // Среднее число символов на странице, speedCoeff - эмпирически вычисленный коэффцицент
            this._avgSymbolsOnPage = Math.round(this._totalBookSymbols / this._pageCount)
        },

        /**
         * События, которые надо произвести когда книга изменилась
         */
        _onBookChange: function () {
            var oldPageCount = this._pageCount;
            this._calcDimensions();
            this._updateScrollPosition({
                noAnimation: true,
                dontChangeFirstElement: true
            });

            if (oldPageCount !== this._pageCount) {
                this._currentPage = this._whatPageIsDOMElem(this._firstElementOnPage);

                this._updateScrollPosition({
                    noAnimation: true,
                    dontChangeFirstElement: true
                });
            }
            /**
             * FIXME: https://st.yandex-team.ru/CHITALKA-84
             */
            this._images.css('max-height', this._bookPlaceholder.height() + 'px');
        },

        // ------------------------------------------------------------
        // Секция событий

        /**
         * Подписываем на события окна
         */
        _subscribeToWindowEvents: function () {
            win.resize(this._onBookChange.bind(this));
        },

        /**
         * Подписка на события ссылок внутри страницы
         */
        _subscribeToLinksEvents: function () {
            this.getDomNode().on('click', 'a', function (e) {
                var link = $(e.currentTarget);
                var href = link.attr('href');

                if (/^#/.test(href)) {
                    if (this._footnotesMode === 'appendix') {
                        this._moveToAnnotation(href.replace('#', ''));
                    }
                    return false;
                } else {
                    link.attr('target', '_blank');
                }
            }.bind(this));
        },

        _unsubscribeFromLinksEvents: function () {
            this.getDomNode().off('click', 'a');
        },

        /**
         * Функция выполняет перелистывание книги до аннотации
         *
         * @param {String} annotationId значение параметра name аннотации
         */
        _moveToAnnotation: function (annotationId) {
            // Ищем аннотацию среди ей подобных
            var annotation = $.grep(this._annotations, function (annotation) {
                return $(annotation).find('a[name="' + annotationId + '"]').size() > 0;
            });

            if (!annotation) {
                return;
            }

            // Сохраняем место вызова аннотации
            this._backPage = this._currentPage;

            // Ищем на какой странице находится сноска
            this._currentPage = this._annotationPage = this._whatPageIsDOMElem(annotation);

            // И идём к ней
            this._updateScrollPosition();
        },

        /**
         * Keeper - элемент, видимость которого мы будем сохранять при уменьшении масштаба/режима отображение страницы
         * Функции находит этот элемент относительно текущей страницы
         *
         * @param {String} [page] для какой страницы вернуть keeper'а
         * @returns {DOMElem} keeper
         */
        _getKeeper: function (page) {
            var elementsToPages = this._getElementsToPages(
                    this._listBy,
                    this._fontSize,
                    this._bookCanvasHeight,
                    this.getFootnotesMode()
                );
            var currentPage = page || this._currentPage;
            var lookup = elementsToPages[currentPage];

            // Элемент есть в массиве текущих страниц
            if (lookup && lookup.length) {
                return lookup[0];
            }

            // Ищем в предыдущих страницах последний элемент, такое может быть, например,
            // когда есть длинный абзац в несколько страниц, тогда на текущей странице
            // не будет указателя на элемент
            do {
                lookup = elementsToPages[currentPage--];
                if (lookup && lookup.length) {
                    return lookup[lookup.length - 1];
                }
            } while (currentPage >= 0);

            // Если всё равно не нашли, то берём первую страницу
            return elementsToPages[0][0];
        },

        /**
         * Получаем объект с соответствиями элементов DOM страницам книги
         *
         * @param {Number} gaps количество колонок
         * @param {Number} fontSize размер шрифта
         * @param {Number} height высота холста
         *
         * @returns {Object}
         */
        _getElementsToPages: function (gaps, fontSize, height, footnotesMode) {
            this._elementsToPages = this._elementsToPages || {};

            if (!this._elementsToPages[gaps]) {
                this._elementsToPages[gaps] = {};
            }

            if (!this._elementsToPages[gaps][fontSize]) {
                this._elementsToPages[gaps][fontSize] = {};
            }

            if (!this._elementsToPages[gaps][fontSize][height]) {
                this._elementsToPages[gaps][fontSize][height] = {};
            }

            if (!this._elementsToPages[gaps][fontSize][height][footnotesMode]) {
                this._buildElementsToPages(gaps, fontSize, height, footnotesMode);
            }

            return this._elementsToPages[gaps][fontSize][height][footnotesMode];
        },

        /**
         * Строит объект с соответствиями элементов DOM страницам книги,
         * для заданных gaps и fontSize.
         *
         * @param {Number} gaps количество колонок
         * @param {Number} fontSize размер шрифта
         * @param {Number} height высота холста
         */
        _buildElementsToPages: function (gaps, fontSize, height, footnotesMode) {
            var result = {};
            var allElementsInBook = this._bookPlaceholder.find('*');

            allElementsInBook.map(function (i, el) {
                var page = this._whatPageIsDOMElem(el);

                if (!result[page]) {
                    result[page] = [];
                }
                result[page].push(el);
            }.bind(this));

            this._elementsToPages[gaps][fontSize][height][footnotesMode] = result;
        },

        /**
         * Строить и навешивает на все элементы (в том числе текстовые)
         * data-аттрибут data-4cfi, содержащий универсальный идентификатор каждого элемента
         *
         * @param {DOM} parent нода внутри которой будет происходить строительство cfi
         * @param {String} id айдишник текущей ноды, нужен для конструирования следующего id
         */
        _buildCFIs: function (parent, id) {
            parent = parent || this._bookPlaceholder;
            var counter = 1;
            id = id || '/';

            $(parent).contents().map(function (i, el) {
                var genID = id + counter;

                if (el.nodeType === TEXT_NODE) {
                    // оборачиваем только если не пустая нода и не единственная
                    if ($.trim(el.textContent) !== '' && $(parent).size() > 1) {
                        var wrap = $('<span></span>');
                        wrap.attr('data-4cfi', genID);
                        $(el).wrap(wrap);
                        counter++;
                    }
                } else {
                    $(el).attr('data-4cfi', genID);

                    counter++;
                }
            }.bind(this));
        },

        /**
         * Вычисляет число символов в книге
         */
        _countSymbols: function () {
            this._totalBookSymbols = $.trim(this._bookPlaceholder.get(0).textContent).replace(/\s{2,}/g, ' ').length;
        },

        /**
         * Измеряет скорость чтения книги
         */
        _measureReadingTime: function () {
            var currentTime = Number(new Date());

            if (this._previousPaging) {
                var readBy = (currentTime - this._previousPaging) / 60000;

                var speed = Math.floor(this._avgSymbolsOnPage * this._listBy / readBy);
                this._storeSpeed(speed);

                this._checkSpeed();
            }

            this._previousPaging = currentTime;
        },

        /**
         * Выполнить перелистывание книги на страницу где аннотация была вызвана
         */
        moveBackFromAnnotation: function () {
            this._currentPage = this._backPage;
            this.resetBackPage();
            this._updateScrollPosition();
        },

        /**
         * Сбрасывает счётчик возврата
         */
        resetBackPage: function () {
            this._backPage = null;
        },

        /**
         * Функция вычисляет страницу, на которой находится переданный элемент
         *
         * @param {DOMElem} domElem элемент, который ищем
         * @returns {Number} номер страницы, на которой находится левый край элемента
         */
        _whatPageIsDOMElem: function (domElem) {
            if (!domElem) {
                return;
            }
            // Элементы, которые не видимы или имеют position отличный
            // от static возвращают неверные координаты, включаем их
            // в boolean флаг preconditions
            var preconditions = $(domElem).is(':visible') &&
                ['fixed', 'absolute'].indexOf($(domElem).css('position')) === -1 &&
                // Мега костыль, т.к image__wrapper внутри содержить position: absolute элемент,
                // то это сносит крышу счетоводу
                !$(domElem).is('.image__wrapper');

            var pageDelta = Number($(domElem).position().left) / (this._pageWidth + this._gapWidth);

            // И если текущий элемент именно такой, то возвращаем 0
            return preconditions ?
                Math.floor((this._currentPage || 0) + pageDelta)
                : 0;
        },

        // ------------------------------------------------------------
        // Секция выполнения действия с читалкой

        nextPage: function () {
            if (!this.isLastPage()) {
                this._measureReadingTime();

                this._currentPage += this._listBy;
                this._updateScrollPosition({
                    isNextPage: true
                });
            }
        },

        previousPage: function () {
            if (!this.isFirstPage()) {
                // Меняем поведение: при переходе к сноскам нет смысла листать назад,
                // поэтому клик влево – переход обратно
                if (this._currentPage === this._annotationPage && this._backPage) {
                    this.moveBackFromAnnotation();
                } else {
                    this._currentPage -= this._listBy;
                    this._updateScrollPosition();
                }
            }
        },

        firstPage: function () {
            this._currentPage = 0;

            this._updateScrollPosition();
        },
        lastPage: function () {
            this._currentPage = this._pageCount - this._listBy;

            this._updateScrollPosition();
        },
        zoomIn: function () {
            this._updateFontSize(this._fontSize + FONT_SIZE_STEP);
        },
        zoomOut: function () {
            this._updateFontSize(this._fontSize - FONT_SIZE_STEP);
        },
        zoomReset: function () {
            this._resetFontSize();
        },

        /**
         * Хак для картинок, т.к max-height, max-width для них не работает
         * Хак для элементов section, у которых та же история
         */
        _updateMaxMins: function () {
            var h = this._bookCanvasHeight;
            var w = this._bookCanvasWidth;

            if (this._oldHeight !== h) {
                this.elem('image').map(function (i, elem) {
                    var $elem = $(elem);
                    $elem.find('img').css({
                        'max-width': w + 'px',
                        'max-height': h + 'px'
                    });

                    $elem.toggleClass('image-small', $elem.height() < h);
                });

                this.elem('section').css({
                    'min-height': h + 'px'
                });

                this._oldHeight = h;
            }
        },

        /**
         * Возвращает предыдущую страницу
         *
         * @returns {Number}
         */
        getBackPage: function () {
            return this._backPage && (this._backPage + 1) || null;

        },

        /**
         * Возвращает текущую страницу
         *
         * @returns {Number}
         */
        getCurrentPage: function () {
            return this._currentPage + 1;
        },

        /**
         * Возвращает общее количество страниц в книге
         *
         * @returns {Number}
         */
        getTotalPages: function () {
            return this._pageCount;
        },

        /**
         * Возвращает уникальный идентификатор книги
         * @return {String} id
         */
        getBookId: function () {
            this._isbn = this._isbn ||
                this._find(this._xml, 'isbn') ||
                this._find(this._xml, 'id') ||
                this._find(this._xml, 'title') ||
                '';

            return this._isbn.textContent;
        },

        getEstimatedTime: function () {
            // пока закомменчено но может понадобиться
            //var symbolsInBook = this._book.attr('data-symbols');
            var estimated = this.getTotalPages() * this._avgSymbolsOnPage -
                this.getCurrentPage() * this._avgSymbolsOnPage;
            var estimatedMins = Math.floor(estimated / this.getSpeed());

            //      hours                     minutes
            return [Math.floor(estimatedMins / 60), estimatedMins % 60];
        },

        /**
         * Изменение страницы
         * Функция в том числе включет пересчет важных параметров и физическое изменение скролла до нужной страницы
         * @param {Boolean} [params.noAnimation] – изменить страницу без анимации (по-умолчанию анимация будет)
         * @param {Boolean} [params.dontChangeFirstElement] - не пересчитывать первый элемент на странице
         * @param {Boolean} [params.isNextPage] - вызван метод ля следующей страницы
         */
        _updateScrollPosition: function (params) {
            var noAnimation = params && params.noAnimation;
            var dontChangeFirstElement = params && params.dontChangeFirstElement;

            if (this.isLastPage()) {
                this._currentPage = this._pageCount - this._listBy;
            }
            if (this.isFirstPage()) {
                this._currentPage = 0;
            }

            var newLeftPosition = this._pageStepWidth * this._currentPage;

            if (noAnimation || typeof TweenLite === 'undefined') {
                this._bookPlaceholder.scrollLeft(newLeftPosition);

                // Сбрасываем первый элемент
                if (!dontChangeFirstElement) {
                    this._firstElementOnPage = this._getKeeper();
                }
            } else {
                TweenLite.to(this._bookPlaceholder, 0.25, {
                    scrollTo: {
                        x: newLeftPosition
                    },
                    ease: Power2.easeOut,
                    onComplete: function () {
                        //  Сбрасываем первый элемент
                        if (!dontChangeFirstElement) {
                            this._firstElementOnPage = this._getKeeper();
                        }
                    }.bind(this)
                });
            }

            if (!params || !params.isNextPage) {
                this._previousPaging = null;
            }

            this.emit('page-changed');

            this._storePagePosition();

        },

        /**
         * Изменение размера шрифта
         */
        _onChangeFontSize: function () {
            // Пересчитываем параметры страницы
            this._calcDimensions();

            // Подстраиваем левые границы для текущей страницы --
            // размеры листа могут поменяться, если в данном браузере работает единица ch
            this._updateScrollPosition({
                noAnimation: true,
                dontChangeFirstElement: true
            });

            // После изменения размеров ищем где теперь находится элемент, который был первым ранее
            this._currentPage = this._whatPageIsDOMElem(this._firstElementOnPage, true);

            // Меняем страницу без анимации на ту, где виден элемент
            this._updateScrollPosition({
                noAnimation: true,
                dontChangeFirstElement: true
            });
        },

        /**
         * Установка значения fontSize
         *
         * @param {Number} fontSize новое значение fontSize
         */
        _setFontSize: function (fontSize) {
            this._fontSize = fontSize;

            // Меняем физически размеры шрифта
            this._bookPlaceholder.css('font-size', this._fontSize + 'px');
        },
        /**
         * Обновить значение размера шрифта
         * @param {Number} newFontSize разница между текущим шрифтом и новым
         */
        _updateFontSize: function (newFontSize) {
            if (this._fontSizeLimits[0] <= newFontSize && this._fontSizeLimits[1] >= newFontSize) {
                this.emit('reset-zoom-buttons');
                this._settings.save('font-size', newFontSize);

                this._setFontSize(newFontSize);
                this._onChangeFontSize();
            }

            if (this._fontSizeLimits[1] <= newFontSize) {
                this.emit('disabled-zoom-in');
            }

            if (this._fontSizeLimits[0] >= newFontSize) {
                this.emit('disabled-zoom-out');
            }
        },

        /**
         * Сбросить значение размера шрифта до первоначального
         */
        _resetFontSize: function () {
            this._fontSize = this._defaultFontSize;

            this._onChangeFontSize();
        },

        /**
         * Функция возращает true, если мы на первой странице или меньше (возможно при ресайзе)
         *
         * @returns {Boolean}
         */
        isFirstPage: function () {
            return this._currentPage <= 0;
        },

        /**
         * Функция возращает true, если мы на последней странице или больше (возможно при ресайзе)
         *
         * @returns {Boolean}
         */
        isLastPage: function () {
            return this._currentPage >= this._pageCount - this._listBy;
        },

        /**
         * Функция подсчета количества страниц в книге
         * формула: ширина книги + ширина распорки между страницами (т.к на n страниц – n-1 распорка)
         *          поделённая на ширину страницы книги + ширину распорки.
         *
         * @return {Number} количество страниц в книге
         */
        _getBookPages: function () {
            var bookDOMWidth = this._bookDOM.scrollWidth;

            return Math.floor((bookDOMWidth + this._gapWidth) /
                    (Math.floor(this._pageWidth) + this._gapWidth));
        },

        /////////////////////////////////////////////////////////////////////
        _flush: function () {
            this._currentPage = null;
            this._isbn = null;
            this._elementsToPages = {};

            // Важно отписаться от прошлых событий, иначе возможны двойные срабатывания
            this._unsubscribeFromLinksEvents();
        },

        _prepareBook: function (file) {
            this._flush();

            var pathToBook = file || this._getOptions().url;

            return parser.readFile(pathToBook, file ? true : false)
                .then(parser.getXml)
                .then(this._convertToHtml.bind(this))
                .then(this._render.bind(this))
                .then(this._setup.bind(this))
                .done(this._onBookChange.bind(this))
                .fail(this._fail.bind(this));
        },

        _fail: function (e) {
            alert('Ошибка: ' + e);
            this.emit('load-fail');
        },

        /**
         * Находит ноду selector в переданном xml (для ускорения написания)
         *
         * @param {XMLTree} xml
         * @param {String} selector
         *
         * @returns {Node} возвращает найденный в xml узел, соответствующий selector
         */
        _find: function (xml, selector) {
            return xml.querySelector(selector);
        },

        _convertToHtml: function (xml) {
            this._xml = xml;

            if (this._xsl) {
                var d = $.Deferred();
                d.resolve(this._xsltTransform(xml, this._xsl));

                return d.promise();
            }

            return $.ajax({
                dataType: 'xml',
                url: window.document.location.href + 'lib/reader.xsl'
            }).then(function (xsl) {
                return this._xsltTransform(xml, xsl);
            }.bind(this));
        },

        _xsltTransform: function (xml, xsl) {
            this._xsl = xsl;

            var html;
            // code for IE
            if (window.ActiveXObject) {
                html = xml.transformNode(xsl);
                // code for Chrome, Firefox, Opera, etc.
            } else if (document.implementation && document.implementation.createDocument) {
                var xsltProcessor = new XSLTProcessor();
                xsltProcessor.importStylesheet(xsl);
                html = xsltProcessor.transformToFragment(xml, document);
            }

            return html;
        },

        /**
         * @private
         * Функция проверки на то доступен ли данный формат книг для чтения в данном окружении
         *
         * @param {String} format строчное название формата
         * @returns {Boolean}
         */
        _isAvailable: function () {
            // Нет технологий
            if (!this._hasTechnologies(
                'Blob',
                'FileReader',
                'ArrayBuffer',
                'Uint8Array',
                'XSLTProcessor',
                'DataView')) {
                return false;
            }

            // Opera 12 падает по RangeError
            if (window.opera && parseInt(window.opera.version(), 10) <= 12) {
                return false;
            }

            return true;
        },

        /**
         * @private
         * Проверка на доступность технологии в данном окружении
         * каждый аргумент – это технология, наличие которой проверяется в окружении
         * @returns {Boolean}
         */
        _hasTechnologies: function () {
            return [].map.call(arguments, function (tech) {
                // Без window не сработает в IE
                return typeof window[tech] !== 'undefined';
            }).indexOf(false) === -1;
        }
    }, {
        getBlockName: function () {
            return 'chitalka-fb2';
        }
    });

    provide(ChitalkaFb2);
});
