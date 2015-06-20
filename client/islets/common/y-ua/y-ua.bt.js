module.exports = function (bt) {

    bt.match('y-ua', function (ctx) {
        ctx.setTag('script');
        ctx.disableCssClassGeneration();
        ctx.disableDataAttrGeneration();
        ctx.setContent([
            ';(function (d,e,c,r){' +
                'e=d.documentElement;' +
                'c="className";' +
                'r="replace";' +
                'e[c]=e[c][r]("y-ua_js_no","y-ua_js_yes");' +
                'if(d.compatMode!="CSS1Compat")' +
                'e[c]=e[c][r]("y-ua_css_standart","y-ua_css_quirks")' +
            '})(document);' +
            ';(function (d,e,c,r,n,w,v,f){' +
                'e=d.documentElement;' +
                'c="className";' +
                'r="replace";' +
                'n="createElementNS";' +
                'f="firstChild";' +
                'w="http://www.w3.org/2000/svg";' +
                'e[c]+=!!d[n]&&!!d[n](w,"svg").createSVGRect?" y-ua_svg_yes":" y-ua_svg_no";' +
                'v=d.createElement("div");' +
                'v.innerHTML="<svg/>";' +
                'e[c]+=(v[f]&&v[f].namespaceURI)==w?" y-ua_inlinesvg_yes":" y-ua_inlinesvg_no";' +
            '})(document);'
        ]);
    });

};
