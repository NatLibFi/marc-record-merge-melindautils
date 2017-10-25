/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Utility functions to apply for MARC records during deduplication in Melinda
*
* Copyright (C) 2015, 2017 University Of Helsinki (The National Library Of Finland)
*
* This file is part of marc-record-merge-melindautils
*
* marc-record-merge-melindautils program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* marc-record-merge-melindautils is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU Affero General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* @licend  The above is the entire license notice
* for the JavaScript code in this file.
*
*/

const RecordUtils = require('./record-utils');
const { byTag, setsIdentical, fieldComparator, isSubset, normalizingSubsetComparator  } = RecordUtils;

function validateFields(validationConfig, otherRecord, preferredRecord) {
  var errors = [];

  Object.keys(validationConfig).forEach(function(tag) {
    var opts = validationConfig[tag];

    var other_fields = otherRecord.fields.filter(byTag(tag));
    var preferred_fields = preferredRecord.fields.filter(byTag(tag));

    if (opts.validate.indexOf('identical') !== -1) {
      if (setsIdentical(other_fields, preferred_fields, fieldComparator)) {
        return;
      }
    }

    if (opts.validate.indexOf('preferredIsSuperset') !== -1) {
      if (isSubset(preferred_fields, other_fields, normalizingSubsetComparator)) {
        errors.push('Preferred record has stopfields that are a subset of the other record in field: ' + tag);
      }
      
      if (!isSubset(other_fields, preferred_fields, normalizingSubsetComparator)) {
        errors.push('Other is not subset: ' + tag);
      }
      
    } else if (opts.validate.indexOf('preferredIsSupersetExceptIfEmpty') !== -1) {
      if (preferred_fields.length > 0 &&
        isSubset(preferred_fields, other_fields, normalizingSubsetComparator)) {
        errors.push('Preferred record has stopfields and they are a subset of the other record in field: ' + tag);	
      }

      if (preferred_fields.length > 0 &&
        !isSubset(other_fields, preferred_fields, normalizingSubsetComparator)) {
        errors.push('Other is not subset: ' + tag);
      }
    } else {

      if (other_fields.length > 0 && preferred_fields.length > 0 && !setsIdentical(other_fields, preferred_fields, fieldComparator)) {
            
        errors.push('Both records have differing stop fields. Automated handling is not currently possible for: ' + tag);
      
      } else {

        if (opts.validate.indexOf('neitherHas') !== -1) {
          if (other_fields.length > 0) {
            errors.push('Other record has stop fields. Automated handling is not currently possible for: ' + tag);
          } 

          if (preferred_fields.length > 0) {
            errors.push('Preferred record has stop fields. Automated handling is not currently possible for: ' + tag);
          }
        }

        if (opts.validate.indexOf('onlyPreferredHas') !== -1) {
          if (other_fields.length > 0) {
            errors.push('Other record has stop fields. Automated handling is not currently possible for: ' + tag);
          }
        }
      }
    }

  });
  return errors;
}

module.exports = validateFields;