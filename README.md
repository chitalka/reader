# chitalka
Welcome to chitalka.js repository. It is a JavaScript-library to read fb2 books.

And [demo](http://chitalka.github.io/demo/), just drag-n-drop fb2-file at your computer to window and read! Or you can read Anna Karenina... :)

## Project Structure
```
.enb            ENB configuration
build           BTJSON template and build css, js files output
client          blocks
client/core     chitalka.js blocks
client/islets   islets blocks
lib             library files and xsl
```

## Build
Just type at your command line `make` then you need to add route to path `build/index` at your nginx (or etc) config and finally it works
