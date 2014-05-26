var getElementXpath = require('element-xpath');

exports.getSelection = function($el){
  var range;

  if($el){
    range = document.createRange();
    range.selectNodeContents($el);
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
    range: range,
    selection: {
      xPath: getElementXpath($el),
      start: start,
      end: end,
      startOffset: range.startOffset,
      endOffset: range.endOffset
    }
  };
};

exports.getRange = function(oaSelection){
  var range = document.createRange();
  var $el = _getElementByXPath(oaSelection.xPath);
  var startNode;

  if(oaSelection.start !== undefined){
    startNode = _getNodeByOffset($el, oaSelection.start);
  } else {
    startNode = $el;
  }
  range.setStart(startNode, oaSelection.startOffset);

  if(oaSelection.end !== undefined){
    range.setEnd(_getNodeByOffset($el, oaSelection.end), oaSelection.endOffset);
  } else {
    range.setEnd(startNode, oaSelection.endOffset);
  }

  return range;
};

exports.highlight = function(range, style){

  //  var rect = range.getBoundingClientRect();

  var rects = range.getClientRects();
  for (var i = 0; i != rects.length; i++) {
    var rect = rects[i];
    console.log(rect);

    var highlightDiv = document.createElement('div');

    var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    var scrollLeft = document.documentElement.scrollLeft || document.body.scrollLeft;

    highlightDiv.style.top = (rect.top + scrollTop) + 'px';
    highlightDiv.style.left = (rect.left + scrollLeft) + 'px';
    highlightDiv.style.width = rect.width + 'px';
    highlightDiv.style.height = rect.height + 'px';
    highlightDiv.style.zIndex = -1;

    highlightDiv.style.margin = highlightDiv.style.padding = '0';
    highlightDiv.style.position = 'absolute';

    if(style){
      for(var key in style){
        highlightDiv.style[key] = style[key];
      }
    } else {
      highlightDiv.style.backgroundColor = 'rgba(122,122,122,0.2)';
    }

    document.body.appendChild(highlightDiv);
  }

  //TODO: return divs
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
