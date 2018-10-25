// It would work on github.com

var repoExp = new RegExp("^https://github.com/([^/]+)/([^/]+)(/(tree|blob)/([^/]+)(/(.*))?)?");
/**
 * Resolve the github repo url for recognize author, project name, branch name, and so on.
 * @private
 * @param {string} repoUrl - The github repo url.
 * @param {ResolvedURL}
 */
function resolveUrl(repoUrl){
    if(typeof repoUrl != 'string') return;
    var matches = repoUrl.match(repoExp);
    if(matches && matches.length > 0){
    	var rootUrl = (matches[5])?
            "https://github.com/" + matches[1] + "/" + matches[2] + "/tree/" + matches[5] :
            "https://github.com/" + matches[1] + "/" + matches[2];

    	var strType = matches[4];
    	if ( !strType && (repoUrl.length - rootUrl.length > 1) ) { // means no type and url different with root
    		return false;
    	}

        return {
            author: matches[1],
            project: matches[2],
            branch: matches[5],
            type: matches[4],
            path: matches[7] || '',
            inputUrl: repoUrl,
            rootUrl: rootUrl
        };
    }
    return false;
}

// https://api.github.com/repos/peers/peerjs/git/trees/bfd406219ffd35f4ad870638f2180b27b4e9c374
function getGitUrl(author, project, type, sha){
	if(type == "blob" || type == "tree"){
		type += "s";
		return ["https://api.github.com/repos", author, project, "git", type, sha].join('/');
	}else return false;	
}

function zipContents(filename, contents){
    var zip = new JSZip();
    contents.forEach(function(item){
        zip.file(item.path, item.content, {createFolders:true,base64:true});
    });
    return new Promise(function(res, rej){
    	zip.generateAsync({type:"blob"})
	    .then(function (content) {
	        saveAs(content, filename + ".zip");
	        res();
	    }, function(error){
	        console.log(error);
	        rej(error);
	    });
    });	
};

function callAjax(url){
	return new Promise(function(resolve, reject){
		var xmlhttp;
	    // compatible with IE7+, Firefox, Chrome, Opera, Safari
	    xmlhttp = new XMLHttpRequest();
	    xmlhttp.onreadystatechange = function(){
	        if (xmlhttp.readyState == 4){
	        	if(xmlhttp.status == 200){
	        		resolve(xmlhttp.response);
	        	}else if(xmlhttp.status >= 400){
	        		reject(xmlhttp.response);
	        	}
	        }
	    }
	    xmlhttp.responseType = "json";
	    xmlhttp.open("GET", url, true);
	    xmlhttp.send();
	});
}


var itemCollectSelector = ".repository-content .js-navigation-container tr.js-navigation-item:not(.up-tree)";

var Pool = {
	_locked: false,
	_el: null,
	_dashBody: null,
	init: function(){
		// create dom
		// Make the dom on right bottom
		var self = this;

		if(!self._el){
			var wrap = document.createElement('div'),
				dash = document.createElement('div'),
				down = document.createElement('p'),
				tip = document.createElement('p');
			
			wrap.className = "gitzip-collect-wrap";
			dash.className = "gitzip-collect-dash";
			down.className = "gitzip-collect-down";
			tip.className = "gitzip-collect-tip";

			tip.appendChild(document.createTextNode("Download checked items"));
			
			down.appendChild(document.createTextNode("\u27A0"));

			dash.appendChild(
				(function(){
					var c = document.createElement("div");
					c.className = "gitzip-header";
					c.appendChild(document.createTextNode("Progress Dashboard"));
					return c;
				})()
			);

			dash.appendChild(
				(function(){
					var c = document.createElement("div");
					c.className = "gitzip-body";
					return c;
				})()
			);

			wrap.appendChild(dash);
			wrap.appendChild(down);
			wrap.appendChild(tip);
			document.body.appendChild(wrap);

			self._el = wrap;
			self._dashBody = dash.querySelector(".gitzip-body");

			// hook events
			down.addEventListener('click', function(){ self.download(); });
			tip.addEventListener('click', function(){ self.download(); });
		}
		
		self.reset();
	},
	show: function(){ this._el && this._el.classList.add("gitzip-show"); },
	hide: function(){ this._el && this._el.classList.remove("gitzip-show"); },
	reset: function(){
		var self = this;
		!!checkHaveAnyCheck()? self.show() : self.hide();
		self._el.classList.remove("gitzip-downloading");
		while (self._dashBody.firstChild) {
			self._dashBody.removeChild(self._dashBody.firstChild);
		}
		self._locked = false;
	},
	download: function(){
		var self = this;
		if(self._locked) return;

		self._locked = true;

		self._el.classList.add("gitzip-downloading");

		var checkedItems = document.querySelectorAll(itemCollectSelector + " p.gitzip-show");

		self.log("Collect checked items...");
		var treeAjaxItems = [];
		var blobAjaxCollection = [];
		var fileContents = [];
		var resolvedUrl = resolveUrl(window.location.href);
		var currentKey = "";

		self.log("Collect blob urls...");

		for(var idx = 0, len = checkedItems.length; idx < len; idx++){
			var item = checkedItems[idx],
				sha = item.getAttribute('gitzip-sha'),
				type = item.getAttribute('gitzip-type'),
				title = item.getAttribute('gitzip-title'),
				url = getGitUrl(resolvedUrl.author, resolvedUrl.project, type, sha);

			if(type == "tree"){
				treeAjaxItems.push({ title: title, url: url });
			}else{
				blobAjaxCollection.push({ path: title, blobUrl: url });	
				self.log(title + " url fetched.")
			}
			// ga
			var looklink = item.closest("tr").querySelector("td.content a");
			if(looklink){
				var baseRepo = [resolvedUrl.author, resolvedUrl.project].join("/");
				var githubUrl = looklink.getAttribute("href").substring(1); // ignore slash "/" from begin
				chrome.runtime.sendMessage({
					action: "gaTrack",
					baseRepo: baseRepo,
					githubUrl: githubUrl,
					userAction: "collected"
				});
			}
		}

		// start progress
		new Promise(function(res, rej){
			chrome.runtime.sendMessage({action: "getKey"}, function(response){ res(response); });	
		}).then(function(key){
			currentKey = key || "";
			var promises = treeAjaxItems.map(function(item){
				var fetchedUrl = item.url + "?recursive=1" + (currentKey? ("&access_token=" + currentKey) : "");
				return callAjax(fetchedUrl).then(function(treeRes){
     				treeRes.tree.forEach(function(blobItem){
     					if(blobItem.type == "blob"){
     						var path = item.title + "/" + blobItem.path;
     						blobAjaxCollection.push({ path: path, blobUrl: blobItem.url });
     						self.log(path + " url fetched.");
     					}
     				});
				});
			});
			return Promise.all(promises);
		}).then(function(){
			self.log("Collect blob contents...");
			var promises = blobAjaxCollection.map(function(item){
	 			var fetchedUrl = item.blobUrl + (currentKey? ("?access_token=" + currentKey) : "");
	 			return callAjax(fetchedUrl).then(function(blobRes){
	 				fileContents.push({ path: item.path, content: blobRes.content });
	 				self.log(item.path + " content has collected.");
	 			});
	 		});
	 		return Promise.all(promises);
		}).then(function(){
			self.log("Zip contents and trigger download...");
			return zipContents([resolvedUrl.project].concat(resolvedUrl.path.split('/')).join('-'), fileContents);
		}).then(function(){
			self.reset();
		}).catch(function(err){
			console.log(err);
			var message = err.message? err.message : err;
			self.log(message);
			if (message.indexOf("rate limit exceeded") >= 0){
				self.log("<strong style='color:red;'>Please press GitZip extension icon to get token or input your token.</strong>");
			}
		});
		
	},
	log: function(message){
		this._dashBody.appendChild(document.createTextNode(message));
		this._dashBody.appendChild(document.createElement("br"));
		this._dashBody.scrollTop = this._dashBody.scrollHeight - this._dashBody.clientHeight;
	}
};

function createMark(parent, height, title, type, sha){
	if(parent && !parent.querySelector("p.gitzip-check-mark")){
		var checkp = document.createElement('p');

		checkp.setAttribute("gitzip-title", title);
		checkp.setAttribute("gitzip-type", type);
		checkp.setAttribute("gitzip-sha", sha);
		checkp.className = "gitzip-check-mark";
		checkp.appendChild(document.createTextNode("\u2713"));
		checkp.style.cssText = "line-height:" + height + "px;";
		
		parent.appendChild(checkp);
	}
}

function checkHaveAnyCheck(){
	var checkItems = document.querySelectorAll(itemCollectSelector + " td.icon p.gitzip-show");
	return checkItems.length? checkItems : false;
}

function onItemDblClick(e){
	var markTarget = e.target.closest("tr.js-navigation-item").querySelector('td.icon p.gitzip-check-mark');
	if(markTarget) markTarget.classList.toggle("gitzip-show");
	!!checkHaveAnyCheck()? Pool.show() : Pool.hide();
}

var currentSelection = {};
function generateEnterItemHandler(title, type, sha){
	return function(){
		chrome.runtime.sendMessage({action: "updateContextSingle", urlName: title, urlType: type}, function(response) {});
		currentSelection.title = title;
		currentSelection.type = type;
		currentSelection.sha = sha;
	}
}

function restoreContextStatus(){
	var resolvedUrl = resolveUrl(window.location.href);
	var repoContent = document.querySelector(".repository-content");
	var pathText = repoContent.querySelector(".file-navigation .breadcrumb").innerText,
		urlType = "";
		
	if ( pathText && typeof resolvedUrl.type == "string" && resolvedUrl.type.length ) {
		urlType = resolvedUrl.type;
	}
	chrome.runtime.sendMessage({action: "updateContextSingle", urlName: pathText, urlType: urlType}, function(response) {});
}

// Check is in available view
function isAvailableView(){
	return resolveUrl(window.location.href) !== false;
}

function hookItemEvents(){

	function appendToIcons(){
		var items = document.querySelectorAll(itemCollectSelector);
		var itemLen = items.length;
		if(itemLen){
			for(var i = 0; i < itemLen; i++){
				var item = items[i],
					icon = item.querySelector("td.icon"),
					link = item.querySelector("td.content a"),
					blob = icon.querySelector(".octicon-file-text, .octicon-file"),
					tree = icon.querySelector(".octicon-file-directory");	

				if(link && (tree || blob)){
					var title = link.textContent,
						type = tree? "tree" : "blob",
						sha = link.id.split('-')[1];

					createMark(icon, item.offsetHeight, title, type, sha);
					item.addEventListener("dblclick", onItemDblClick);
					item.addEventListener("mouseenter", generateEnterItemHandler(title, type, sha) );
				}
			}
		}
	}

	var lazyCaseObserver = null;
	var repoContent = document.querySelector(".repository-content");
	var fileWrap = repoContent ? repoContent.querySelector(".file-wrap") : null;

	if(fileWrap && fileWrap.tagName.toLowerCase() == "include-fragment"){
		// lazy case
		var lazyTarget = document.querySelector(".repository-content");
		if(lazyTarget){
			lazyCaseObserver = new MutationObserver(function(mutations) {
				mutations.forEach(function(mutation) {
					var addNodes = mutation.addedNodes;
					addNodes && addNodes.length && addNodes.forEach(function(el){
						if(el.classList && el.classList.contains("file-wrap") && lazyCaseObserver){
							// console.log("in mutation adds");
							appendToIcons();
							lazyCaseObserver.disconnect();
							lazyCaseObserver = null;
						}
					});
				});    
			});
			lazyCaseObserver.observe(lazyTarget, { childList: true } );
		}
	}

	if ( fileWrap && !fileWrap._hookLeave ) {
		fileWrap.addEventListener("mouseleave", restoreContextStatus);
		fileWrap._hookLeave = true;
	}

	appendToIcons();

	Pool.init();
}

// pjax detection
function hookMutationObserver(){
	// select the target node
	var target = document.querySelector("div[data-pjax-container]");
	
	// create an observer instance
	var observer = new MutationObserver(function(mutations) {
		mutations.forEach(function(mutation) {
			var addNodes = mutation.addedNodes;
			if(addNodes && addNodes.length) hookItemEvents();
		});    
	});
	 
	// pass in the target node, as well as the observer options
	observer.observe(target, { childList: true } );
	 
	// later, you can stop observing
	// observer.disconnect();
}

function hookContextMenus(){
	
	chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
		switch (request.action){
			case "current-tab-active":
				// from the background event
				// means tab active changed.
				// console.log(currentSelection); OK
				if ( isAvailableView() ) {
					chrome.runtime.sendMessage({action: "createContextSingle"}, function(response) {});
					restoreContextStatus();
				} else {
					chrome.runtime.sendMessage({action: "removeContext"}, function(response) {});
				}
				break;
			case "gitzip-single-clicked":
				alert("gitzip-single-clicked");
				break;
		}
	});
}

// Property run_at is "document_end" as default in Content Script
// refers: https://developer.chrome.com/extensions/content_scripts
hookMutationObserver();
hookItemEvents();
hookContextMenus();
