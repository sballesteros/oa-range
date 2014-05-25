//adapted from http://stackoverflow.com/questions/2661818/javascript-get-xpath-of-a-node

exports.createXPathFromElement = function(elm) {
  var allNodes = document.getElementsByTagName('*');

  for (var segs = []; elm && elm.nodeType == 1; elm = elm.parentNode){
    if (elm.hasAttribute('id')) {
      var uniqueIdCount = 0;
      for (var n=0;n < allNodes.length;n++) {
        if (allNodes[n].hasAttribute('id') && allNodes[n].id == elm.id) uniqueIdCount++;
        if (uniqueIdCount > 1) break;
      };
      if ( uniqueIdCount == 1) {
        segs.unshift('id("' + elm.getAttribute('id') + '")');
        return segs.join('/');
      } else {
        segs.unshift(elm.localName.toLowerCase() + '[@id="' + elm.getAttribute('id') + '"]');
      }
    } else if (elm.hasAttribute('class')) {
      segs.unshift(elm.localName.toLowerCase() + '[@class="' + elm.getAttribute('class') + '"]');
    } else {
      for (var i = 1, sib = elm.previousSibling; sib; sib = sib.previousSibling) {
        if (sib.localName == elm.localName)  i++;
      };
      segs.unshift(elm.localName.toLowerCase() + '[' + i + ']');
    };
  };

  return segs.length ? '/' + segs.join('/') : null;
};

exports.lookupElementByXPath = function(path) {
  var evaluator = new XPathEvaluator();
  var result = evaluator.evaluate(path, document.documentElement, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return  result.singleNodeValue;
};
