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