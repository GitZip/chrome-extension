// The DOMContentLoaded means the popup.html page has load. (trigger this event after click the ext icon)
document.addEventListener('DOMContentLoaded', function() {
	// alert("has loaded");

	var form = document.getElementById('tokenForm');
	var input = document.getElementById('tokenInput');
	var tokenlink = form.querySelector('.gettoken-link');
	var tip = form.querySelector('.tip-left');
	form.addEventListener('submit', function(){
		chrome.runtime.sendMessage({action: "setKey", value: input.value}, function(response){});
		window.close();
	});

	input.addEventListener('input', function(){
		if(tip) tip.style.cssText += "display:block;";
	});

	chrome.runtime.sendMessage({action: "getKey"}, function(response){
		input.value = response;
	});

	chrome.tabs.query({currentWindow: true, active: true}, function(tabs){
		var tab = tabs[0];
		if(tab && tab.url){
			tokenlink.href += encodeURIComponent(tabs[0].url);
			tokenlink.addEventListener('click', function(e){
				e.preventDefault();
				chrome.tabs.update(tab.id, {url: tokenlink.href});
				window.close();
			});
		}
	});

}, false);
