var request = require('request');
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
    this.dataElementGroups = conf.dataElementGroups;

    //common auth
    this.requestOptions = {
        headers: {
            "authorization": basicAuth(conf.api.auth.username, conf.api.auth.password),
            "accept": "application/json",
            "content-type": "application/json",
        },
        url: conf.api.protocol + "://" + conf.api.url
    }

    //asyncalls is used to detect if all the the request was resolved
    this.asyncCalls = 0;

    console.log("\nConfig:\n", JSON.stringify(conf, null, "\t"));
};

/**
 * Run script
 */
OrganisationUnitActivator.prototype.run = function () {
    console.log("\nLoading script...");
    var _this = this;
    //Process every dataElement group
    var dataValues;
    this.dataElementGroups.forEach(function (dataElementGroup) {
        _this.dataValues = [];
        console.info("\nFound dataElementGroup..." + dataElementGroup);
        _this.processDataElementGroup(dataElementGroup);
    });

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
 */
OrganisationUnitActivator.prototype.processDataElementGroup = function (dataElementGroup) {
    //Ask for 'DataElements'
    var _this = this;
    var endpoint = this.endpoints.DATAELEMENTGROUP.replace("UID", dataElementGroup);
    var url = this.prepareOptions(endpoint);
    console.log(url);
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

        _this.asyncCalls--;
        //Process every dataElements
        dataElements.forEach(function (dataElement) {
            dataElement.dataElementGroup = dataElementGroup;
            console.info("\nConfig:\n", JSON.stringify(dataElement, null, "\t"));
            _this.prepareDataElement(dataElement);
            _this.processDataElements(dataElement);
        });
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
OrganisationUnitActivator.prototype.processDataElements = function (dataElement) {
    //Ask for 'DataElements'
    var _this = this;
    if (dataElement.parent == undefined && dataElement.level == undefined) {
        if (dataElement.orgUnitGroup != undefined) {
            console.info("\nLoading orgUntis from orgUnitGroup " + dataElement.orgUnitGroup);
            _this.processOrgUnitsByOrgUnitGroup(dataElement);
        }
        else {
            console.error("\The dataelement  hasn't  organisationUnit " + dataElement.dataElementGroups);
        }
    } else {
        console.info("\nLoading orgUntis from parent: " + dataElement.parent + " level: " + dataElement.level);
        _this.processOrgUnitsFromParentLevel(dataElement);

    }
};


/**
 * Loads the organisationUnit parent using the parent attribute, and loads the organisationUnit by level.
 */
OrganisationUnitActivator.prototype.processOrgUnitsFromParentLevel = function (dataElement) {
    //Ask for 'Organisation Units'
    var _this = this;
    var endpoint = this.endpoints.ORGANISATION_UNITS_BY_UID.replace("UID", dataElement.parent);
    var url = this.prepareOptions(endpoint);
    console.log(url);
    this.asyncCalls++;
    request(url, function (error, response, body) {
        if (error != undefined) {
            console.error("Error loading orgUnit from parent and level",
                error);
            _this.asyncCalls--;
            return;
        }
        _this.level = JSON.parse(body).level;
        dataElement.parentLevel = _this.level;
        _this.asyncCalls--;
        _this.processOrgUnitsByLevel(dataElement);
    });
};

/**
 * Loads the organisationUnit by level, and prepares the DataSet.
 */
OrganisationUnitActivator.prototype.processOrgUnitsByLevel = function (dataElement) {
    //Ask for 'Organisation Units' by level
    var _this = this;
    var endpoint = this.endpoints.ORGANISATION_UNITS_BY_PARENT_AND_LEVEL.replace("UID", dataElement.parent);
    endpoint = endpoint.replace("LEVELVALUE", dataElement.level - dataElement.parentLevel);
    var url = this.prepareOptions(endpoint);
    console.log(url);
    this.asyncCalls++;
    request(url, function (error, response, body) {
        if (error != undefined) {
            console.error("Error loading orgUnit by level",
                error);
            _this.asyncCalls--;
            return;
        }
        console.info("Found " + body);
        _this.organisationUnits = JSON.parse(body).organisationUnits;
        console.info("Found " +
            _this.organisationUnits.length +
            " dataElements \n\t" +
            _this.organisationUnits.map(function (organisationUnit) { return organisationUnit.id }).join("\n\t")
        );

        _this.asyncCalls--;
        _this.prepareAndPushDataValues(_this.organisationUnits, dataElement);
    });
};


/**
 * Loads the organisationUnit using the OrgUnitGroup attribute, and prepare the DataSet.
 */
OrganisationUnitActivator.prototype.processOrgUnitsByOrgUnitGroup = function (dataElement) {
    //Ask for 'Organisation Units'
    var _this = this;
    var endpoint = this.endpoints.ORGANISATION_UNITS_BY_ORGANISATION_UNIT_GROUP.replace("UID", dataElement.orgUnitGroup);
    var url = this.prepareOptions(endpoint);
    console.log(url);
    this.asyncCalls++;
    request(url, function (error, response, body) {
        if (error != undefined) {
            console.error("Error loading orgUnit by OrgUnit group",
                error);
            _this.asyncCalls--;
            return;
        }
        console.info("Found " + body);
        var organisationUnits = JSON.parse(body).organisationUnits;
        if (organisationUnits == undefined) {
            console.error("Error: OrganisationUnits not Found dataelement: " + dataelement.id);
            return;
        }
        console.info("Found " +
            organisationUnits.length +
            " dataElements \n\t" +
            organisationUnits.map(function (organisationUnit) { return organisationUnit.id }).join("\n\t")
        );
        _this.asyncCalls--;
        _this.prepareAndPushDataValues(_this.organisationUnits, dataElement);
    });
};


OrganisationUnitActivator.prototype.prepareAndPushDataValues = function (organisationUnits, dataElement) {
    //Ask for 'Organisation Units'
    var _this = this;
    organisationUnits.forEach(function (organisationUnit) {
        _this.prepareDataSet(organisationUnit, dataElement);
    });
    if (this.asyncCalls <= 0) {
        console.log("Pushing dataValues");
        _this.postDataValues(_this.buildDataValues(_this.dataValues), dataElement.dataElementGroup);
        console.log("Pushed dataValues from " + dataElement.dataElementGroup + " pushed");
    }
};
/**
 * Prepares and pushes the dataSet.
 */
OrganisationUnitActivator.prototype.prepareDataSet = function (orgUnit, dataElement) {
    var _this = this;

    //Parse dhis dates.
    if (orgUnit.closedDate != undefined) {
        orgUnit.closedDate = _this.parseDateFromDhis(orgUnit.closedDate);
    }
    if (orgUnit.openingDate != undefined) {
        orgUnit.openingDate = _this.parseDateFromDhis(orgUnit.openingDate);
    }

    var today = new Date();
    today.setMonth(((today.getMonth() + 1) - parseInt(dataElement.periods)));
    for (var i = parseInt(dataElement.periods); i > 0; i--) {// i > 0 skipes the current period
        var row;
        var fixDate = i;
        var date = new Date();
        date.setMonth(((date.getMonth()) - fixDate));//get the period date
        var dateAsPeriod = this.parseDateToPeriodFormat(date);
        if (orgUnit.closedDate != undefined && (orgUnit.closedDate.getTime() < date.getTime() && dateAsPeriod != this.parseDateToPeriodFormat(orgUnit.closedDate))) {
            //if the closed date exists and is previous and not equals than the period date: the orgUnit is inactive
            row = { "dataElement": dataElement.id, "period": dateAsPeriod, "orgUnit": orgUnit.id, "value": 0 };

            if (orgUnit.closedDate.getTime() < orgUnit.openingDate.getTime() &&
                (orgUnit.openingDate.getTime() < date.getTime() || this.parseDateToPeriodFormat(orgUnit.openingDate) == dateAsPeriod)) {
                //but if the closed date is previous than the opening date, 
                //and if the opening date is previous or in the same year and month than the date, it is active
                row = { "dataElement": dataElement.id, "period": dateAsPeriod, "orgUnit": orgUnit.id, "value": 1 };
            }
        } else {
            //The org unit is active if the closdeDate is undefined  or the period is previous or equals than the closed date
            row = { "dataElement": dataElement.id, "period": dateAsPeriod, "orgUnit": orgUnit.id, "value": 1 };
        }
        console.info("dataElement uid:" + dataElement.id + " period " + dateAsPeriod + " - " + i + " OrgUnit uid: " + orgUnit.id + " value " + row.value);

        //Add the row to the dataValues array
        _this.dataValues.push(row);
    }

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
    console.log("Push dataValues");
    var _this = this;
    var postInfo = this.prepareOptions(this.endpoints.DATAVALUE_SETS);
    postInfo.json = true;
    postInfo.body = dataValues;
    request.post(postInfo, function (error, response, body) {
        if (error != undefined) {
            console.error("Error pushing datavalues ",
                error);
            return;
        }
        console.log("Values posted OK, summary", JSON.stringify(body, null, "\t"));
        console.log("Check in url(first orgunit): ", _this.requestOptions.url + _this.endpoints.DATAVALUES_RESULT.replace("ORGUNIT", dataValues.dataValues[0].orgUnit).replace("DATAELEMENTGROUP", dataElementGroup));
    });
}

/**
 * Parse the date to a period format "yyyymm"
 */
OrganisationUnitActivator.prototype.parseDateToPeriodFormat = function (date) {
    var dateMonth = ("0" + (date.getMonth() + 1)).slice(-2);//fix javascript month format (1 to 12 insteand of 0-11 and mm insteand of m format)
    var datePeriodFormat = (date.getFullYear() + dateMonth);
    return datePeriodFormat;
}

/**
 * Parse the server date vale to javascript date value.
 */
OrganisationUnitActivator.prototype.parseDateFromDhis = function (dateAsString) {
    var parseDate = new Date();
    parseDate.setFullYear(dateAsString.substring(0, 4));// Example of server date format: 1900-01-01T00:00:00.000
    parseDate.setMonth(dateAsString.substring(5, 7) - 1);
    parseDate.setDate(dateAsString.substring(8, 10));
    parseDate.setHours(dateAsString.substring(11, 13));
    parseDate.setMinutes(dateAsString.substring(14, 16));
    parseDate.setSeconds(dateAsString.substring(18, 20));
    var n = parseDate.toString();
    return parseDate;
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