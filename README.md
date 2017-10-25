# Utility functions to apply for MARC records during deduplication in Melinda

A javascript module to be used in addition to [marc-record-merge module](https://github.com/natlibfi/marc-record-merge). Handles Melinda-specific sanity checks and modifications of the duplicate records to be merged. This module is part of the larger marc record deduplication system.


## Installation
```
npm install marc-record-merge-melindautils
```

## Usage

```
var MergeUtilsMelinda = require('marc-record-merge-melindautils');
var mergeUtils = new MergeUtilsMelinda(config);

example config:
{
  authority_db: {
    Xendpoint: 'http://melinda.kansalliskirjasto.fi/X' 
  },
  bib_db: {
    Xendpoint: 'http://melinda.kansalliskirjasto.fi/X'
  }
}
```
Both dbs are expected to be Aleph ILS instances. The authority_db is used to query for authorized formats of authors while bib_db is used for checking host/component record relations.


Use function canMerge(record1, record2) to check whether 2 marc-record-js objects can be merged in Melinda
```
mergeUtils.canMerge(record1, record2).then(function(result) {
  // Everything is ok, merging is possible
}).catch(function(error) {
  // Merging is not possible, error.message contains the reason(s).
}).done();
```

After merging 2 records using marc-record-merge, Melinda specific post merge modifications can be made to the merged record.
This function will modify the mergedRecrod.
```
mergeUtils.applyPostMergeModifications(record1, record2, mergedRecord).then(function() {
  // post merge modifications were applied to mergedRecord. So its ready to be saved to the database or whatnot.
}).catch(function(error) {
  // handle any errors
}).done();

```

## Contribute

The grunt default task will run jshint, tests and coverage for the module. Tests can be found from test/ directory. Checking the tests may also be a good place to see how the module works.
Tests are currently executed using the Melinda test instance, so to run the tests a internet connection is required.

## License and copyright

Copyright (c) 2015, 2017 **University Of Helsinki (The National Library Of Finland)**

This project's source code is licensed under the terms of **GNU Affero General Public License Version 3** or any later version.