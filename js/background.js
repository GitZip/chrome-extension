
// Received a message from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.action){
		case "showIcon":
			chrome.action.enable(sender.tab.id, function(res){ sendResponse(res); });
			return true;
		case "getKey":
			chrome.storage.sync.get("gitzip-github-token", function(res){
				sendResponse(res["gitzip-github-token"] || "");
			});
			return true;
		case "setKey":
			chrome.storage.sync.set( {"gitzip-github-token": request.value}, function(res){
				sendResponse(res);
			});
			return true;
		case "getCurrentPath":
			chrome.tabs.query({currentWindow: true, active: true}, function(tabs){
				var tab = tabs[0];
				if(tab) chrome.tabs.sendMessage(tab.id, {action: "getCurrentPath" }, function(res){
					sendResponse(res);
				});
			});
			return true;
		case "createContextNested":
			var main = chrome.contextMenus.create({
				id: "gitzip-nested",
				title: "GitZip Download",
				contexts: ["all"]
			});
			chrome.contextMenus.create({
				id: "gitzip-nested-items",
				parentId: main,
				title: "Checked Items",
				contexts: ["all"],
				enabled: false
			});
			chrome.contextMenus.create({
				id: "gitzip-nested-seperator",
				parentId: main,
				title: "seperator",
				type: "separator",
				contexts: ["all"]
			});
			chrome.contextMenus.create({
				id: "gitzip-nested-selected",
				parentId: main,
				title: "(selected)",
				contexts: ["all"],
				enabled: false
			});
			chrome.contextMenus.create({
				id: "gitzip-nested-current",
				parentId: main,
				title: "(current)",
				contexts: ["all"],
				enabled: false
			});
			return true;
		case "updateContextNested":
			var id = request.target;
			var updateObj = { enabled: request.enabled !== false };
			switch (id) {
				case "selected":
					updateObj.title = updateObj.enabled ? ("Selected " + (request.urlType == "blob" ? "File - " : "Folder - ") + request.urlName) : "(selected)";
					break;
				case "current":
					if (request.root === true) 
						updateObj.title = "Whole Repository";
					else 
						updateObj.title = updateObj.enabled ? ("Current " + (request.urlType == "blob" ? "File - " : "Folder - ") + request.urlName) : "(current)";
					break;
			}
			chrome.contextMenus.update("gitzip-nested-" + id, updateObj);
			return true;
		case "removeContext": 
			chrome.contextMenus.removeAll(function(res){ sendResponse(res); });
			return true;
	}
});

chrome.contextMenus.onClicked.addListener(function(info, tab){
	if ( info.menuItemId.toString().indexOf("gitzip-") != -1 ) {
		chrome.tabs.sendMessage(tab.id, {action: info.menuItemId + "-clicked"});
	}
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
	// disable first
	chrome.action.disable(activeInfo.tabId);

	// handle other tabs active
    chrome.contextMenus.removeAll();

    // change back to current tab
    chrome.tabs.sendMessage(activeInfo.tabId, {action: "github-tab-active", from: "onActivated" });
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo){
	if ( changeInfo.status == "loading" ) {
		chrome.contextMenus.removeAll();
	} else if ( changeInfo.status == "complete" ) {
		// coding like this because it would cause error during current page loading and then shift another tab quickly.
		chrome.tabs.query({currentWindow: true, active: true}, function(tabs){
			var tab = tabs[0];
			if(tab) chrome.tabs.sendMessage(tab.id, {action: "github-tab-active", from: "onUpdated" });
		});
	}
});

