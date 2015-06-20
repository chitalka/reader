modules.define('config', function (provide) {
    var domNode = document.getElementById('config');
    provide(domNode ? JSON.parse(domNode.innerHTML) : {});
});
