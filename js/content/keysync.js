
window.ACCESS_TOKEN_COOKIE_NAME = '_gitzip_token';

function _getCookie(name) {
	var value = "; " + document.cookie;
	var parts = value.split("; " + name + "=");
	if (parts.length == 2) return parts.pop().split(";").shift();
	return null;
}

chrome.runtime.sendMessage({action: "getKey"}, function(response){ 
	if(typeof response == 'string' && !response){
		// means not exist in extension
		var val = _getCookie(window.ACCESS_TOKEN_COOKIE_NAME);
		if(val){
			// exist
			chrome.runtime.sendMessage({action: "setKey", value: val}, function(response){
				window.alert(response || "Token has sync to GitZip Extension");
			});
		}else{
			// not exist in kinolien.github.io/gitzip/
		}
	}
});	
