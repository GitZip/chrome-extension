// It would work on github.com

var repoExp = new RegExp("^https://github.com/([^/]+)/([^/]+)(/(tree|blob)/([^/]+)(/(.*))?)?");

var isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

const defaultOptions = {
	selectBehaviour: 'both',
	theme: 'default',
	adEnable: true
};

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

function getInfoUrl(author, project, path, branch) {
	return "https://api.github.com/repos/"
		 + author + "/" + project + "/contents/"
		 + path + (branch ? ("?ref=" + branch) : "");
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
    var currDate = new Date();
	var dateWithOffset = new Date(currDate.getTime() - currDate.getTimezoneOffset() * 60000);
	// replace the default date with dateWithOffset
	JSZip.defaults.date = dateWithOffset;

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

function hasRepoContainer(list) {
	if ( list && list.length ) {
		for (var i = 0, len = list.length; i < len; i++) {
			var item = list[i];
			if (item.querySelector && item.querySelector(".repository-content")) {
				return true;
			}
		}
	}
	return false;
}

var itemCollectSelector = ".repository-content .js-navigation-item";

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
			
			wrap.className = "gitzip-collect-wrap" + (isDark ? " gitzip-dark" : "");
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
		var isPrivate = !!document.querySelector(".flex-auto .octicon-lock");

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
	downloadPromiseProcess: function(resolvedUrl, infoAjaxItems){
		var self = this,
			fileContents = [],
			currentKey = "";

		var treeAjaxItems = [];
		var blobAjaxCollection = [];

		// start progress
		self.checkTokenAndScope().then(function(key){
			currentKey = key || "";
			var infoUrl = getInfoUrl(resolvedUrl.author, resolvedUrl.project, resolvedUrl.path, resolvedUrl.branch);
			return callAjax(infoUrl, currentKey).then(function(xmlResponse){
				var listRes = xmlResponse.response;
				listRes
					.filter(function(item){
						return infoAjaxItems.some(function(info){
							return info.title == item.name && (
								(info.type == 'tree' && item.type == 'dir') || 
								(info.type == 'blob' && item.type == 'file')
							);
						});
					})
					.forEach(function(item){
						if(item.type == "dir"){
							treeAjaxItems.push({ title: item.name, url: item.git_url });
						}else{
							blobAjaxCollection.push({ path: item.name, blobUrl: item.git_url });	
							self.log(item.name + " url fetched.")
						}	
					});
			});
		}).then(function(){
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

		var infoAjaxItems = [];
		var resolvedUrl = resolveUrl(window.location.href);
		
		self.log("Collect blob urls...");

		for(var idx = 0, len = items.length; idx < len; idx++){
			var item = items[idx].closest("div.gitzip-check-wrap"),
				type = item.getAttribute('gitzip-type'),
				title = item.getAttribute('gitzip-title'),
				href = item.getAttribute('gitzip-href');

			infoAjaxItems.push({
				type: type,
				title: title,
				href: href
			});
		}
		
		self.downloadPromiseProcess(resolvedUrl, infoAjaxItems);
	},
	downloadSingle: function(selectedEl){
		this.downloadItems( selectedEl.querySelectorAll("div.gitzip-check-wrap") );
	},
	downloadAll: function(){
		this.downloadItems(document.querySelectorAll(itemCollectSelector + " div.gitzip-check-wrap"));
	},
	download: function(){
		this.downloadItems(document.querySelectorAll(itemCollectSelector + " div.gitzip-check-wrap input:checked"));
	},
	downloadFile: function(resolvedUrl){
		var self = this;
		if(self._locked) return;

		self._locked = true;

		self._el.classList.add("gitzip-downloading");

		var breadcrumb = document.querySelector(".repository-content .file-navigation .js-path-segment"),
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

function applyTheme() {
	if (Pool._el) {
		isDark && Pool._el.classList.add("gitzip-dark");
		!isDark && Pool._el.classList.remove("gitzip-dark");
	}
}

chrome.storage.local.get(defaultOptions, function(items){
	if (items) {
		if (items.theme == "default") isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		else isDark = items.theme == "dark";
		applyTheme();
	}
});

chrome.storage.onChanged.addListener(function(changes, area){
	if (area == "local" && changes.theme) {
		var newValue = changes.theme.newValue;
		if (newValue == "default") isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		else isDark = newValue == "dark";
		applyTheme();
	}
});

function createMark(parent, height, title, type, href){
	var target = parent.querySelector("div.gitzip-check-wrap");
	if (parent && !target) {
		var checkw = document.createElement('div');
		var cb = document.createElement("input");
		
		cb.type = "checkbox";

		checkw.setAttribute("gitzip-title", title);
		checkw.setAttribute("gitzip-type", type);
		checkw.setAttribute("gitzip-href", href);

		checkw.className = "gitzip-check-wrap";

		checkw.appendChild(cb);
		parent.appendChild(checkw);

		target = checkw;
	}
	return target;
}

function checkHaveAnyCheck(){
	var checkItems = document.querySelectorAll(itemCollectSelector + " div.gitzip-check-wrap input:checked");
	return checkItems.length? checkItems : false;
}

function onItemDblClick(e){
	var markTarget = e.target.closest(".js-navigation-item").querySelector('div.gitzip-check-wrap');
	if(markTarget) {
		var cb = markTarget.querySelector('input');
		cb.click();
	}
}

function onItemEnter(e) {
	var markTarget = e.target.closest(".js-navigation-item").querySelector('div.gitzip-check-wrap');
	if (markTarget && !markTarget.style.display) {
		markTarget.style.display = "flex";
	}
}

function onItemLeave(e) {
	var markTarget = e.target.closest(".js-navigation-item").querySelector('div.gitzip-check-wrap');
	if (markTarget && !markTarget.querySelector('input:checked')) {
		markTarget.style.display = "";
	}
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
	var fileNavigation = document.querySelector(".repository-content .file-navigation");
	var singleFileNavigation = document.querySelector(".repository-content .breadcrumb .js-repo-root");
	var breadcrumb, pathText, urlType = "";

	if ( fileNavigation && (breadcrumb = fileNavigation.querySelector(".js-repo-root")) ) {
		// in tree view
		pathText = resolvedUrl.path.split('/').pop();
		urlType = resolvedUrl.type;
	} else if ( singleFileNavigation ) {
		// in file view
		pathText = resolvedUrl.path.split('/').pop();
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
					link = item.querySelector("a[href]"),
					blob = item.querySelector(".octicon-file-text, .octicon-file"),
					tree = item.querySelector(".octicon-file-directory");
				
				if(!item._hasBind && link && (tree || blob)){
					var title = link.textContent,
						type = tree? "tree" : "blob";

					// reset status if not checked
					onItemLeave({ target: item });
					
					var markTarget = createMark(item, item.offsetHeight, title, type, link.href);
					markTarget.querySelector("input").addEventListener('change', function(){
						!!checkHaveAnyCheck()? Pool.show() : Pool.hide();
					});

					item.addEventListener("dblclick", onItemDblClick);
					item.addEventListener("mouseenter", generateEnterItemHandler(title, type, link.href) );

					item.addEventListener("mouseenter", onItemEnter);
					item.addEventListener("mouseleave", onItemLeave);

					item._hasBind = true;
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
	var lazyElement = repoContent ? repoContent.querySelector(".js-navigation-container") : null;

	if(lazyElement){
		// lazy case
		// var lazyTarget = document.querySelector(".js-details-container");
		lazyCaseObserver = new MutationObserver(function(mutations) {
			mutations.forEach(function(mutation) {
				var addNodes = mutation.addedNodes;
				addNodes && addNodes.length && addNodes.forEach(function(el){
					var foundEl = null;
					if(el.classList && el.classList.contains("js-navigation-container")){
						foundEl = el;
					} else if (el.querySelector && el.parentElement == repoContent) {
						foundEl = el.querySelector(".js-navigation-container");
					}
					if (foundEl) {
						hookMouseLeaveEvent(foundEl);
						appendToIcons();
						Pool.reset();
						// lazyCaseObserver.disconnect();
						// lazyCaseObserver = null;
					}
				});
			});    
		});
		lazyCaseObserver.observe(repoContent, { childList: true, subtree: true } );
	} 
	
	var item;
	if (item = document.querySelector(itemCollectSelector)) {
		hookMouseLeaveEvent(item.closest(".js-navigation-container"));
		appendToIcons();
	}

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
			if(hasRepoContainer(addNodes)) {
				hookItemEvents();
			}
		});    
	});
	 
	// pass in the target node, as well as the observer options
	target && observer.observe(target, { childList: true } );
	 
	// later, you can stop observing
	// observer.disconnect();
}

function hookChromeEvents(){
	
	chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
		switch (request.action){
			case "getCurrentPath":
				sendResponse(window.location.href);
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

					var fileNavigation = document.querySelector(".repository-content .file-navigation");
					var singleFileNavigation = document.querySelector(".repository-content .breadcrumb .js-repo-root");

					var breadcrumb,
						downloadBtn = fileNavigation ? fileNavigation.querySelector("div[data-target='get-repo.modal'] a[href^='/" + baseRepo + "/']") : null;

					if ( fileNavigation && (breadcrumb = fileNavigation.querySelector(".js-repo-root")) ) {
						// in tree view
						Pool.downloadAll();
					} else if ( singleFileNavigation ) {
						// in file view
						Pool.downloadFile(resolvedUrl);
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
hookChromeEvents();
