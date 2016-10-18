var request = require('request');
var fs = require('fs')
fs.readFile('config.txt', 'utf8', function (err,conf) {
	if (err) {
		return console.log(err);
	}
	var configJSON = JSON.parse(conf);
	load_procession(configJSON);
});


function load_procession(conf){
		
	request("https://"+conf.account.username+":"+conf.account.password+"@"+conf.url+"/api/organisationUnitGroups.json?fields=id,name,shortName,organisationUnits[id,name,children[id,name,level,children[id,name,level,children[id,name,level]]]]&filter=id:in:["+convertToStringOrgUnitGroup(conf.OUGroup)+"]&paging=false",function(error, response, body){
		
		console.log("Start checking OUGroup");
		
		var json = JSON.parse(body);
		
		//Find OUGroups need update, and make OUGroup json if that OUGroup need assign more OUs
		json.organisationUnitGroups.forEach(function(OUGroup){
			
			var currentOUs = OUGroup.organisationUnits;
			var levelRequired = levelForAssginOUGroup(OUGroup.id,conf.OUGroup);
			
			currentOUs.forEach(function(OU){
				currentOUs = findNewOUForAssign(OU.children,levelRequired,currentOUs,OUGroup.id,conf);
			});
			
		});
		
		console.log("End checking OUGroup");
	});
}

function findNewOUForAssign(childOUs,levelRequired,currentOUs,OUGroupID,conf){
	if(childOUs.length > 0){
		childOUs.forEach(function(OU){
			if(checkLevel(OU.level,levelRequired)&&checkExistOrg(OU,currentOUs)){
				currentOUs.push(orgJson(OU));
				PUT_OU_into_Group(OUGroupID,OU.id,conf)
			}
			if(OU.children !== undefined) findNewOUForAssign(OU.children,levelRequired,currentOUs,OUGroupID,conf);
		});
	}
	return currentOUs;
}

function PUT_OU_into_Group(OUGID,OUID,conf){
	request({
		method: "POST",
		url: "https://"+conf.account.username+":"+conf.account.password+"@"+conf.url+"/api/organisationUnitGroups/"+OUGID+"/organisationUnits/"+OUID,
		//json: metajson
	},
		function(error, response, body){
			if (error) {
				console.log(error);
			}else{
				console.log("OU Group ID: " + OUGID + " - OU: " + OUID);
				//console.log(response.statusCode, body);
				//var end_time = new date();
				//console.log(end_time);
			}
		}
	);
}

function checkLevel(orgLevel,checkLevelOU){
	var result = false;
	checkLevelOU.forEach(function(level){
		if(level == orgLevel) result = true;
	});
	return result;
}

function checkExistOrg(org,orgsFromGroup){
	var result = true;
	orgsFromGroup.forEach(function(orgFromGroup){
		if(orgFromGroup.id == org.id) result = false;
	});
	return result;
}

function convertToStringOrgUnitGroup(OUGroup){
	var result = "";
	for(i=0;i<OUGroup.length;i++){
		if(i==0) result += OUGroup[i].id;
		else result += "," + OUGroup[i].id;
	}
	return result;
}

function levelForAssginOUGroup(GroupID,Groups){
	var result = [];
	Groups.forEach(function(Group){
		if(Group.id == GroupID) result = Group.level;
	});
	return result;
}

function orgJson(org){
	var json = {
		"id": org.id,
		"name": org.name
	}
	return json;
}

