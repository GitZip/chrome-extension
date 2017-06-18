// The DOMContentLoaded means the popup.html page has load. (trigger this event after click the ext icon)
document.addEventListener('DOMContentLoaded', function() {
	// alert("has loaded");

	var form = document.getElementById('tokenForm');
	var input = document.getElementById('tokenInput');
	var tip = form.querySelector('.tip-left');
	form.addEventListener('submit', function(){
		chrome.runtime.sendMessage({action: "setKey", value: input.value}, function(response){
			alert(response);
		});
		window.close();
	});

	input.addEventListener('input', function(){
		if(tip) tip.style.cssText += "display:block;";
	});

	chrome.runtime.sendMessage({action: "getKey"}, function(response){
		input.value = response;
	});

	// chrome.storage.sync.get("gitzip-github-apikey", function(res){
	// 	input.value = res["gitzip-github-apikey"] || "";
	// });

}, false);
