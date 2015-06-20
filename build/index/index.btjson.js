module.exports = {
    "block": "y-page",
    "title": "Я.Читалка",
    "styles": [
        {"url": "index.css"}
    ],
    "scripts": [
        {"url": "index.{lang}.js"}
    ],
    "body": [
        {
            block: 'y-block'
        },
        {
            block: 'jquery'
        },
        {
            "block": "chitalka-ui",
            "book": {
                "block": "chitalka-fb2",
                "url": "i/Anna-Karenina.fb2.zip",
                "progress": true,
                "footnotes": "appendix",
                "pages": "auto"
            },
            "progress": "read",
            "progress_bar": true,
            "controls": {
                // Если параметр не передается - выставляем true иначе выставляем то, что передается
                "zoom": true,
                "arrows": true
            },
            "annotations": true
        }
    ]
}
