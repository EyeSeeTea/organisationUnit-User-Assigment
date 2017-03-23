/**
 * Utils to format classes to the correct format
 */
function DateFormatter() {
}
/**
 * Parse the date to a period format "yyyymm"
 */
DateFormatter.prototype.parseDateToPeriodFormat = function (date) {
    var dateMonth = ("0" + (date.getMonth() + 1)).slice(-2);//fix javascript month format (1 to 12 insteand of 0-11 and mm insteand of m format)
    var datePeriodFormat = (date.getFullYear() + dateMonth);
    return datePeriodFormat;
}

/**
 * Parse the server date value to javascript date value.
 */
DateFormatter.prototype.parseDateFromDhis = function (dateAsString) {
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
module.exports = new DateFormatter();