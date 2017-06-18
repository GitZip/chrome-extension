// It would work on github.com

// alert("In github page");

// if(saveAs){
// 	alert("defined");
// }else{
// 	alert("undefined");	
// }

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
	        if (xmlhttp.readyState == 4 && xmlhttp.status == 200){
	        	if(xmlhttp.status == 200){
	        		resolve(xmlhttp.response);
	        	}else if(xmlhttp.status > 400){
	        		reject(xmlhttp);
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
		var wrap = document.body.querySelector(".gitzip-collect-wrap"),
			dash = wrap? wrap.querySelector(".gitzip-collect-dash") : null,
			down = wrap? wrap.querySelector(".gitzip-collect-down") : null,
			tip = wrap? wrap.querySelector(".gitzip-collect-tip") : null;

		if(!wrap || !down){
			wrap = document.createElement('div');
			dash = document.createElement('div');
			down = document.createElement('p');	
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
		}

		// hook events
		down.addEventListener('click', function(){ self.download(); });
		tip.addEventListener('click', function(){ self.download(); });

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
	// add: function(){
	// 	if(this._locked) return;
	// 	if(!this._created) this.init();
	// 	// do add
	// },
	// remove: function(){
	// 	if(this._locked) return;
	// 	// do remove
	// },
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
			
			// self.log(getGitUrl(type, sha));
		}


		// start progress
		new Promise(function(res, rej){
			chrome.runtime.sendMessage({action: "getKey"}, function(response){ res(response); });	
		}).then(function(key){
			currentKey = key;
			return new Promise(function(rs, rj){
				var promises = treeAjaxItems.map(function(item){
					return callAjax(item.url + "?recursive=1&access_token=" + currentKey).then(function(treeRes){
	     				treeRes.tree.forEach(function(blobItem){
	     					if(blobItem.type == "blob"){
	     						var path = item.title + "/" + blobItem.path;
	     						blobAjaxCollection.push({ path: path, blobUrl: blobItem.url });
	     						self.log(path + " url fetched.");
	     					}
	     				});
					});
				});
				Promise.all(promises).then(function(){ rs(); });
			});
		}).then(function(){
			self.log("Collect blob contents...");
		 	return new Promise(function(rs, rj){
		 		var promises = blobAjaxCollection.map(function(item){
		 			return callAjax(item.blobUrl + "?access_token=" + currentKey).then(function(blobRes){
		 				fileContents.push({ path: item.path, content: blobRes.content });
		 				self.log(item.path + " content has collected.");
		 			});
		 		});
		 		Promise.all(promises).then(function(){ rs(); });
		 	});
		}).then(function(){
			self.log("Zip contents and trigger download...");
			// console.log(fileContents);
			return zipContents([resolvedUrl.project].concat(resolvedUrl.path.split('/')).join('-'), fileContents);
		}).catch(function(err){
			console.log(err);
			self.log(err);
			return;
		}).then(function(){
			self.reset();
		});
		
		// callAjax();

		// the end
		
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
	}
}

function createCollection(){
	var wrap = document.body.querySelector(".gitzip-collect-wrap"),
		down = wrap? wrap.querySelector(".gitzip-collect-down") : null;

	if(!wrap || !down){
		wrap = document.createElement('div');
		down = document.createElement('p');	
		
		wrap.className = "gitzip-collect-wrap";
		down.className = "gitzip-collect-down";

		wrap.append(down);
		document.body.append(wrap);
	}

	// hook events

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
	var items = document.querySelectorAll(itemCollectSelector);

	var fileWrap = document.querySelector(".repository-content .file-wrap");

	var itemLen = items.length;
	
	if(itemLen && fileWrap){
		for(var i = 0; i < itemLen; i++){
			var item = items[i];
			
			var icon = item.querySelector("td.icon");
			var link = item.querySelector("td.content a");
			var blob = icon.querySelector(".octicon-file-text");
			var tree = icon.querySelector(".octicon-file-directory");
			
			if(link && (tree || blob)){
				createMark(icon, item.offsetHeight, link.textContent, tree? "tree" : "blob", link.id.split('-')[1]);
				item.addEventListener("dblclick", onItemDblClick);
			}
		}
		Pool.init();
	}	
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

document.addEventListener("readystatechange", function(){
	if(document.readyState === "complete") {
		initElements();
		hookMutationObserver();
	}

	// alert(currentKey);
	// localStorage.setItem("gitziptest", "test");
});
