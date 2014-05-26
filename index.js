var getElementXpath = require('element-xpath')
  , _ = require('underscore')
  , crypto = require('crypto');

exports.getOa = function($el, id){
  var range;



  if($el){
    range = document.createRange();
    range.selectNodeContents($el);
  } else {
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
      start = i;
    } else if (node === range.endContainer){
      end = i;
    }
    i++;
  }

  var oa = {
    range: range,
    selection: {
      xPath: getElementXpath($el),
      start: start,
      end: end,
      startOffset: range.startOffset,
      endOffset: range.endOffset
    }
  };

  if(id){
    oa.id = id;
  } else {
    var toHash = Object.keys(oa.selection)
      .sort()
      .map(function(x){return oa.selection[x];})
      .filter(function(x){return x;})
      .join('-');

    oa.id = crypto.createHash('sha1').update(toHash).digest('hex');
  }

  return oa;
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


/**
 * Note: the highlights will be out of place if the user resizes or zooms
 */
exports.highlight = function(oa, style){

  var range = oa.range;

  var bound = range.getBoundingClientRect();
  var rects = range.getClientRects();

  //rects are potentialy overlapping: get minimal number of rectangles

  //only keep rect of same height (most frequent).
  var heights = Array.prototype.map.call(rects, function(x){return x.height;});
  var counts = _.countBy(heights, function(x) { return x; });
  var sorted = Object.keys(counts).sort(function(a, b){return parseInt(counts[b],10)-parseInt(counts[a],10);}); //most frequent first
  var heightMostPopular = parseInt(sorted[0], 10);

  var rects = Array.prototype.filter.call(rects, function(x){return x.height === heightMostPopular;});
  var tops = _.uniq(rects.map(function(x){return x.top;}));

  var myRects = {};
  tops.forEach(function(top){
    myRects[top.toString()] = {left: bound.right, right: bound.left}; //will be replaced by smallest left and largest right
  });

  for (var i = 0; i < rects.length; i++) {
    var rect = rects[i];
    var key = rect.top.toString();

    myRects[key].top = rect.top;
    myRects[key].height = rect.height;

    if(rect.left < myRects[key].left){
      myRects[key].left = rect.left;
    }
    if(rect.right > myRects[key].right){
      myRects[key].right = rect.right;
    }
  }

  var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
  var scrollLeft = document.documentElement.scrollLeft || document.body.scrollLeft;

  for(var key in myRects) {
    var myrect = myRects[key];

    var highlightDiv = document.createElement('div');
    highlightDiv.className = 'oa-highlight ' +  oa.id;
    highlightDiv.style.top = (myrect.top + scrollTop) + 'px';
    highlightDiv.style.left = (myrect.left + scrollLeft) + 'px';
    highlightDiv.style.width = (myrect.right-myrect.left) + 'px';
    highlightDiv.style.height = myrect.height + 'px';
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

  //TODO: return array divs
};

exports.unhighlight = function(oa){
  var highlightDivs = document.getElementsByClassName(oa.id);
  while(highlightDivs.length){
    document.body.removeChild(highlightDivs[0]);
  }
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
