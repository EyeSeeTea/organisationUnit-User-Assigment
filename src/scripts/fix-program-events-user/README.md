= Description

The attribute _attributeCategoryOptions_ for events does not hold the correct value. 

This script fixes this value for some configured programs and date range (see `config.json`). For each event, the script takes the _storeBy_ attribute from the first item of the _dataValues_ section and uses the _api/categoryOptions_ to translate them to a _categoryOptionId_ value. 

= Examples

* Run with the default configuration (uses `config.json`):

```
$ npm run start
```

* Run with some custom configuration (uses `config.json` as base configuration):

```
$ npm run start -- \
    --api:auth:username=admin \
    --api:auth:password=district
    --fromDate="-60" \
    --programs=123 \
    --programs=456
```
