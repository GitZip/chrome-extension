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
        var root = (matches[5])?
            "https://github.com/" + matches[1] + "/" + matches[2] + "/tree/" + matches[5] :
            repoUrl;
        return {
            author: matches[1],
            project: matches[2],
            branch: matches[5],
            type: matches[4],
            path: matches[7] || '',
            inputUrl: repoUrl,
            rootUrl: root
        };
    }
}

// https://api.github.com/repos/peers/peerjs/git/trees/bfd406219ffd35f4ad870638f2180b27b4e9c374
function getGitUrl(author, project, type, sha){
	if(type == "blob" || type == "tree"){
		type += "s";
		return ["https://api.github.com/repos", author, project, "git", type, sha].join('/');
	}else return false;	
}

var zipContents = function(filename, contents){
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

			tip.innerHTML = "Download checked items";
			down.innerHTML = "&#x27A0;";

			dash.innerHTML = '<div class="gitzip-header">Progress Dashboard</div><div class="gitzip-body"></div>';

			wrap.append(dash);
			wrap.append(down);
			wrap.append(tip);
			document.body.append(wrap);

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
		self._dashBody.innerHTML = "";
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
		this._dashBody.innerHTML += message + "<br/>";
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
		checkp.innerHTML = "&#x2713;"
		checkp.style.cssText = "line-height:" + height + "px;";
		
		parent.append(checkp);

		return true;
	}
	return false;
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

function initElements(){
	
	function appendToIcons(){
		var items = document.querySelectorAll(itemCollectSelector);
		var itemLen = items.length;
		if(itemLen){
			for(var i = 0; i < itemLen; i++){
				var item = items[i];
				
				var icon = item.querySelector("td.icon");
				var link = item.querySelector("td.content a");
				var blob = icon.querySelector(".octicon-file-text");
				var tree = icon.querySelector(".octicon-file-directory");
				
				if(link && (tree || blob)){
					createMark(
						icon, 
						item.offsetHeight, 
						link.textContent, 
						tree? "tree" : "blob", 
						link.id.split('-')[1]
					) && item.addEventListener("dblclick", onItemDblClick);
				}
			}
		}
	}

	Pool.init();

	var lazyCaseObserver = null;
	var fileWrap = document.querySelector(".repository-content .file-wrap");

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
	}else appendToIcons();
}

// pjax detection
function hookMutationObserver(){
	// select the target node
	var target = document.querySelector("div[data-pjax-container]");
	
	// create an observer instance
	var observer = new MutationObserver(function(mutations) {
		mutations.forEach(function(mutation) {
			var addNodes = mutation.addedNodes;
			if(addNodes && addNodes.length) initElements();
		});    
	});
	 
	// pass in the target node, as well as the observer options
	observer.observe(target, { childList: true } );
	 
	// later, you can stop observing
	// observer.disconnect();
}

// Property run_at is "document_end" as default in Content Script
// refers: https://developer.chrome.com/extensions/content_scripts
initElements();
hookMutationObserver();
