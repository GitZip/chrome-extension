// const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const isDark = true;	// for test

function changeIconInDark(tid) {
	chrome.action.setIcon({
		tabId: tid,
		path: {
			"16": "images/icon-16px-dark.png",
			"32": "images/icon-32px-dark.png",
			"48": "images/icon-48px-dark.png",
			"128": "images/icon-128px-dark.png"
		}
	});
}

// Received a message from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.action){
		case "showIcon":
			chrome.action.show(sender.tab.id, function(res){ sendResponse(res); });
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
		case "createContextSingle":
			chrome.contextMenus.create({
				id: "gitzip-single",
				title: "Download Zip"
			});
			return true;
		case "updateContextSingle":
			var updateObj = {};
			if ( request.urlType == "blob" ) {
				updateObj.title = "Download「" + request.urlName + "」";
			} else if ( request.urlType == "tree" ) {
				updateObj.title = "Download「" + request.urlName + "」as Zip";
			} else {
				updateObj.title = "Download Zip";
			}
			chrome.contextMenus.update("gitzip-single", updateObj, function(res){
				sendResponse(updateObj);
			});
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

chrome.tabs.onCreated.addListener(function(tab) {
	isDark && changeIconInDark(tab.id);
});

chrome.tabs.onActivated.addListener(function(activeInfo) {
	isDark && changeIconInDark(activeInfo.tabId);

	// handle other tabs active
    chrome.contextMenus.removeAll();

    // change back to current tab
    chrome.tabs.sendMessage(activeInfo.tabId, {action: "github-tab-active", from: "onActivated" });
});

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo){
	isDark && changeIconInDark(tabId);
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

