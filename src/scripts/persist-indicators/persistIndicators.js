var request = require('request');
var fs = require('fs')
fs.readFile('config.json', 'utf8', function (err,conf) {
	if (err) {
		return console.log(err);
	}
	var configJSON = JSON.parse(conf);
	load_procession(configJSON);
});


function init(conf){
    console.log(config);
}