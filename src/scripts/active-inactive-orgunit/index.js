var request = require('request');
var dateFormatter = require('./dateFormatter.js');
const basicAuth = require("basic-authorization-header");

var fs = require('fs')
fs.readFile('config.json', 'utf8', function (err, conf) {
    if (err) {
        return console.error("Invalid config.json ", err);
    }
    var organisationUnitActivator = new OrganisationUnitActivator(JSON.parse(conf));
    organisationUnitActivator.run();
});


/**
 * This class activate the inactive organisation Units for a given dataElementGroup.
 */
function OrganisationUnitActivator(conf) {
    this.endpoints = {
        DATAELEMENTGROUP: "/dataElementGroups/UID?fields=dataElements[id,attributeValues]",
        ORGANISATION_UNITS_BY_UID: "/organisationUnits/UID?fields=level",
        ORGANISATION_UNITS_BY_ORGANISATION_UNIT_GROUP: "/organisationUnitGroups/UID?fields=organisationUnits[id,closedDate,openingDate]",
        ORGANISATION_UNITS_BY_PARENT_AND_LEVEL: "/organisationUnits/UID?level=LEVELVALUE&fields=id,closedDate,openingDate",
        DATAVALUE_SETS: "/dataValueSets",
        DATAVALUES_RESULT: "/dataValueSets?orgUnit=ORGUNIT&dataElementGroup=DATAELEMENTGROUP&startDate=1900-01-01&endDate=3017-07-01"
    };

    this.attributeUids = {
        LEVEL: conf.attributes.level,
        PARENT: conf.attributes.parent,
        ORGUNITGROUP: conf.attributes.orgUnitGroup,
        PERIOD: conf.attributes.period
    };

    this.dataElementGroup = conf.dataElementGroup;

    //common auth
    this.requestOptions = {
        headers: {
            "authorization": basicAuth(conf.api.auth.username, conf.api.auth.password),
            "accept": "application/json",
            "content-type": "application/json",
        },
        url: conf.api.protocol + "://" + conf.api.url
    }

    //this variable is used to control if there are pending asynchronous calls to the server
    this.asyncCalls = 0;

    console.log("\nConfig:\n", JSON.stringify(conf, null, "\t"));
};

/**
 * Run script
 */
OrganisationUnitActivator.prototype.run = function () {
    console.log("\nLoading script..."); 
    //Process the dataElement group 
    var dataValues = [];  
    this.processDataElementGroup(this.dataElementGroup, dataValues); 
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
 * Prepares the data Elements and loads the organisationUnits for each dataelement in a given data element group
@param dataElement The active dataElement
 */
OrganisationUnitActivator.prototype.processDataElementGroup = function (dataElementGroup, dataValues) {
    console.log("\nLoading dataElements...");
    var _this = this;
    var endpoint = this.endpoints.DATAELEMENTGROUP.replace("UID", dataElementGroup);
    var url = this.prepareOptions(endpoint);
    console.info("Request the dataelements from a dataelementgroup ", "URL: " + url.url);
    this.asyncCalls++
    request(url, function (error, response, body) {
        if (error != undefined) {
            console.error("Server not found " + error);
            _this.asyncCalls--;
            return;
        }
        var dataElements = JSON.parse(body).dataElements;
        console.info("Found " +
            dataElements.length +
            " dataElements \n\t" +
            dataElements.map(function (dataElement) { return dataElement.id }).join("\n\t")
        );

        //Process every dataElements
        dataElements.forEach(function (dataElement) { 
            console.info("\nConfig:\n", JSON.stringify(dataElement, null, "\t"));
            var isDataElementValid = _this.prepareDataElement(dataElement);
            if (isDataElementValid) {
                _this.processDataElements(dataElement, dataValues);
            }
        });
        _this.asyncCalls--;
    });
};

/**
 * Builds the dataElement attributes
@param dataElement The active dataElement
 */
OrganisationUnitActivator.prototype.prepareDataElement = function (dataElement) {

    var attributeUids = this.attributeUids;
    console.log("\nPreparing dataElement:" + dataElement.id);
    dataElement.attributeValues.forEach(function (attributeValue) {
        if (attributeValue.attribute.id == attributeUids.LEVEL) {
            dataElement.level = attributeValue.value;
        }
        if (attributeValue.attribute.id == attributeUids.PARENT) {
            dataElement.parent = attributeValue.value;
        }
        if (attributeValue.attribute.id == attributeUids.ORGUNITGROUP) {
            dataElement.orgUnitGroup = attributeValue.value;
        }
        if (attributeValue.attribute.id == attributeUids.PERIOD) {
            dataElement.periods = attributeValue.value;
        }
    });

    if ((dataElement.parent == undefined || dataElement.level == undefined) && dataElement.orgUnitGroup == undefined) {
        console.error("Invalid dataElement organisation unit attributes", " DataElement:" + dataElement.id);
        return false;
    }
    return true;
};


/**
 * Loads the organisationUnit for each dataelement.
    @param dataElement The active dataElement
 */
OrganisationUnitActivator.prototype.processDataElements = function (dataElement, dataValues) {
    console.log("\nLoading organisationUnits...");
    if (dataElement.orgUnitGroup != undefined) {
        console.info("\nLoading orgUntis from orgUnitGroup " + dataElement.orgUnitGroup);
        this.processOrgUnitsByOrgUnitGroup(dataElement, dataValues);
    } else {
        console.info("\nLoading orgUntis from parent: " + dataElement.parent + " level: " + dataElement.level);
        this.processOrgUnitsFromParentLevel(dataElement, dataValues);
    }
};


/**
 * Loads the organisationUnit parent using the parent attribute, and loads the organisationUnit by level.
@param dataElement The active dataElement
 */
OrganisationUnitActivator.prototype.processOrgUnitsFromParentLevel = function (dataElement, dataValues) {
    var _this = this;
    var endpoint = this.endpoints.ORGANISATION_UNITS_BY_UID.replace("UID", dataElement.parent);
    var url = this.prepareOptions(endpoint);
    console.info("Request the organisationUnit parent from parent attribute.", "URL: " + url.url);
    this.asyncCalls++;
    request(url, function (error, response, body) {
        if (error != undefined) {
            console.error("Error loading orgUnit from parent and level",
                error);
            _this.asyncCalls--;
            return;
        }
        dataElement.parentLevel = JSON.parse(body).level;
        _this.processOrgUnitsByLevel(dataElement, dataValues);
        _this.asyncCalls--;
    });
};

/**
 * Loads the organisationUnit by level.
@param dataElement The active dataElement
 */
OrganisationUnitActivator.prototype.processOrgUnitsByLevel = function (dataElement, dataValues) {
    var _this = this;
    var endpoint = this.endpoints.ORGANISATION_UNITS_BY_PARENT_AND_LEVEL.replace("UID", dataElement.parent).replace("LEVELVALUE", dataElement.level - dataElement.parentLevel);
    var url = this.prepareOptions(endpoint);
    console.info("Request the organisationUnit  by level", "URL: " + url.url);
    this.asyncCalls++;
    request(url, function (error, response, body) {
        _this.processOrgUnitResponse(error, response, body, dataElement, dataValues);
    });
};

/**
 * Loads the organisationUnit by orgUnit group
@param dataElement The active dataElement
 */
OrganisationUnitActivator.prototype.processOrgUnitsByOrgUnitGroup = function (dataElement, dataValues) {
    var _this = this;
    var endpoint = this.endpoints.ORGANISATION_UNITS_BY_ORGANISATION_UNIT_GROUP.replace("UID", dataElement.orgUnitGroup);
    var url = this.prepareOptions(endpoint);
    console.info("Request the organisationUnit using the OrgUnitGroup attribute", "URL: " + url.url);
    this.asyncCalls++;
    request(url, function (error, response, body) {
        _this.processOrgUnitResponse(error, response, body, dataElement, dataValues);
    });
};

/**
 * Process all the pull organisationUntis responses
@param error Contains the error
@param response Contains the response
@param body Contains the body
 */
OrganisationUnitActivator.prototype.processOrgUnitResponse = function (error, response, body, dataElement, dataValues) {
    if (error != undefined) {
        console.error("Error loading orgUnits",
            error);
        this.asyncCalls--;
        return;
    }
    console.info("Response body: ", body);
    var organisationUnits = JSON.parse(body).organisationUnits;
    if (organisationUnits == undefined) {
        console.error("Error: OrganisationUnits not Found.", "dataelement: " + dataelement.id);
        this.asyncCalls--;
        return;
    }
    console.info("Found " +
        organisationUnits.length +
        " dataElements \n\t" +
        organisationUnits.map(function (organisationUnit) { return organisationUnit.id }).join("\n\t")
    );
    this.prepareDataValues(organisationUnits, dataElement, dataValues);
    this.asyncCalls--;
    this.pushDataValues(dataValues);
}

/**
 * Loops all the organisation units and prepare their dataSets
@param organisationUnits Contains all the organisationUntis
@param dataElement It is the organisationUnit dataelement for this loop.
 */
OrganisationUnitActivator.prototype.prepareDataValues = function (organisationUnits, dataElement, dataValues) { 
    console.log("\nPreparing dataValues");
    var _this = this;
    organisationUnits.forEach(function (organisationUnit) {
        _this.prepareDataOrgUnitDataValues(organisationUnit, dataElement, dataValues);
    });
};

/**
 * Prepares the dataSet.*
@param orgUnit Contains the organisation unit uid and the closed and opening dates used to set the orgUnit as active or inactive
@param dataElement The dataelement to be pushed with this organisation Unit
*/
OrganisationUnitActivator.prototype.prepareDataOrgUnitDataValues = function (orgUnit, dataElement, dataValues) {
    //Parse the server dates.
    if (orgUnit.closedDate != undefined) {
        orgUnit.closedDate =  dateFormatter.parseDateFromDhis(orgUnit.closedDate);
    }
    if (orgUnit.openingDate != undefined) {
        orgUnit.openingDate = dateFormatter.parseDateFromDhis(orgUnit.openingDate);
    }

    var today = new Date();
    today.setMonth(((today.getMonth() + 1) - parseInt(dataElement.periods)));
    
    for (var fixDate = parseInt(dataElement.periods); fixDate > 0; fixDate--) {
        var row; 
        var date = new Date(); 
        //Fix the date to show the actual period date month
        date.setMonth(((date.getMonth()) - fixDate));

        var firstPeriodDate = new Date(); 
        firstPeriodDate.setMonth(((date.getMonth()) - parseInt(dataElement.periods)));

        var dateAsPeriod = dateFormatter.parseDateToPeriodFormat(date);
        row = { "dataElement": dataElement.id, "period": dateAsPeriod, "orgUnit": orgUnit.id, "value": "" };

        var firstDateAsPeriod = dateFormatter.parseDateToPeriodFormat(firstPeriodDate);
        if (orgUnit.closedDate == undefined) {
            //If closedDate does not exist then All Periods are Active
            row["value"] = 1; 
        }
        else if (orgUnit.closedDate.getTime() < firstPeriodDate.getTime() &&
            (orgUnit.openingDate != undefined && orgUnit.openingDate.getTime() < orgUnit.closedDate.getTime())) {
            //If closedDate is previous than the first period and the openingDate is previous than the closedDate then All Periods are Inactive 
            row["value"] = 0; 
        } else if (date.getTime() < orgUnit.closedDate.getTime() || dateAsPeriod == dateFormatter.parseDateToPeriodFormat(orgUnit.closedDate)) {
            //In any other case the periods previous than the closedDate (including the same month) are Active and the later periods are Inactive (unless we find an openingDate).
            row["value"] = 1;
        } else {
            row["value"] = 0; 
            if (orgUnit.closedDate.getTime() < orgUnit.openingDate.getTime() && orgUnit.openingDate.getTime() < date.getTime()) { 
                row["value"] = 1; 
            }
        }

        console.info("Added new Dataperiod", "dataElement uid:" + dataElement.id + " period " + dateAsPeriod + " - " + fixDate + " OrgUnit uid: " + orgUnit.id + " value " + row.value);

        //push the row into the dataValues array
        dataValues.push(row);
    }

}

/**
 * Push all the datavalues
 * @param dataElementGroup The dataElementGroup  is used show a correct debug info
 */
OrganisationUnitActivator.prototype.pushDataValues = function (dataValues) {
    console.info("\nPending asyncalls: " + this.asyncCalls);
    if (this.asyncCalls == 0) {
        console.log("Pushing dataValues");
        this.push(this.buildDataValues(dataValues));
        console.log("The dataValues created from the dataElementGroup " + this.dataElementGroup + " was pushed");
    }
};

/**
 * Build the dataValues
 * @param rows A dataValue array cointaining all the periods for each dataelement+organisation unit
 */
OrganisationUnitActivator.prototype.buildDataValues = function (rows) {
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
 * @param dataElementGroup The dataElementGroup of the dataElements pushed, it is used to show a api url
 */
OrganisationUnitActivator.prototype.push = function (dataValues) {
    var _this = this;
    var url = this.prepareOptions(this.endpoints.DATAVALUE_SETS);
    url.json = true;
    url.body = dataValues;
    console.info("Push of all the datavalues url", "URL: " + url.url); 
    request.post(url, function (error, response, body) {
        if (error != undefined) {
            console.error("Error pushing datavalues ",
                error);
            return;
        }
        console.log("Values posted OK, summary", JSON.stringify(body, null, "\t"));
        console.info("Check in url(first orgunit): ", _this.requestOptions.url + _this.endpoints.DATAVALUES_RESULT.replace("ORGUNIT", dataValues.dataValues[0].orgUnit).replace("DATAELEMENTGROUP", _this.dataElementGroup));
    });
}