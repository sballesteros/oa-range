var util = require("util")
  , ssb = require('./scrollbar')
  , uuid = require('uuid')
  , clone = require('clone');

//////////////////////////////////////////////
//
//  Linker
//    Create links between resources and extracts of the article.
//    Store and restore them.
//
//    Structure of the article:
//    The reference unit are articleComponent class units. It generally
//    correspondsto a row. These generally contain a set of (nested) spans.
//
//    Creating a link, 2 ways:
//    - drop a resource on an articleComponent
//    - select a piece of text, which is then marked up as 'resource-anchor-pending'
//      If the user then clicks on a resource, the markup is transformed to
//      'resource-anchor'. Otherwise it's removed (when user clicks anywhere else).
//
//    Markup:
//    - Each link is characterized by a uuid called groupId, and a resourceId.
//      These can be found in the class property of every <a> tag expressing this
//      link.
//    - In simplest cases there is only one <a> tag, but several are needed as soon
//      as the link spans over multiple articleComponents, or when the link cuts
//      a span. A finer level of granularity is then needed, at span level.
//
//    Link storage:
//    Linker has a 'linkState' property, which contains 'resource2article'
//    e.g. If 'resource1' has been linked to groups 'gefgkrl' and 'pmeylh',
//    resource2article.resource1 contains 2 keys, 'gefgkrl' and 'pmeylh'.
//    Each of these keys contains a list of selector objects:
//      sel.id  : id of the articleComponent containing that link
//      sel.beg : index of the start of the selection in the innerHTML of the
//                articleComponent before adding the markup
//      sel.end : index of the end of the selection in the innerHTML of the
//                articleComponent before adding the markup
//
//    Note: current code can crash if different resources are linked to
//    (non-overlapping) bits of the same articleComponent, because beg and end
//    are defined including previous links markup if there are any. This can be
//    patched by correcting beg and end, but let's check that this solution is the
//    best with regards to open annotation spec.


function Linker(){
  this.initialized = false;
};


Linker.prototype.init = function(readOnly){
  var that = this;

  this.readOnly = readOnly;
  this.initialized = true;
  this.linkState = linkStateInit();
  ssb.scrollbar('page-container');

  var $cont = document.getElementById('page-container');
  $cont.addEventListener('scroll', onArticleScroll, false);

  var $tabs = document.createElement("div");
  $tabs.id = 'ssb-tabs';
  document.getElementById('page-container-wrap').appendChild($tabs);

  if(!readOnly){

    var $article = document.getElementById('pdf');
    $article.addEventListener('dragenter', function(e){handleDragEnter(e,that)}, false);
    $article.addEventListener('dragover', function(e){handleDragOver(e,that)}, false);
    $article.addEventListener('dragleave', function(e){handleDragLeave(e,that)}, false);
    $article.addEventListener('drop', function(e){handleDrop(e,that)}, false);

    document.getElementById('pdf').addEventListener('mouseup', function(e){that.newPendingLink(e)}, false);

  }

  var $linkIcon = document.createElement("div");
  $linkIcon.id = 'linkIcon';
  $linkIcon.innerHTML = '<i class="fa fa-link link"></i>  Click on a resource to create a link';
  $linkIcon.style.display = 'none';
  document.getElementById('pkg').appendChild($linkIcon);

  var $delete = document.createElement("div");
  $delete.id = 'delete-link';
  $delete.innerHTML = '<i class="fa fa-times"></i>';
  $delete.style.display = 'none';
  $cont.appendChild($delete);
};

Linker.prototype.newResource = function(resourceId){
  if(!this.initialized) return;

  var that = this;
  if(resourceId!=null){
    this.linkState['resource2article'][resourceId] = {};
    if(!that.readOnly){
      var $resource = document.getElementById(resourceId);
      $resource.draggable = 'true';
      $resource.addEventListener('dragstart', function(e){handleDragStart(e,that)}, false);
      $resource.addEventListener('dragend', function(e){handleDragEnd(e,that)}, false);
    }
  }
};


Linker.prototype.removeResource = function(resourceId){
  if(!this.initialized) return;

  var that = this;
  while(Object.keys(this.linkState['resource2article'][resourceId]).length>0){
    var groupId = Object.keys(this.linkState['resource2article'][resourceId])[0];
    var $tmp = document.getElementsByClassName('groupId-'+groupId)[0];
    that.removeLink($tmp);
  }
  delete this.linkState['resource2article'][resourceId];
};

Linker.prototype.newLinkOnClick = function(elem){
  elem.addEventListener('click',this.newLink,false);
};

Linker.prototype.newPendingLink = function(e){

  var that = this;

  var selection = [];
  if( (getSelectionHtml().replace(' ','').length>0) && (getSelectionHtml().length<20000) ){

    $article = document.getElementById('pdf');
    var sel = window.getSelection();
    var selHtml = getSelectionHtml();
    var alreadyLinked = false;

    if(selHtml.indexOf('id="ac')==-1){ // selected area is contained within an article component.

      // climb up to the parent articleComponent
      var sel = {};
      var depth = 0;
      var tmp = window.getSelection().anchorNode;
      while( (depth<6) && ( (tmp.id === undefined) || (tmp.id === '') ) ){
        tmp = tmp.parentNode;
        depth += 1;
      }
      sel.id = tmp.id;

      if(sel['id']!=''){
        var indComp = $article.innerHTML.indexOf('id="'+sel['id']+'"');
        indComp += $article.innerHTML.slice(indComp,$article.innerHTML.length).indexOf('>');
        var beg = $article.innerHTML.slice(indComp,$article.innerHTML.length).indexOf(selHtml);
        var end = beg + selHtml.length;
        sel['beg'] = beg -1 ;
        sel['end'] = end -1 ;
        var ind = $article.innerHTML.slice(0, indComp + end).lastIndexOf('resource-anchor');
        if ( (ind!=-1) && ($article.innerHTML.slice(ind,beg + indComp).indexOf('</a>')== -1) ){
          alreadyLinked = true ;
        }
        selection.push(sel);
      }

    } else { // selected area overlaps different article components

      var remainingSel = selHtml;
      var acInd;
      var articleLength = $article.innerHTML.length;
      var first = true;

      while(remainingSel.indexOf('id="ac')!=-1){
        var sel = {};
        acInd = remainingSel.indexOf('id="ac');
        sel['id'] = remainingSel.slice(acInd+4,acInd+4 + remainingSel.slice(acInd+4).indexOf('"'));
        remainingSel = remainingSel.slice(acInd+remainingSel.slice(acInd).indexOf('>')+1);

        var indComp = $article.innerHTML.indexOf('id="'+sel['id']+'"');
        indComp += $article.innerHTML.slice(indComp).indexOf('>');

        // Test if current component is the first one, and selection ends within a span
        var firstGroupSplittedSpans = false;
        if(first){
          if(remainingSel.slice(0,5)=='<span'){ // starts with <span
            if($article.innerHTML.slice(indComp,5)!='<span'){ // <span> has been artificially added by getSelectionHtml
              firstGroupSplittedSpans = true;
              remainingSel = remainingSel.slice(remainingSel.indexOf('>')+1);
            }
          }
        }

        // Test if current component is the last one, and selection ends within a span
        var lastGroupSplittedSpans = false;
        if(remainingSel.indexOf('id="ac')==-1){
          if(remainingSel.slice(remainingSel.length-13,remainingSel.length-6)=='</span>'){ // finishes with </span></div>
            if($article.innerHTML.slice(indComp).indexOf(remainingSel.slice(0,remainingSel.indexOf('</div>')))==-1){ // </span> has been artificially added by getSelectionHtml
              lastGroupSplittedSpans = true;
              remainingSel = remainingSel.slice(0,remainingSel.length-13);
            }
          }
        }

        if ( (!firstGroupSplittedSpans) && (!lastGroupSplittedSpans) ) {

          var beg = $article.innerHTML.slice(indComp).indexOf(remainingSel.slice(0,remainingSel.indexOf('</div>')));
          var end = beg + remainingSel.indexOf('</div>');
          sel['beg'] = beg-1 ;
          sel['end'] = end-1 ;
          var ind = $article.innerHTML.slice(0, indComp + end).lastIndexOf('resource-anchor');
          if ( (ind!=-1) && ($article.innerHTML.slice(ind,beg + indComp).indexOf('</a>')== -1) ){
            alreadyLinked = true ;
          }
          selection.push(sel);
          remainingSel = remainingSel.slice(remainingSel.indexOf('</div>')+6);

        } else if (lastGroupSplittedSpans){
          // Tricky case: selection ended in the middle of a span.
          // We need to go down to lower level of granularity.

          var currentInd = 0;
          while(remainingSel.length>0){
            // one span at a time
            var sel2 = {};
            sel2['id'] = sel['id'];

            if(remainingSel.slice(0,5)=='<span'){
              sel2['beg'] = currentInd + remainingSel.indexOf('>');
              remainingSel = remainingSel.slice(remainingSel.indexOf('>')+1);
            } else if (remainingSel.slice(0,6)=='</span'){
              sel2['beg'] = currentInd + remainingSel.indexOf('>');
              remainingSel = remainingSel.slice(remainingSel.indexOf('>')+1);
            } else {
              sel2['beg'] = currentInd;
            }

            currentInd = sel2['beg'];

            if( (remainingSel.indexOf('<span')>-1) && (remainingSel.indexOf('<span')<remainingSel.indexOf('</span')) ){
              sel2['end'] = currentInd + remainingSel.indexOf('<span');
              currentInd = currentInd + remainingSel.indexOf('<span');
              remainingSel = remainingSel.slice(remainingSel.indexOf('<span'));
            } else if ( remainingSel.indexOf('</span')>-1){
              sel2['end'] = currentInd + remainingSel.indexOf('</span');
              currentInd = currentInd + remainingSel.indexOf('</span');
              remainingSel = remainingSel.slice(remainingSel.indexOf('</span'));
            } else {
              sel2['end'] = currentInd + remainingSel.length;
              remainingSel = '';
            }

            selection.push(sel2);

            if(remainingSel === '</span>'){
              remainingSel = '';
            }

          }

        } else {
          // firstGroupSplittedSpans
          // Tricky case: selection starts in the middle of a span.
          // We need to go down to lower level of granularity.
          var currentInd = $article.innerHTML.slice(indComp).indexOf(remainingSel.slice(0,remainingSel.indexOf('</div>')))-1;
          while(remainingSel.indexOf('</div>')>0){
            // one span at a time

            var sel2 = {};
            sel2['id'] = sel['id'];

            if(remainingSel.slice(0,5)=='<span'){
              sel2['beg'] = currentInd + remainingSel.indexOf('>');
              remainingSel = remainingSel.slice(remainingSel.indexOf('>')+1);
            } else if (remainingSel.slice(0,6)=='</span'){
              sel2['beg'] = currentInd + remainingSel.indexOf('>');
              remainingSel = remainingSel.slice(remainingSel.indexOf('>')+1);
            } else {
              sel2['beg'] = currentInd;
            }
            currentInd = sel2['beg'];

            if( (remainingSel.slice(0,remainingSel.indexOf('</div>')).indexOf('<span')>-1) && (remainingSel.indexOf('<span')<remainingSel.indexOf('</span')) ){
              sel2['end'] = currentInd + remainingSel.indexOf('<span');
              currentInd = currentInd + remainingSel.indexOf('<span');
              remainingSel = remainingSel.slice(remainingSel.indexOf('<span'));
            } else if ( remainingSel.slice(0,remainingSel.indexOf('</div>')).indexOf('</span')>-1){
              sel2['end'] = currentInd + remainingSel.indexOf('</span');
              currentInd = currentInd + remainingSel.indexOf('</span');
              remainingSel = remainingSel.slice(remainingSel.indexOf('</span'));
            } else {
              sel2['end'] = currentInd + remainingSel.slice(0,remainingSel.indexOf('</div>')).length;
              remainingSel = '';
            }
            selection.push(sel2);

          }
        }
        first = false;
      }


    }

    if(!alreadyLinked){
      // we forbid overlapping links

      var $linkIcon = document.getElementById("linkIcon");
      $linkIcon.style.display = 'block';

      var groupId = uuid.v1();

      var currentGroup = '-1';
      var currentLag = 0;

      selection.forEach(function(x){
        var $target = document.getElementById(x.id);

        if(x.id!=currentGroup){
          currentLag = 0;
          currentGroup = x.id;
        }

        var bef = $target.innerHTML.length;

        var tmp = $target.innerHTML.slice(0,x['beg']+currentLag);
        tmp += '<a class="resource-anchor-pending groupId-' + groupId + '" dataset-beg="' + x['beg'] + '" dataset-end="' + x['end'] + '" >';
        tmp += $target.innerHTML.slice(x['beg']+currentLag,x['end']+currentLag) ;
        tmp += '</a>';
        tmp += $target.innerHTML.slice(x['end']+currentLag,$target.innerHTML.length) ;

        var aft = tmp.length;

        currentLag += aft - bef;

        $target.innerHTML = tmp;

        onArticleScroll();
      });

      function removePendingLink(e){
        Array.prototype.forEach.call(document.getElementsByClassName("shell-section"),function(x){
          x.removeEventListener('click', that.newLink, false);
        })
        document.removeEventListener('click', removePendingLink, false);
        while(document.getElementsByClassName('resource-anchor-pending').length>0){
          var $tmp = document.getElementsByClassName('resource-anchor-pending')[0];
          $tmp = $tmp.parentNode;
          var beg1 = $tmp.innerHTML.indexOf('resource-anchor-pending');
          beg1 = $tmp.innerHTML.slice(0,beg1).lastIndexOf('<');
          var end1 = beg1 + $tmp.innerHTML.slice(beg1,$tmp.innerHTML.length).indexOf('>')+1;
          var beg2 = end1 + $tmp.innerHTML.slice(end1,$tmp.innerHTML.length).indexOf('</a>');
          var tmp = $tmp.innerHTML.slice(0,beg1) + $tmp.innerHTML.slice(end1,beg2) + $tmp.innerHTML.slice(beg2+4,$tmp.innerHTML.length);
          $tmp.innerHTML = tmp;
        }
        var $linkIcon = document.getElementById("linkIcon");
        $linkIcon.style.display = 'none';
      };

      Array.prototype.forEach.call(document.getElementsByClassName("shell-section"),function(x){
        if(x.id != 'shell-package'){
          x.linker = that;
          x.addEventListener('click',that.newLink,false);
        }
      })
      document.addEventListener('click', removePendingLink, false);

    }

  }

};



function onArticleScroll(){

  var $cont = document.getElementById('page-container');
  var H = window.getComputedStyle(document.getElementById('pkg-editor')).height;
  var top = $cont.scrollTop;
  var bottom = $cont.scrollTop+H;
  var totalHeight = 120 + $cont.scrollHeight;
  var topProp = top/totalHeight*(H-60);
  var bottomProp = bottom/totalHeight*(H-60);

  var scrollbarPad = 12;
  var $bar = document.getElementsByClassName('ssb_st')[0];
  var $cont = document.getElementById('page-container');
  var ratio = ($bar.offsetHeight - 2 * scrollbarPad  ) / $cont.scrollHeight;
  var $sb = document.getElementsByClassName('ssb_sb')[0];
  var topsb = getValue(window.getComputedStyle($sb).top);
  var hsb = getValue(window.getComputedStyle($sb).height);

  Array.prototype.forEach.call(document.getElementsByClassName('ssb-tab'), function(t,i){
    var toptab = getValue(t.style.top);
    var htab = getValue(t.style.height);
    var r = t.dataset.resource;
    if( (topsb<toptab+htab) && (topsb+hsb>toptab) ){
      if(t.className.indexOf('tab-highlight')==-1){
        t.className += ' tab-highlight';
      }
    } else {
      t.className = t.className.replace(' tab-highlight','');
    }
  });

};


function linkStateInit(){

  var LinkState = { 'resource2article' : {} };
  return LinkState;

};


function getLinkResourceId(x){
  var res = '';
  Array.prototype.forEach.call(x.classList,function(t){
    if(t.indexOf('resourceId-')>-1){
      res =  t.slice(11,t.length);
    }
  })
  return res;
}

function getLinkGroupId(x){
  var res = '';
  Array.prototype.forEach.call(x.classList,function(t){
    if(t.indexOf('groupId-')>-1){
      res = t.slice(8,t.length);
    }
  })
  return res;
}

Linker.prototype.newLink = function(e){
  var that = this.linker;
  e.stopPropagation();

  var $resource = e.target;
  var test = false;
  while(!test){
    if($resource.className != null){
      if($resource.className.indexOf('shell-section')>-1){
        test = true;
      }
    }
    if(!test){
      $resource = $resource.parentNode;
    }
  }

  var groupId = getLinkGroupId(document.getElementsByClassName('resource-anchor-pending')[0]);
  var resourceId = $resource.firstElementChild.title;

  x = document.getElementsByClassName('resource-anchor-pending')[0];

  // adding tab
  var $tab = document.createElement("div");
  $tab.className = 'ssb-tab';
  $tab.id = "tabLink___"+groupId+'___'+ encodeURIComponent(resourceId);
  $tab.dataset.resource = resourceId;
  var scrollbarPad = document.getElementById('page-container').sw;
  var $bar = document.getElementsByClassName('ssb_st')[0];
  var $cont = document.getElementById('page-container');
  var ratio = ($bar.offsetHeight - 2 * scrollbarPad  ) / $cont.scrollHeight;
  var H = getValue(window.getComputedStyle(document.getElementById('pkg-editor')).height);
  var totalHeight = document.getElementById('page-container').scrollHeight;
  if(document.getElementsByClassName('resource-anchor-pending')[0].parentNode.id!=''){
    var $tmp = document.getElementsByClassName('resource-anchor-pending')[0].parentNode;
  } else {
    var $tmp = document.getElementsByClassName('resource-anchor-pending')[0].parentNode.parentNode;
  }
  var $page = x.parentNode;
  while($page.className.indexOf('pf')==-1){
    $page = $page.parentNode;
  }
  var ind = $page.className.indexOf('page_');
  var pageNum =  parseInt($page.className.slice(ind+5,$page.className.length).split(' ')[0],10);
  var hlag = 0;
  var vlag = 0;
  if($tmp.parentNode.className.indexOf('c ')==0){
    vlag = getValue(window.getComputedStyle($tmp.parentNode,null).bottom) ;
    hlag = getValue(window.getComputedStyle($tmp.parentNode,null).left) ;
  }
  $tab.style.top = scrollbarPad + (getValue(window.getComputedStyle($page,null).height)*pageNum + 12*(pageNum-1) - vlag - getValue(window.getComputedStyle($tmp,null).bottom) )*ratio+'px';
  var first = getValue(window.getComputedStyle(document.getElementsByClassName('resource-anchor-pending')[0].parentNode).bottom);
  var $lastResource = document.getElementsByClassName('resource-anchor-pending')[document.getElementsByClassName('resource-anchor-pending').length-1];
  var depth = 0;
  while( isNaN(getValue(window.getComputedStyle($lastResource).bottom)) && (depth<6) ){
    $lastResource = $lastResource.parentNode;
    depth += 1;
  }
  var last = getValue(window.getComputedStyle($lastResource).bottom);
  $tab.style.height = Math.max(5,(first-last)*ratio) + 'px';
  $tab.setAttribute('barRef', parseFloat($bar.offsetHeight - 2 * scrollbarPad));
  $tab.setAttribute('topRef', parseFloat(getValue($tab.style.top) - scrollbarPad));
  $tab.setAttribute('heightRef', parseFloat((first-last)*ratio));

  var color = window.getComputedStyle($resource.firstElementChild).borderColor || window.getComputedStyle($resource.firstElementChild).borderBottomColor ;
  $tab.style.backgroundColor = changeTransparency(color,0.4);

  document.getElementById('ssb-tabs').appendChild($tab);
  onArticleScroll();

  Array.prototype.forEach.call(document.getElementsByClassName('resource-anchor-pending'), function(x,i){

    x.className += ' resourceId-' + $resource.firstElementChild.title;

    var resourceId = getLinkResourceId(x);

    if(i==0){
      that.linkState['resource2article'][resourceId][groupId] = [] ;
    }

    var selection = {};
    if(x.parentNode.id != ''){
      selection['id'] = x.parentNode.id;
    } else {
      selection['id'] = x.parentNode.parentNode.id;
    }
    selection['beg'] = x.getAttribute('dataset-beg');
    selection['end'] = x.getAttribute('dataset-end');
    that.linkState['resource2article'][resourceId][groupId].push(selection);

    x.onclick = function(e){
      e.preventDefault();
      var event = new MouseEvent('click', {
        'view': window,
        'bubbles': true,
        'cancelable': true
      });
      $target = e.target;
      if ($target.className.indexOf('resource-anchor') == -1){
        $target = $target.parentNode;
      }
      var resourceId = getLinkResourceId($target);
      var $resource = document.getElementById(resourceId);

      $resource.dispatchEvent(event);
    }

    if(!that.readOnly){
      x.onmouseenter= function(e){
        if(e.target.parentNode.id != ''){
          $target = e.target.parentNode;
        } else {
          $target = e.target.parentNode.parentNode;
        }
        $delete = document.getElementById('delete-link');
        var $page = $target.parentNode;
        while($page.className.indexOf('pf')==-1){
          $page = $page.parentNode;
        }
        $page.getElementsByClassName('pc')[0].appendChild($delete);
        var hlag = 0;
        var vlag = 0;
        if($target.parentNode.className.indexOf('c ')==0){
          vlag = getValue(window.getComputedStyle($target.parentNode,null).bottom) ;
          hlag = getValue(window.getComputedStyle($target.parentNode,null).left) ;
        }

        var resourceId = getLinkResourceId(e.target);
        if (e.target.className.indexOf('resource-anchor') == -1){
          resourceId = getLinkResourceId(e.target.parentNode);
        }
        var $resource = document.getElementById(resourceId);

        window.clearTimeout(that.currentTimeout);
        that.currentTimeout = '';
        $delete.setAttribute('resourceId', resourceId);
        $delete.setAttribute('groupId', getLinkGroupId($target));
        $delete.style.display = '';
        var color = window.getComputedStyle($resource.firstElementChild).borderColor || window.getComputedStyle($resource.firstElementChild).borderBottomColor ;
        $delete.style.color = color;
        $delete.style.left = getValue(window.getComputedStyle($target,null).left) - 16 + hlag +  'px';
        $delete.style.bottom = getValue(window.getComputedStyle($target,null).bottom) + vlag - 5 + 'px';

        var clickedOn = e.target;
        $delete.onclick = function(e){ that.removeLink(clickedOn) };
      }

      x.onmouseleave = function(e){
        that.currentTimeout  = window.setTimeout(function(){
          that.currentTimeout = '';
          document.getElementById('delete-link').style.display = 'none';
        },1000);
      }

    }

  });

  while(document.getElementsByClassName('resource-anchor-pending').length>0){
    x = document.getElementsByClassName('resource-anchor-pending')[0];
    x.className = x.className.replace('-pending','');
    var color = window.getComputedStyle($resource.firstElementChild).borderColor || window.getComputedStyle($resource.firstElementChild).borderBottomColor ;
    x.style.borderBottomColor = color;
  };

  function removePendingLink(e){
    Array.prototype.forEach.call(document.getElementsByClassName("shell-section"),function(x){
      x.removeEventListener('click', that.newLink, false);
    })
    document.removeEventListener('click', removePendingLink, false);
    while(document.getElementsByClassName('resource-anchor-pending').length>0){
      var $tmp = document.getElementsByClassName('resource-anchor-pending')[0];
      $tmp = $tmp.parentNode;
      var beg1 = $tmp.innerHTML.indexOf('resource-anchor-pending');
      beg1 = $tmp.innerHTML.slice(0,beg1).lastIndexOf('<');
      var end1 = beg1 + $tmp.innerHTML.slice(beg1,$tmp.innerHTML.length).indexOf('>')+1;
      var beg2 = end1 + $tmp.innerHTML.slice(end1,$tmp.innerHTML.length).indexOf('</a>');
      var tmp = $tmp.innerHTML.slice(0,beg1) + $tmp.innerHTML.slice(end1,beg2) + $tmp.innerHTML.slice(beg2+4,$tmp.innerHTML.length);
      $tmp.innerHTML = tmp;
    }
  };

  var $linkIcon = document.getElementById("linkIcon");
  $linkIcon.style.display = 'none';

  //
  Array.prototype.forEach.call(document.getElementsByClassName("shell-section"),function(x){
    x.removeEventListener('click', that.newLink, false);
  })
  document.removeEventListener('click', removePendingLink, false);

};



Linker.prototype.removeLink = function($target){

  var resourceId = getLinkResourceId($target) ;
  var groupId = getLinkGroupId($target);

  while(document.getElementsByClassName('groupId-'+groupId).length>0){
    var $element = document.getElementsByClassName('groupId-'+groupId)[0].parentNode;
    var beg1 = $element.innerHTML.indexOf('groupId-'+groupId);
    beg1 = $element.innerHTML.slice(0,beg1).lastIndexOf('<');
    var end1 = beg1 + $element.innerHTML.slice(beg1,$element.innerHTML.length).indexOf('>')+1;
    var beg2 = end1 + $element.innerHTML.slice(end1,$element.innerHTML.length).indexOf('</a>');
    var tmp;
    tmp = $element.innerHTML.slice(0,beg1) + $element.innerHTML.slice(end1,beg2) + $element.innerHTML.slice(beg2+4,$element.innerHTML.length);
    $element.innerHTML = tmp;
  }

  $target.onmouseenter = '';
  $target.onmouseout = '';
  $target.onclick = '';

  // remove in JSON
  delete this.linkState['resource2article'][resourceId][groupId];

  // remove tab
  var tabId = "tabLink___"+groupId+'___'+ encodeURIComponent(resourceId);
  $tab = document.getElementById(tabId)
  $tab.parentNode.removeChild($tab);

  document.getElementById('delete-link').style.display = 'none';

};

Linker.prototype.rescale = function(){

  if(!this.initialized) return;

  var scrollbarPad = document.getElementById('page-container').sw;

  Array.prototype.forEach.call(document.getElementsByClassName('ssb-tab'), function($tab){
    var $bar = document.getElementsByClassName('ssb_st')[0];

    var $header = document.getElementsByTagName('nav')[0];
    var hHead = getValue(window.getComputedStyle($header).height)+1;
    var hBar = parseInt($bar.offsetHeight - 2*scrollbarPad,10);
    var ratio = hBar/($tab.getAttribute('barRef'));
    $tab.style.top = scrollbarPad + $tab.getAttribute('topRef')*ratio + 'px';
    $tab.style.height = Math.max(5,$tab.getAttribute('heightRef')*ratio) + 'px';

  });

};

Linker.prototype.toJSON = function(){
  return this.linkState;
};

Linker.prototype.restoreLinks = function(linkState){

  if(!linkState || !linkState.resource2article) return;

  that = this;

  var linkStateSave = clone(linkState);

  while(document.getElementsByClassName('resource-anchor').length>0){
    that.removeLink(document.getElementsByClassName('resource-anchor')[0]);
  }

  var currentGroup = '-1';
  var currentLag = 0;

  Object.keys(linkStateSave['resource2article']).forEach(function(resourceId){
    Object.keys(linkStateSave['resource2article'][resourceId]).forEach(function(groupId){
      linkStateSave['resource2article'][resourceId][groupId].forEach(function(x){

        var $target = document.getElementById(x.id);

        if(x.id!=currentGroup){
          currentLag = 0;
          currentGroup = x.id;
        }

        var bef = $target.innerHTML.length;

        var tmp = $target.innerHTML.slice(0,parseInt(x['beg'],10)+currentLag);
        tmp += '<a class="resource-anchor-pending groupId-' + groupId + '" dataset-beg="' + parseInt(x['beg'],10) + '" dataset-end="' + parseInt(x['end'],10) + '" >';
        tmp += $target.innerHTML.slice(parseInt(x['beg'],10)+currentLag,parseInt(x['end'],10)+currentLag) ;
        tmp += '</a>';
        tmp += $target.innerHTML.slice(parseInt(x['end'],10)+currentLag,$target.innerHTML.length) ;

        var aft = tmp.length;

        currentLag += aft - bef;

        $target.innerHTML = tmp;

      })

      var $resource = document.getElementById(resourceId);

      // function attachNewLink(e){ that.newLink(e, that) };
      // that.newLinkOnClick($resource);
      $resource.linker = that;
      $resource.addEventListener('click', that.newLink, false);
      var event = new MouseEvent('click', {
        'view': window,
        'bubbles': true,
        'cancelable': true
      });
      document.getElementById(resourceId).dispatchEvent(event);

      $resource.removeEventListener('click',that.newLink, false);

    })
  })
};

function handleDragStart(e,linker) {
  // Target (this) element is the source node.
  e.target.style.opacity = '0.4';

  var dragSrcEl = e.target;

  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', e.target.id);
};

function handleDragOver(e,linker) {
  if (e.preventDefault) {
    e.preventDefault(); // Necessary. Allows us to drop.
  }

  e.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.

  return false;
};

function handleDragEnter(e,linker) {
  // this / e.target is the current hover target.
  if(e.target.className.indexOf('articleComponent') !== -1){
    e.target.classList.add('over');
  } else if (e.target.parentNode.className.indexOf('articleComponent') !== -1){
    e.target.parentNode.classList.add('over');
  } else if (e.target.parentNode.parentNode.className.indexOf('articleComponent') !== -1){
    e.target.parentNode.parentNode.classList.add('over');
  };
};

function handleDragLeave(e,linker) {
  if(e.target.className.indexOf('articleComponent') !== -1){
    e.target.classList.remove('over');  // this / e.target is previous target element.
  } else if (e.target.parentNode.className.indexOf('articleComponent') !== -1){
    e.target.parentNode.classList.remove('over');  // this / e.target is previous target element.
  } else if (e.target.parentNode.parentNode.className.indexOf('articleComponent') !== -1){
    e.target.parentNode.parentNode.classList.remove('over');  // this / e.target is previous target element.
  };
};

function handleDrop(e,linker) {

  e.preventDefault();

  var targetId;

  if(e.target.className.indexOf('articleComponent') !== -1){
    targetId = e.target.id;  // this / e.target is previous target element.
  } else if (e.target.parentNode.className.indexOf('articleComponent') !== -1){
    targetId = e.target.parentNode.id;  // this / e.target is previous target element.
  } else if (e.target.parentNode.parentNode.className.indexOf('articleComponent') !== -1){
    targetId = e.target.parentNode.parentNode.id;  // this / e.target is previous target element.
  };


  if(targetId!=null){
    if(document.getElementById(targetId).innerHTML.indexOf('resource-anchor')==-1){

      var $target = document.getElementById(targetId);
      var groupId = uuid.v1();

      var tmp = '<a class="resource-anchor-pending groupId-' + groupId + '" dataset-beg="0" dataset-end="' + $target.innerHTML.length + '" >';
      tmp += $target.innerHTML ;
      tmp += '</a>';
      $target.innerHTML = tmp;

      var $resource = document.getElementById(e.dataTransfer.getData('text/plain'));
      $resource.linker = linker;
      $resource.addEventListener('click', linker.newLink, false);

      var event = new MouseEvent('click', {
        'view': window,
        'bubbles': true,
        'cancelable': true
      });
      $resource.dispatchEvent(event);
      $resource.removeEventListener('click', linker.newLink, false);

    }

    e.target.classList.remove('over');
    if (e.stopPropagation) {
      e.stopPropagation(); // stops the browser from redirecting.
    }
  }

  return false;
};

function handleDragEnd(e) {
  // this/e.target is the source node.
  e.target.style.opacity = 1;
  Array.prototype.forEach.call(document.getElementsByClassName('articleComponent'), function (el) {
    el.classList.remove('over');
  });
};


function getSelectionHtml() {
  var html = "";

  if (typeof window.getSelection != "undefined") {
    var sel = window.getSelection();
    if (sel.rangeCount) {
      var container = document.createElement("div");
      for (var i = 0, len = sel.rangeCount; i < len; ++i) {
        container.appendChild(sel.getRangeAt(i).cloneContents());
      }
      html = container.innerHTML;
    }
  } else if (typeof document.selection != "undefined") {
    if (document.selection.type == "Text") {
      html = document.selection.createRange().htmlText;
    }
  }

  return html;
};

function getValue(x){
  return parseInt(x.slice(0,x.length-2));
};

function changeTransparency(rgb,t) {
  return 'rgba('+rgb.slice(4,-1)+','+t+')';
};

function getIdNumber(x){
  return parseInt(x.id.slice(2,x.length));
};


module.exports = Linker;
