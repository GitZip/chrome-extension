// Received a message from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.action){
		case "showIcon":
			chrome.pageAction.show(sender.tab.id);
			break;
		case "getKey":
			chrome.storage.sync.get("gitzip-github-apikey", function(res){
				sendResponse(res["gitzip-github-apikey"] || "");
			});
			return true;
		case "setKey":
			chrome.storage.sync.set( {"gitzip-github-apikey": request.value}, function(res){
				sendResponse(res);
			});
			return true;
	}
});
