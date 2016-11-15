var request = require('request');
var periods = require('./periods.js');

var fs = require('fs')
fs.readFile('config.json', 'utf8', function(err, conf) {
    if (err) {
        return console.log(err);
    }
    var autoindicatorsLoader = new OutletRegistrator(JSON.parse(conf));
    autoindicatorsLoader.loadLastEvents();
});


/**
 * Class in charge of loading autoindicators turning them into datavalues.
 */
function OutletRegistrator(conf) {
	
	//get api version
	var apiversion="";
	
	if (typeof(conf.apiversion)!="undefined" && conf.apiversion!="") apiversion="/"+conf.apiversion;
	
    //used endpoints
    this.endpoints = {
        
        EVENTS: apiversion+"/events.json?orgUnit=[ROOT]&ouMode=DESCENDANTS&program=[PROGRAM]&startDate=",
        ORGUNITS: apiversion+"/organisationUnits/[PARENT].json?includeChildren=true",
        DATAVALUESETS: apiversion+"/dataValueSets" 
    };

    //rest config
    this.conf = conf;

    //common auth, endpoint config
    this.requestOptions = {
        headers: {
            authorization: 'Basic ' + this.conf.auth,
        },
        url: this.conf.protocol + "://" + this.conf.url
    }
    console.log("\nConfig:\n", JSON.stringify(this.conf, null, "\t"));
};

/**
 * Returns an object with url and auth info for the given endpoint
 * @param endpoint The endpoint with the params included
 */
OutletRegistrator.prototype.prepareOptions = function(endpoint) {
    var options = Object.assign({}, this.requestOptions);
    options.url += endpoint;
    return options;
}

/**
 * Loads every event from the last 30 days ()
 */
OutletRegistrator.prototype.loadLastEvents = function() {
    console.log("\nLoading events...");
    var _this = this;
    //Ask for 'Events'
    var requestData = this.prepareOptions(this.endpoints.EVENTS);
    requestData = this.prepareEventsRequest(requestData);
    request(requestData, function(error, response, body) {
        _this.events = JSON.parse(body).events;
        console.log("Found " + _this.events.length + " events");

         //TODO This process should be done via 'events' simulating a lock
        //Process every indicator
        _this.events.forEach(function(event) {
            _this.processOrgUnit(event);
        });
    });
};

/**
 * Replaces params in events url
 * @param requestData
 */
OutletRegistrator.prototype.prepareEventsRequest = function(requestData) {    
    requestData.url =  requestData.url.replace("[ROOT]",this.conf.rootOrgUnit);
    requestData.url =  requestData.url.replace("[PROGRAM]",this.conf.program);    
    requestData.url =  requestData.url + periods.moveAndFormatDay(this.conf.fromDate);
    return requestData;
}

/**
 * Creates an orgunit for the given event if 'alreadyCreated' false
 * @param event The event that will be converted into an orgunit
 */
OutletRegistrator.prototype.processOrgUnit = function(event) {    
    //Skip already imported
    if (this.isAlreadyImported(event)){
        console.warn("Skipping event "+event.event+", already imported");
        return;
    }
    this.buildOrgUnit(event);
};

/**
 * Creates an orgunit for the given event
 * @param event The event that will be converted into an orgunit
 */
OutletRegistrator.prototype.buildOrgUnit = function(event) {    
    
    var _this = this;
    //Find last orgunit to build autoinc
    var requestData = this.prepareOptions(this.endpoints.ORGUNITS);
    requestData.url = requestData.url.replace("[PARENT]",event.orgUnit);
    request(requestData, function(error, response, body) {
        console.log("Building event " +event.event+" ...");
        //error -> done
        if(error){
            console.error("\t",event.orgUnit," => cannot resolve children");
            return;
        }
        
        var organisationUnits = JSON.parse(body).organisationUnits;
        //resolve parent code
        event.parentCode = _this.findParentCode (event,organisationUnits);
        if(!event.parentCode){
            console.error("\t",event.orgUnit," => cannot resolve 'parentCode'");
            return;    
        }
        
        //resolve autoinc
        event.autoIncrement = _this.findLastAutoIncrement(event,organisationUnits) +1;
        
        if(!event.autoIncrement){
            console.error("\t",event.orgUnit," => cannot resolve 'autoIncrement'");
            return;                
        }
               
        //Post orgunit 
        _this.postOrgUnit(event);
    });    
};

/**
 * Returns the orgUnit.code from the given event.orgUnit
 * @param event The event 
 */
OutletRegistrator.prototype.findParentCode = function(event,organisationUnits) {    
    var organisationUnit = organisationUnits.find(organisationUnit =>{
       return organisationUnit.id === event.orgUnit 
    });
    
    return organisationUnit?organisationUnit.code.split("_")[1]:null;
};

/**
 * Returns the orgUnit.organisationUnits.'maxcode' from the given event.orgUnit
 * @param event The event 
 */
OutletRegistrator.prototype.findLastAutoIncrement = function(event,organisationUnits) { 
    //filter only those following the right sequence 'MM_AMTR[PARENTCODE]-'
    var onlyAMTROrgUnits = organisationUnits.filter(organisationUnit => organisationUnit.code.indexOf("MM_AMTR"+event.parentCode+"-")!==-1);
    if (onlyAMTROrgUnits.length>0) {
    	var maxCounter = onlyAMTROrgUnits.reduce((max, organisationUnit) => {
    		var currentValue = parseInt(organisationUnit.code.split("-")[1]);
    		if(isNaN(currentValue)){
    			return max;
    		}
    		//First time any value is a good one
    		if(isNaN(max)){
    			return currentValue;
    		}
    		//Return max
    		return currentValue > max?currentValue:max;
    	});    
	}
    
    if(!maxCounter || isNaN(maxCounter)){
        return 0;
    }
    return maxCounter;
};

/**
 * Post the new OrgUnit and PATCHES the event (alreadyImported:true)
 * @param event The event that will be converted into an orgunit
 */
OutletRegistrator.prototype.postOrgUnit = function(event) {    
    console.log("\t parentCode: ",event.parentCode," autoIncrement: "+event.autoIncrement);
    //Prepare orgUnit
    var newOrgUnit = this.createOrgUnitFromEvent(event);
    //Post orgunit  
    console.log("La org. unit es")
    console.log(newOrgUnit);
    this.postAndPatch(newOrgUnit, event);        
};

/**
 * Returns the value of a given dataElement in one event
 */

OutletRegistrator.prototype.getValue = function(event, uidField) {
	var foundField = event.dataValues.find(field => {
		return field.dataElement === uidField;
	});
	
	if (!foundField) {
		return "";
	}
	
	return foundField.value;
}; 

/**
 * Returns an orgUnit with every required field
 * @param event The event with the data
 */
OutletRegistrator.prototype.createOrgUnitFromEvent = function(event) {

	
	//get outlet name
	var outletName = this.getValue(event, this.conf.dataElements.name);	
	//get outlet contact person
	var outletContactPerson = this.getValue(event, this.conf.dataElements.contactPerson);	
	//get outlet address
	var outletAddress = this.getValue(event, this.conf.dataElements.address);
	//get outlet phone number
	var outletPhoneNumber = this.getValue(event, this.conf.dataElements.phoneNumber);
	
	
    return {
        code:"",
        name:outletName,
        shortName:outletName,
        featureType:"POINT",
        parent:{
            id:event.orgUnit
        },
        address:outletAddress,
        phoneNumber:outletPhoneNumber,
        contactPerson:outletContactPerson,
        coordinates:event.coordinate   
    }    
};

/**
 * Returns the has been already imported or not
 * @param event The event
 */
OutletRegistrator.prototype.postAndPatch = function(newOrgUnit, event) {       
    //TODO Post orgunit
        //Patch alreadyCreated   
};

/**
 * Returns the has been already imported or not
 * @param event The event
 */
OutletRegistrator.prototype.isAlreadyImported = function(event) {    
    var imported = this.findDataValue(event,this.conf.dataElements.alreadyImported);
    
    //Not found -> Not imported
    if(imported === null){
        return false;
    }
    
    //To avoid parsing issues
    return JSON.parse(imported);
};

/**
 * Returns the value for the given dataElement and event
 * @param event The event 
 * @param dataElement The dataElement 
 */
OutletRegistrator.prototype.findDataValue = function(event,dataElement) {    
    if (!event || !event.dataValues || !dataElement){
        return null;
    }
    
    var dataValueFound = event.dataValues.find (dataValue =>{
       return dataValue.dataElement === dataElement 
    });
    
    return dataValueFound?dataValueFound.value:null;
};

// /**
//  * Post datavalues to server
//  * @param dataValues The dataValues that will be posted
//  */
// OutletRegistrator.prototype.postDataValues = function(dataValues) {
    
//     var _this = this;
//     var postInfo = this.prepareOptions(this.endpoints.DATAVALUESETS);        
//     postInfo.json=true; 
//     postInfo.body =  dataValues;       
//     request.post(postInfo, function(error, response, body) {
//         if(error){
//             console.error("Error posting values: ",error);
//             return;
//         }
//         console.log("Values posted OK, summary",JSON.stringify(body.importCount,null,"\t"));
//     });
// }



