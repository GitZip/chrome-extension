
function save(){
	if(document.readyState === "complete"){
		var tokencache = document.querySelector('p.token-cache');
		if(tokencache && tokencache.textContent){
			chrome.runtime.sendMessage({action: "setKey", value: tokencache.textContent}, function(response){});
		}
	}
}

if(document.readyState === "complete") save();
else document.addEventListener("readystatechange", function(){ save(); });

