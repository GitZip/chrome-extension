// The DOMContentLoaded means the popup.html page has load. (trigger this event after click the ext icon)
document.addEventListener('DOMContentLoaded', function() {
	// alert("has loaded");

	var form = document.getElementById('tokenForm');
	var input = document.getElementById('tokenInput');
	var tokenlinks = form.querySelectorAll('.gettoken-link');
	var tip = form.querySelector('.tip-left');
	var referrer = "";
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

	chrome.runtime.sendMessage({action: "getCurrentPath"}, function(response){
		referrer = response;
	});

	chrome.tabs.query({currentWindow: true, active: true}, function(tabs){
		var tab = tabs[0];
		if(tab){
			function onTokenLinkClick(e){
				e.preventDefault();
				chrome.tabs.update(tab.id, {url: this.href + encodeURIComponent(referrer)});
				window.close();
			}
			tokenlinks.forEach(function(link){
				link.addEventListener('click', onTokenLinkClick);
			});
		}
	});

}, false);
