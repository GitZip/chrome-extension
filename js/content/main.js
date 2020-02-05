// It would work on github.com

var repoExp = new RegExp("^https://github.com/([^/]+)/([^/]+)(/(tree|blob)/([^/]+)(/(.*))?)?");
/**
 * Resolve the github repo url for recognize author, project name, branch name, and so on.
 * @private
 * @param {string} repoUrl - The github repo url.
 * @param {ResolvedURL}
 */
function resolveUrl(repoUrl){
    if(typeof repoUrl != 'string') return false;
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

function base64toBlob(base64Data, contentType) {
    contentType = contentType || '';
    var sliceSize = 1024;
    var byteCharacters = atob(base64Data);
    var bytesLength = byteCharacters.length;
    var slicesCount = Math.ceil(bytesLength / sliceSize);
    var byteArrays = new Array(slicesCount);

    for (var sliceIndex = 0; sliceIndex < slicesCount; ++sliceIndex) {
        var begin = sliceIndex * sliceSize;
        var end = Math.min(begin + sliceSize, bytesLength);

        var bytes = new Array(end - begin);
        for (var offset = begin, i = 0; offset < end; ++i, ++offset) {
            bytes[i] = byteCharacters[offset].charCodeAt(0);
        }
        byteArrays[sliceIndex] = new Uint8Array(bytes);
    }
    return new Blob(byteArrays, { type: contentType });
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

function callAjax(url, token){
	return new Promise(function(resolve, reject){
		var xmlhttp;
	    // compatible with IE7+, Firefox, Chrome, Opera, Safari
	    xmlhttp = new XMLHttpRequest();
	    xmlhttp.onreadystatechange = function(){
	        if (xmlhttp.readyState == 4){
	        	if(xmlhttp.status == 200){
	        		resolve(xmlhttp);
	        	}else if(xmlhttp.status >= 400){
	        		reject(xmlhttp);
	        	}
	        }
	    }
	    xmlhttp.responseType = "json";
	    xmlhttp.open("GET", url, true);
	    if ( token ) xmlhttp.setRequestHeader("Authorization", "token " + token);
	    xmlhttp.send();
	});
}

function gaTrackMessage(baseRepo, githubUrl) {
	chrome.runtime.sendMessage({
		action: "gaTrack",
		baseRepo: baseRepo,
		githubUrl: githubUrl,
		userAction: "collected"
	});
}

var itemCollectSelector = ".repository-content .js-navigation-container tr.js-navigation-item:not(.up-tree)";

var Pool = {
	_locked: false,
	_el: null,
	_dashBody: null,
	_arrow: null,
	init: function(){
		// create dom
		// Make the dom on right bottom
		var self = this;

		if(!self._el){
			var wrap = document.createElement('div'),
				arrow = document.createElement('div'),
				dash = document.createElement('div'),
				down = document.createElement('p'),
				tip = document.createElement('p');
			
			wrap.className = "gitzip-collect-wrap";
			dash.className = "gitzip-collect-dash";
			arrow.className = "gitzip-collect-arrow";
			down.className = "gitzip-collect-down";
			tip.className = "gitzip-collect-tip";

			tip.appendChild(document.createTextNode("Download checked items"));
			
			down.appendChild(document.createTextNode("\u27A0"));

			dash.appendChild(
				(function(){
					var c = document.createElement("div");
					c.className = "gitzip-header";
					c.appendChild(document.createTextNode("Progress Dashboard"));

					var close = document.createElement("span");
					close.className = "gitzip-close";
					close.appendChild(document.createTextNode("\u2715"));
					close.addEventListener('click', function(){ self.reset(); });

					c.appendChild(close);
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

			// arrow
			arrow.appendChild(down);
			arrow.appendChild(tip);

			// wrap			
			wrap.appendChild(arrow);
			wrap.appendChild(dash);

			document.body.appendChild(wrap);

			self._el = wrap;
			self._dashBody = dash.querySelector(".gitzip-body");
			self._arrow = arrow;

			// hook events
			down.addEventListener('click', function(){ self.download(); });
			tip.addEventListener('click', function(){ self.download(); });
		}
		
		self.reset();
	},
	show: function(){ this._arrow && this._arrow.classList.add("gitzip-show"); },
	hide: function(){ this._arrow && this._arrow.classList.remove("gitzip-show"); },
	reset: function(){
		var self = this;
		!!checkHaveAnyCheck()? self.show() : self.hide();
		self._el.classList.remove("gitzip-downloading");
		self._el.classList.remove("gitzip-fail");
		while (self._dashBody.firstChild) {
			self._dashBody.removeChild(self._dashBody.firstChild);
		}
		self._locked = false;
	},
	checkTokenAndScope: function(){
		var self = this;
		var checkUrl = "https://api.github.com/rate_limit";
		var isPrivate = !!document.querySelector(".repohead-details-container h1.private");

		return new Promise(function(res, rej){
			chrome.runtime.sendMessage({action: "getKey"}, function(response){ res(response); });
		}).then(function(key){
			
			if ( !key ) {
				if ( isPrivate ) return Promise.reject("You should have token with `repo` scope.");
				else {
					self.log("Running in the rate limit.", "warn");
					return key;
				}
			}

			self.log("Check token and scopes...");
			
			return callAjax(checkUrl, key)
				.then(function(xmlResponse){
					// return status 200 means token is valid
					if ( isPrivate ) {
						var strScopes = xmlResponse.getResponseHeader("X-OAuth-Scopes");
						var scopes = strScopes ? strScopes.split(",").map(function(str){ return str.trim(); }) : null;
						if ( !scopes || scopes.indexOf("repo") == -1 ) {
							return Promise.reject("Your token cannot access private repo.");
						}
					}
					return key;
				});
		}).catch(function(err){
			if ( typeof err == "string" ) {
				self.log(err, "error");
				self.log("Please click GitZip extension icon to get private token.", "warn");
				return Promise.reject();
			} else return Promise.reject(err);
		});
	},
	handleApiError: function(xmlResponse){
		var self = this;
		if ( xmlResponse ) {
			var status = xmlResponse.status;
			var response = xmlResponse.response;
			var message = (response && response.message) ? response.message : xmlResponse.statusText;
			self.log(message, "error");
			if (message.indexOf("rate limit exceeded") >= 0){
				self.log("Please click GitZip extension icon to get token or input your token.", "warn");
			}
			if ( status == 401 ) {
				self.log("Your token is invalid, please re-login github and get token again.", "warn");
			}
		}
	},
	downloadPromiseProcess: function(resolvedUrl, treeAjaxItems, blobAjaxCollection){
		var self = this,
			fileContents = [],
			currentKey = "";

		// start progress
		self.checkTokenAndScope().then(function(key){
			currentKey = key || "";
			var promises = treeAjaxItems.map(function(item){
				var fetchedUrl = item.url + "?recursive=1";
				return callAjax(fetchedUrl, currentKey).then(function(xmlResponse){
					var treeRes = xmlResponse.response;
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
	 			var fetchedUrl = item.blobUrl;
	 			return callAjax(fetchedUrl, currentKey).then(function(xmlResponse){
	 				var blobRes = xmlResponse.response;
	 				fileContents.push({ path: item.path, content: blobRes.content });
	 				self.log(item.path + " content has collected.");
	 			});
	 		});
	 		return Promise.all(promises);
		}).then(function(){
			if ( treeAjaxItems.length == 0 && blobAjaxCollection.length == 1) {
				self.log("Trigger download...");
				// to save as file
				var singleItem = fileContents[0];
				return saveAs(base64toBlob(singleItem.content), singleItem.path);
			} else {
				self.log("Zip contents and trigger download...");
				return zipContents([resolvedUrl.project].concat(resolvedUrl.path.split('/')).join('-'), fileContents);
			}
		}).then(function(){
			self.reset();
		}).catch(function(err){
			self.handleApiError(err);
		});
	},
	downloadItems: function(items){
		var self = this;
		if(self._locked || !items.length) return;

		self._locked = true;

		self._el.classList.add("gitzip-downloading");

		var treeAjaxItems = [];
		var blobAjaxCollection = [];
		var resolvedUrl = resolveUrl(window.location.href);
		
		self.log("Collect blob urls...");

		for(var idx = 0, len = items.length; idx < len; idx++){
			var item = items[idx],
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
				gaTrackMessage(baseRepo, githubUrl);
			}
		}
		
		self.downloadPromiseProcess(resolvedUrl, treeAjaxItems, blobAjaxCollection);
	},
	downloadSingle: function(selectedEl){
		this.downloadItems( selectedEl.querySelectorAll("p.gitzip-check-mark") );
	},
	downloadAll: function(){
		this.downloadItems(document.querySelectorAll(itemCollectSelector + " p.gitzip-check-mark"));
	},
	download: function(){
		this.downloadItems(document.querySelectorAll(itemCollectSelector + " p.gitzip-show"));
	},
	downloadFile: function(resolvedUrl){
		var self = this;
		if(self._locked) return;

		self._locked = true;

		self._el.classList.add("gitzip-downloading");

		var breadcrumb = document.querySelector(".repository-content .file-navigation .breadcrumb"),
			rootAnchor = breadcrumb ? breadcrumb.querySelector("a") : null;
		if ( rootAnchor && rootAnchor.href ) {
			// for the cases like this: https://github.com/Microsoft/CNTK/blob/aayushg/autoencoder/Tools/build-and-test
			// to find the branch in the case of branch has slash charactor.
			var hrefSplits = rootAnchor.href.split("/tree/");
			if ( hrefSplits.length > 1 && resolvedUrl.branch != hrefSplits[1] ) {
				var newBranch = hrefSplits[1];
				var inputSplits = resolvedUrl.inputUrl.split(newBranch);
				var newPath = inputSplits[1].slice(1);
				var newRoot = "https://github.com/" + resolvedUrl.author + "/" + resolvedUrl.project + "/tree/" + newBranch;

				resolvedUrl.branch = newBranch;
				resolvedUrl.path = newPath;
				resolvedUrl.rootUrl = newRoot;
			}
		}
		
		self.checkTokenAndScope().then(function(key){
			self.log("Collect blob content...");
			
			currentKey = key || "";
			var params = [];
			var fetchedUrl = "https://api.github.com/repos/" + resolvedUrl.author + "/" + resolvedUrl.project + "/contents/" + resolvedUrl.path;

			if ( resolvedUrl.branch ) params.push("ref=" + resolvedUrl.branch);
			if ( params.length ) fetchedUrl += "?" + params.join('&');

			return callAjax(fetchedUrl, currentKey);
		}).then(function(xmlResponse){
			var treeRes = xmlResponse.response;
			self.log(treeRes.name + " content has collected.");
			self.log("Trigger download...");
			return saveAs(base64toBlob(treeRes.content), treeRes.name);
		}).then(function(){
			self.reset();
		}).catch(function(err){
			self.handleApiError(err);
		});
	},
	log: function(message, type){
		var self = this,
			pNode = document.createElement("p"),
			textNode = document.createTextNode(message);

		type && pNode.classList.add(type);
		if (type == "error") self._el.classList.add("gitzip-fail");

		pNode.appendChild(textNode);

		self._dashBody.appendChild(pNode);
		self._dashBody.scrollTop = self._dashBody.scrollHeight - self._dashBody.clientHeight;
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

var currentSelectEl = null;
function generateEnterItemHandler(title, type){
	return function(){
		var self = this;
		chrome.runtime.sendMessage({action: "updateContextSingle", urlName: title, urlType: type}, function(response) {
			currentSelectEl = self;
		});
	}
}

function restoreContextStatus(){
	var resolvedUrl = resolveUrl(window.location.href);
	var repoContent = document.querySelector(".repository-content"),
		breadcrumb = repoContent ? repoContent.querySelector(".file-navigation .breadcrumb") : null,
		pathText = breadcrumb ? breadcrumb.innerText : "",
		urlType = "";

	if ( pathText && typeof resolvedUrl.type == "string" && resolvedUrl.type.length ) {
		var pathSplits = pathText.split('/');
		pathSplits.shift();
		if ( pathSplits[pathSplits.length - 1] == "" ) pathSplits.pop();
		pathText = pathSplits.join('/');
		urlType = resolvedUrl.type;
	}
	chrome.runtime.sendMessage({action: "updateContextSingle", urlName: pathText, urlType: urlType}, function(response) {
		currentSelectEl = null;
	});
}

// Check is in available view
function isAvailableView(){
	return !!document.querySelector("head meta[value=repo_source]") && resolveUrl(window.location.href) !== false;
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
					item.addEventListener("mouseenter", generateEnterItemHandler(title, type, sha, link.href) );
				}
			}
		}
	}

	function hookMouseLeaveEvent(bindEl){
		if ( bindEl && !bindEl._hookLeave ) {
			bindEl.addEventListener("mouseleave", restoreContextStatus);
			bindEl._hookLeave = true;
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
							hookMouseLeaveEvent(el);
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

	hookMouseLeaveEvent(fileWrap);
	
	appendToIcons();

	Pool.init();
}

// pjax detection
function hookMutationObserver(){
	// select the target node
	var target = document.querySelector("*[data-pjax-container]");
	
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
			case "github-tab-active":
				// from the background event
				// means tab active changed.
				if ( isAvailableView() ) {
					chrome.runtime.sendMessage({action: "createContextSingle"});
					restoreContextStatus();
				} else {
					chrome.runtime.sendMessage({action: "removeContext"});
				}
				return true;
			case "gitzip-single-clicked":
				if ( currentSelectEl ) {
					Pool.downloadSingle(currentSelectEl);
				} else {
					var resolvedUrl = resolveUrl(window.location.href);
					var baseRepo = [resolvedUrl.author, resolvedUrl.project].join("/");
					var fileNavigation = document.querySelector(".repository-content .file-navigation"),
						breadcrumb = fileNavigation ? fileNavigation.querySelector(".breadcrumb") : null,
						downloadBtn = fileNavigation ? fileNavigation.querySelector("details a[href^='/" + baseRepo + "/']") : null;
					if ( breadcrumb && breadcrumb.innerText ) {
						if ( resolvedUrl.type == "tree" ) {
							// in tree view
							Pool.downloadAll();
						} else if ( resolvedUrl.type == "blob" ) {
							// in file view
							Pool.downloadFile(resolvedUrl);
						} else {
							alert("Unknown Operation");
						}
					} else if ( downloadBtn ) {
						// in root
						downloadBtn.click();
					} else {
						alert("Unknown Operation");
					}
				}
				return true;
		}
	});
}

// Property run_at is "document_end" as default in Content Script
// refers: https://developer.chrome.com/extensions/content_scripts
hookMutationObserver();
hookItemEvents();
hookContextMenus();
