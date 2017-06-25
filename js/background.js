// Received a message from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.action){
		case "showIcon":
			chrome.pageAction.show(sender.tab.id);
			break;
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
	}
});
