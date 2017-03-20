var request = require('request');
const basicAuth = require("basic-authorization-header");

var fs = require('fs')
fs.readFile('config.json', 'utf8', function(err, conf) {
    if (err) {
        return console.log(err);
    }
    var organisationUnitActivator = new OrganisationUnitActivator(JSON.parse(conf));
    organisationUnitActivator.run();
});


/**
 * Class in charge of loading autoindicators turning them into datavalues.
 */
function OrganisationUnitActivator(conf) {
    //used endpoints
    this.endpoints = {
        DATAELEMENTGROUP: "/dataElementGroups/UID?fields=dataElements[id,attributeValues]", 
        ORGANISATION_UNITS_BY_UID: "/organisationUnits/UID?fields=level",
        ORGANISATION_UNITS_BY_ORGANISATION_UNIT_GROUP: "/organisationUnitGroups/UID?fields=organisationUnits[id,closedDate,openingDate]",
        ORGANISATION_UNITS_BY_PARENT_AND_LEVEL: "/organisationUnits/UID?level=LEVELVALUE&fields=id,closedDate,openingDate",
        DATAVALUE_SETS: "/dataValueSets",
        DATAVALUES_RESULT: "/dataValueSets?orgUnit=ORGUNIT&dataElementGroup=DATAELEMENTGROUP&startDate=1900-01-01&endDate=3017-07-01"  
    }; 
    //rest config
    this.conf = conf

    this.attributeUids = {
        LEVEL: conf.attributes.level,
        PARENT: conf.attributes.parent,
        ORGUNITGROUP: conf.attributes.orgUnitGroup,
        PERIOD: conf.attributes.period
    }; 
    this.dataElementGroups = this.conf.dataElementGroups;
    //common auth, endpoint config 
    this.requestOptions = {
        headers: {
            "authorization": basicAuth(this.conf.api.auth.username, this.conf.api.auth.password),
            "accept": "application/json",
            "content-type": "application/json",
        },
        url: this.conf.api.protocol + "://" + this.conf.api.url
    }
    console.log("\nConfig:\n", JSON.stringify(this.conf, null, "\t"));
};  

/**
 * Returns an object with url and auth info for the given endpoint
 * @param endpoint The endpoint with the params included
 */
OrganisationUnitActivator.prototype.prepareOptions = function (endpoint) {
    var options = Object.assign({}, this.requestOptions);
    options.url += endpoint;
    return options;
}

/**
 * Run script
 */
OrganisationUnitActivator.prototype.run = function () {
    console.log("\nLoading script...");
    var _this = this;

    //Process every dataElement group
    _this.dataElementGroups.forEach(function (dataElementGroup) {
        console.log("\nFound dataElementGroup..." + dataElementGroup);
        _this.loadDataElementGroup(dataElementGroup);
    });
}; //Added data Element Group to be shown in log messages.

/**
 * Prepares the data Elements and loads the organisationUnits for each dataelement in a given data element group
 */
OrganisationUnitActivator.prototype.loadDataElementGroup = function (dataElementGroup) {
    //Ask for 'DataElements'
    var _this = this;
    var endpoint = this.endpoints.DATAELEMENTGROUP.replace("UID", dataElementGroup);
    var url = this.prepareOptions(endpoint);
    console.log(url);
    request(url, function (error, response, body) {
        console.log("Found " + body);
        if (body == undefined)
        {
            console.log("Unexpected error"+ error);
        }
        else{
            _this.dataElements = JSON.parse(body).dataElements;
            console.log("Found " +
                _this.dataElements.length +
                " dataElements \n\t" +
                _this.dataElements.map(function (dataElement) { return dataElement.id }).join("\n\t")
            );

            //Process every dataElements
            _this.dataElements.forEach(function (dataElement) {
                console.log("\nConfig:\n", JSON.stringify(dataElement, null, "\t"));
                //Added data Element Group to be shown in log messages.
                dataElement.dataElementGroup = dataElementGroup; 
                _this.prepareDataElement(dataElement);
                _this.loadOrganisationUnitsByDataElement(dataElement);
            });
        }
    });
};

/**
 * Builds the dataElement attributes
 */
OrganisationUnitActivator.prototype.prepareDataElement = function (dataElement) {
    
    var _this = this;
    console.log("\nPreparing dataElement:" + dataElement.id);
    dataElement.attributeValues.forEach(function (attributeValue) {
        if (attributeValue.attribute.id == _this.attributeUids.LEVEL) {
            dataElement.level = attributeValue.value;
        }
        if (attributeValue.attribute.id == _this.attributeUids.PARENT) {
            dataElement.parent = attributeValue.value;
        }
        if (attributeValue.attribute.id == _this.attributeUids.ORGUNITGROUP) {
            dataElement.orgUnitGroup = attributeValue.value;
        }
        if (attributeValue.attribute.id == _this.attributeUids.PERIOD) {
            dataElement.periods = attributeValue.value;
        }  
    });
};


/**
 * Loads the organisationUnit for each dataelement.
 */
OrganisationUnitActivator.prototype.loadOrganisationUnitsByDataElement = function (dataElement) {
    //Ask for 'DataElements'
    var _this = this;
    if (dataElement.parent == undefined && dataElement.level == undefined) {
        if (dataElement.orgUnitGroup != undefined) {
            console.log("\nLoading orgUntis from orgUnitGroup " + dataElement.orgUnitGroup);
            _this.loadOrgUnitsByOrgUnitGroup(dataElement);  
        }
        else{
            console.log("\The dataelement  hasn't  organisationUnit " + dataElement.dataElementGroups);
        }
    } else {
        console.log("\nLoading orgUntis from parent: " + dataElement.parent + " level: " + dataElement.level);
        _this.loadOrgUnitsFromParentLevel(dataElement);

    } 
};

/**
 * Loads the organisationUnit using the OrgUnitGroup attribute, and prepare the DataSet.
 */
OrganisationUnitActivator.prototype.loadOrgUnitsByOrgUnitGroup = function (dataElement) {
    //Ask for 'Organisation Units'
    var _this = this;
    var endpoint = this.endpoints.ORGANISATION_UNITS_BY_ORGANISATION_UNIT_GROUP.replace("UID", dataElement.orgUnitGroup);
    var url = this.prepareOptions(endpoint);
    console.log(url);
    request(url, function (error, response, body) {
        console.log("Found " + body);
        _this.organisationUnits = JSON.parse(body).organisationUnits;
        if (_this.organisationUnits == undefined) {
            console.log("Error: OrganisationUnits not Found dataelement: "+ dataelement.id);
            return;
        }
        console.log("Found " +
            _this.organisationUnits.length +
            " dataElements \n\t" +
            _this.organisationUnits.map(function (organisationUnit) { return organisationUnit.id }).join("\n\t")
        );   
        _this.organisationUnits.forEach(function (organisationUnit) {
            _this.prepareDataSet(organisationUnit, dataElement);
        }); 
    });
};


/**
 * Loads the organisationUnit by level, and prepares the DataSet.
 */
OrganisationUnitActivator.prototype.loadOrgUnitsByLevel = function (dataElement) { 
    //Ask for 'Organisation Units'
    var _this = this;
    var endpoint = this.endpoints.ORGANISATION_UNITS_BY_PARENT_AND_LEVEL.replace("UID", dataElement.parent);
    endpoint = endpoint.replace("LEVELVALUE", dataElement.level - dataElement.parentLevel);
    var url = this.prepareOptions(endpoint);
    console.log(url);
    request(url, function (error, response, body) {
        console.log("Found " + body);
        _this.organisationUnits = JSON.parse(body).organisationUnits;
        console.log("Found " +
            _this.organisationUnits.length +
            " dataElements \n\t" +
            _this.organisationUnits.map(function (organisationUnit) { return organisationUnit.id }).join("\n\t")
        );

        _this.organisationUnits.forEach(function (organisationUnit) {
            _this.prepareDataSet(organisationUnit, dataElement); 
        }); 
    });
};


/**
 * Loads the organisationUnit parent using the parent attribute, and loads the organisationUnit by level.
 */
OrganisationUnitActivator.prototype.loadOrgUnitsFromParentLevel = function (dataElement) {
    //Ask for 'Organisation Units'
    var _this = this;
    var endpoint = this.endpoints.ORGANISATION_UNITS_BY_UID.replace("UID", dataElement.parent);
    var url = this.prepareOptions(endpoint);
    console.log(url);
    request(url, function (error, response, body) {
        console.log("Found " + body);
        _this.level = JSON.parse(body).level;
        console.log("Found Parent with level: " +
            _this.level
        );
        dataElement.parentLevel = _this.level;
        _this.loadOrgUnitsByLevel(dataElement);
    });
};


/**
 * Prepares and pushes the dataSet.
 */
OrganisationUnitActivator.prototype.prepareDataSet = function (orgUnit, dataElement) { 
    var _this = this;
    _this.dataValues;
    console.log("prepareOrgUnit " + orgUnit.id);
    console.log("dataElement periods " + dataElement.periods);

    //Parse dhis dates.
    if (orgUnit.closedDate != undefined) {
        orgUnit.closedDate = _this.parseDateFromDhis(orgUnit.closedDate);
    }
    if (orgUnit.openingDate != undefined) {
        orgUnit.openingDate = _this.parseDateFromDhis(orgUnit.openingDate);
    }

    var today = new Date(); 
    today.setMonth(((today.getMonth() +1) - parseInt(dataElement.periods)));  
    var rows = [];
    for (var i = parseInt(dataElement.periods); i > 0; i--) {
        var row;
        var fixDate = i;// +1 skipe the current period
        var date = new Date();
        date.setMonth(((date.getMonth()) - fixDate ));//
        var month = ("0" + (date.getMonth() + 1)).slice(-2);//fix javascript month format (1 to 12 insteand of 0-11 and mm insteand of m format)
        var dateAsString = date.getFullYear() + "" + month;
        if (orgUnit.closedDate != undefined && orgUnit.closedDate.getTime() < date.getTime()) {
            if (orgUnit.openingDate.getTime() > orgUnit.closedDate.getTime() && date.getTime() >= orgUnit.openingDate.getTime()) {
                //if the closed date is previous than the period date, but the  closed Date is previous than the opening date and  the opening date is previous than the period date, it is active
                row = { "dataElement": dataElement.id, "period": dateAsString, "orgUnit": orgUnit.id, "value": 1 };
            }else
            if (orgUnit.closedDate.getTime() < date.getTime()) {
                //if the closed date is previous than the period date and the openningDate is previous than the closedDate, it is inactive
                row = { "dataElement": dataElement.id, "period": dateAsString, "orgUnit": orgUnit.id, "value": 0 };
                console.log(_this.getFormattedDate(date));
                console.log(_this.getFormattedDate(orgUnit.closedDate));
                var closedDateMonth = ("0" + (orgUnit.closedDate.getMonth() + 1)).slice(-2); 
                if (parseInt(dateAsString) == (orgUnit.closedDate.getFullYear() + closedDateMonth)) {
                //if the closed date is in the same year and month than the date, it is active
                    row = { "dataElement": dataElement.id, "period": dateAsString, "orgUnit": orgUnit.id, "value": 1 };
                }
            }
        } else {
            //undefined closed date or the period is previous or equal than the closed Date
            row = { "dataElement": dataElement.id, "period": dateAsString, "orgUnit": orgUnit.id, "value": 1 };
        }
        console.log("dataElement uid:" + dataElement.id + " period " + dateAsString + " - " + i + " OrgUnit uid: " + orgUnit.id + " value " + row.value);

        rows.push(row);
    }
    _this.postDataValues(_this.buildDataValues(rows), dataElement.dataElementGroup);
}


/**
 * Format a date to human readable format
 */
OrganisationUnitActivator.prototype.getFormattedDate = function (date) { 

    var month = date.getMonth() + 1;
    var day = date.getDate();
    var hour = date.getHours();
    var min = date.getMinutes();
    var sec = date.getSeconds();

    month = (month < 10 ? "0" : "") + month;
    day = (day < 10 ? "0" : "") + day;
    hour = (hour < 10 ? "0" : "") + hour;
    min = (min < 10 ? "0" : "") + min;
    sec = (sec < 10 ? "0" : "") + sec;

    var str = date.getFullYear() + "-" + month + "-" + day + "_" + hour + ":" + min + ":" + sec; 

    return str;
}

/**
 * Build the dataValues
 */
OrganisationUnitActivator.prototype.buildDataValues = function (rows) {
    var _this = this;
    var dataValues = rows.map(value => {
        return {
            "dataElement": value.dataElement,
            "orgUnit": value.orgUnit,
            "period": value.period,
            "value": value.value
        }
    });

    return { "dataValues": dataValues };
}

/**
 * Post datavalues to server
 * @param dataValues The dataValues that will be posted
 */
OrganisationUnitActivator.prototype.postDataValues = function (dataValues, dataElementGroup) { 
    console.log("Push dataValues: " + dataValues.dataValues.length + "orgUnit: " + dataValues.dataValues[0].orgUnit + "dataElement: " + dataValues.dataValues[0].dataElement ); 
    var _this = this;
    var postInfo = this.prepareOptions(this.endpoints.DATAVALUE_SETS);
    postInfo.json = true;
    postInfo.body = dataValues;
    request.post(postInfo, function (error, response, body) {
        if (error) {
            console.error("Error posting values: ", error);
            return;
        }
        console.log("Values posted OK, summary", JSON.stringify(body, null, "\t"));
        console.log("Check in url: ", _this.requestOptions.url + _this.endpoints.DATAVALUES_RESULT.replace("ORGUNIT", dataValues.dataValues[0].orgUnit).replace("DATAELEMENTGROUP", dataElementGroup));  
    });
}


/**
 * Parse the server date vale to javascript date value.
 */
OrganisationUnitActivator.prototype.parseDateFromDhis = function (dateAsString) {
    var parseDate = new Date();
    parseDate.setFullYear(dateAsString.substring(0, 4));// Example: 1900-01-01T00:00:00.000
    parseDate.setMonth(dateAsString.substring(5, 7) - 1);
    parseDate.setDate(dateAsString.substring(8, 10));
    parseDate.setHours(dateAsString.substring(11, 13));
    parseDate.setMinutes(dateAsString.substring(14, 16));
    parseDate.setSeconds(dateAsString.substring(18, 20));
    var n = parseDate.toString();
    console.log("Parsed date " + n + "from " + dateAsString);
    return parseDate;
}