var getElementXpath = require('element-xpath');

exports.getSelection = function($el){
  var range;

  if($el){
    range = new Range();
    range.selectNode($el);
  } else{
    var sel = window.getSelection();
    if(!sel.isCollapsed){
      range = sel.getRangeAt(0);
    }
  }

  if(!range){
    return;
  }

  var $ancestor = range.commonAncestorContainer;
  if ($ancestor.nodeType === 3) {
    //get closest Element
    $el = sel.anchorNode.parentElement;
  } else if($ancestor.nodeType === 1) {
    $el = $ancestor;
  };

  var it = document.createNodeIterator($el, NodeFilter.SHOW_ALL);
  var node;
  var i = 0;
  var start, end;

  while (node = it.nextNode()) {
    if (node === range.startContainer){
      console.log(node, i);
      start = i;
    } else if (node === range.endContainer){
      end = i;
    }
    i++;
  }

  return {
    xPath: getElementXpath($el),
    start: start,
    end: end,
    startOffset: range.startOffset,
    endOffset: range.endOffset
  };
};

exports.getRange = function(oa){
  var range = new Range();
  var $el = _getElementByXPath(oa.xPath);
  var startNode;

  if(oa.start !== undefined){
    startNode = _getNodeByOffset($el, oa.start);
  } else {
    startNode = $el;
  }
  range.setStart(startNode, oa.startOffset);

  if(oa.end !== undefined){
    range.setEnd(_getNodeByOffset($el, oa.end), oa.endOffset);
  } else {
    range.setEnd(startNode, oa.endOffset);
  }

  return range;
};


function _getNodeByOffset($root, offset){

  var it = document.createNodeIterator($root, NodeFilter.SHOW_ALL);
  var node;
  var i = 0;

  while (node = it.nextNode()) {
    if (i === offset){
      return node;
    }
    i++;
  }

};

function _getElementByXPath(xPath) {
  var result = document.evaluate(xPath, document.documentElement, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return  result.singleNodeValue;
};

//TODO
//  var match = document.evaluate('//*[text()[contains(.,"' + 'sed' + '")]]',document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
//  console.log(match);
//  console.log(match.iterateNext());
//  console.log(match.iterateNext());
