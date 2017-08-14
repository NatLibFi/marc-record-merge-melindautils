//mergeutils melinda
'use strict';

const Q = require('q');
const XRegExp = require('xregexp').XRegExp;
const RecordUtils = require('./record-utils');

const { byTag, toFirstSubfieldValue, setsIdentical, fieldComparator, mergeError,
  isSubset, normalizingSubsetComparator, anyDiacritics, findId, formatDate, 
  exactFieldComparator, toQueryObject, getSubfieldContent, recordHasSid, fieldSorter } = RecordUtils;

function constructor(auth_db, bib_db) {

  /**
   *
   *  Checks whether 2 records can be merged, returns an object:
   *  
   *  {
   *	  mergePossible: true|false,
    *	  reason: ['if merge is not possible, the reason(s) for it']
    *	}
    *
    */
  function canMerge(otherRecord, preferredRecord) {
  
    var errors = [];

    var deferred = Q.defer();


    if (isDeleted(otherRecord)) {
      deferred.reject(mergeError('Record is deleted'));
      return deferred.promise;
    }
    if (isDeleted(preferredRecord)) {
      deferred.reject(mergeError('Record is deleted'));
      return deferred.promise;
    }
    if (isSuppressed(otherRecord)) {
      errors.push('Record is suppressed');
    }
    if (isSuppressed(preferredRecord)) {
      errors.push('Record is suppressed');
    }

    // both have same low tags
    var other_LOW = otherRecord.fields.filter(byTag('LOW')).map(toFirstSubfieldValue('a'));
    var preferred_LOW = preferredRecord.fields.filter(byTag('LOW')).map(toFirstSubfieldValue('a'));
  
    other_LOW.forEach(function(oLow) {
      if (preferred_LOW.indexOf(oLow) !== -1) {
        errors.push('Both records have have LOW tag: ' + oLow);
      }
    });

    function arrayContains(arr, item) {
      return arr.indexOf(item) !== -1;
    }
    
    if (arrayContains(other_LOW, 'FENNI') && !arrayContains(preferred_LOW, 'FENNI')) {
      errors.push('Other record has LOW: FENNI, but preferred does not.');
    }

    // record type, leader index 6
    var oType = otherRecord.leader.substr(6,1);
    var pType = preferredRecord.leader.substr(6,1);

    if (oType !== pType) {
      errors.push('Records are of different type (leader/6): ' + oType + ' - ' + pType);
    }


    
    var stopFields = {
      '027': { validate: ['neitherHas'] },
      '240': { validate: ['identical', 'neitherHas'] },
      '830': { validate: ['identical', 'preferredIsSupersetExceptIfEmpty'] }, 
      '880': { validate: ['identical', 'otherHas']}
    };

    var stopFieldErrors = validateFields(stopFields, otherRecord, preferredRecord);
    errors = errors.concat(stopFieldErrors);

    validateFields({
      '245': { validate: 'preferredIsSuperset' },
    }, otherRecord, preferredRecord).forEach(function(msg) {
      Q.nextTick(function() {
        // these need to be done in nexttick since they are sync and thus will fire before progress listeners are set.
        deferred.notify('STAT 245] ' + msg);
      });
    });

    checkForDiacritics(['245'], otherRecord, preferredRecord).forEach(function(msg) {
      Q.nextTick(function() {
        deferred.notify('STAT DIAC] ' + msg);
      });
    });
    var diacriticsErrors = validateDiacritics(['245'], otherRecord, preferredRecord);
    errors = errors.concat(diacriticsErrors);

    var requiredIndenticalCounts = ['100','110','111'];
    requiredIndenticalCounts.forEach(function(countField) {
      if (!identicalCount(countField, otherRecord, preferredRecord)) {
        errors.push('Field count mismatch for field ' + countField);
      }

      function identicalCount(tag, rec1, rec2) {
        var r1fields = rec1.fields.filter(byTag(tag));
        var r2fields = rec2.fields.filter(byTag(tag));

        return r1fields.length === r2fields.length;
      }
    });

    // is a component record?
    [otherRecord, preferredRecord].forEach(function(record) {

      if (['a','b','d'].indexOf(record.leader.charAt(7)) !== -1) {
        var id = record.fields.filter(byTag('001'));
        id = id[0] || 'unknown';
        id = id.value || 'unknown';

        errors.push('record is a component record: ' + id);
      }
      
    });

    [otherRecord, preferredRecord].forEach(function(record) {

      record.fields.some(function(field) {
        
        if (field.subfields !== undefined && field.subfields.length > 0) {
          
          if (field.subfields[0].value.substr(0,2) == '^^') {
            var id = record.fields.filter(byTag('001'));
            id = id[0] || 'unknown';
            id = id.value || 'unknown';

            errors.push('Record has Aleph field cutting technology, which makes merging impossible: ' + id);
            return true;
          }
        }
      });

    });


    var o300a = selectValue(otherRecord, '300', 'a');
    var p300a = selectValue(preferredRecord, '300', 'a');

    if (o300a !== null || p300a !== null) {

      if (o300a !== p300a) {
        var otherRecordType = inferTypeAndCount(o300a);
        var preferredRecordType = inferTypeAndCount(p300a);

        if (otherRecordType === null && preferredRecordType === null) {
          errors.push('Could not infer the meaning of 300a.');
        }

        if (otherRecordType !== null && preferredRecordType !== null) {
          if (otherRecordType.type !== preferredRecordType.type) {
            errors.push('Inferred record types differ (from field 300a): + ' + otherRecordType.type +' - ' + preferredRecordType.type);
          }
          if (otherRecordType.count !== preferredRecordType.count) {
            errors.push('Records have different inferred count of types (from field 300a): ' + otherRecordType.count +' - ' + preferredRecordType.count);
          }
        }
      }
    }



    Q.all([
      isHostRecord(otherRecord),
      isHostRecord(preferredRecord),
    ]).then(function(responses) {

      responses.forEach(function(response) {
        if (response.isHost) {
          errors.push('record is a host record: ' + response.id);
        }
      });

      if (errors.length > 0) {
    
        deferred.reject(mergeError(errors.join('\n')));			

      } else {
        deferred.resolve('OK');
      }

    }).catch(function(err) {
      deferred.reject(err);
    }).done();
    
    return deferred.promise;
  }

  function selectValue(record, tag, subfieldCode) {

    var fields = record.fields.filter(byTag(tag));
    if (fields.length === 0) {
      return null;
    }
    
    var values = fields.map(function(field) {
      field.subfields = field.subfields || [];
      return field.subfields.filter(function(sub) {
        return sub.code === subfieldCode;
      }).map(function(sub) {
        return sub.value;
      });
    });
    
    values = Array.prototype.concat.apply([], values);

    if (values.length === 0) {
      return null;
    }
    
    return values[0];
  }


  function inferTypeAndCount(str) {
    if (str === null || str === undefined) return str;

    str = str.toLowerCase();
    
    var IMPLICIT_VOLUME_WITH_PREFACE = /^([ivxlcdm]+)[,\\.]*\s*([0-9],\s*)*.*$/;
    var IMPLICIT_VOLUME_WITHOUT_PREFACE = /^(\[?[0-9]+\]?,?\s*)+ pages$/;

    var VOLUMES = [
      /^(\d+)\s*volumes/, 
      /^(\d+)\s*vol/, 
      /^(\d+)\s*nid/,
      /^(\d+)\s*v\./ 

    ];

    var PAGES_ALIAS = ['p', 's'];

    var types = [];
    VOLUMES.forEach(function(re) {
      var match = str.match(re);
      if (match !== null) {
        
        types.push({
          type: 'volume',
          count: parseInt(match[1], 10)
        });
        
      }
    });
    if (types.length > 0) {
      return types[0];
    }

    var strCopy = str;
    // try to infer the number of volumes from implicit declaration
    PAGES_ALIAS.forEach(function(alias) {
      var middleRe = new XRegExp('[^\\p{L}]'+alias+'[^\\p{L}]');
      var endRE = new XRegExp('[^\\p{L}]'+alias+'$');

      strCopy = strCopy.replace(middleRe, ' pages ');
      strCopy = strCopy.replace(endRE, ' pages ');
      strCopy = strCopy.replace(/[\\.;:\s+]$/g, '');
      strCopy = strCopy.trim();
    });

    var match;
    match = strCopy.match(IMPLICIT_VOLUME_WITH_PREFACE);
    if (match !== null) {
      return {
        type: 'volume',
        count: 1
      };
    }
    match = strCopy.match(IMPLICIT_VOLUME_WITHOUT_PREFACE);
    if (match !== null) {
      return {
        type: 'volume',
        count: 1
      };
    }

    return types.length > 0 ? types[0] : null;
  }

  function isHostRecord(record) {
    var id = record.fields.filter(byTag('001'));
    id = id[0] || undefined;

    if (id === undefined) {
      var deferred = Q.defer();

      deferred.reject(mergeError('Could not parse record id'));
      return deferred.promise;
    }

    id = id.value || undefined;

    return bib_db.raw({
      'op': 'find',
      'base': 'fin01',
      'request': 'MHOST=' + id
    }).then(function(response) {
      if (response.data.find.error !== undefined && response.data.find.error === 'empty set') {
        return {
          id: id,
          isHost: false
        };
      }
      if (response.data.find.no_records !== undefined && response.data.find.no_records > 0) {
        return {
          id: id,
          isHost: true
        };
      }
      throw mergeError('Could not parse response from X-server on isHostRecord validation');
      
    });
  

  }
  function propValue(property, value) {
    return function(obj) {
      return obj[property] === value;
    };
  }
  function applyPostMergeModifications(otherRecord, preferredRecord, mergedRecord) {
    // Handle low tags by moving them from 'otherRecord' to mergedRecord
    //  and then creating SID links to both preferred and other record
    //  
    
    var deferred = Q.defer();

    mergedRecord.fields.filter(byTag('041')).forEach(function(field) {
      var hasShortLanguageCode = field.subfields.filter(propValue('code', 'a')).some(function(f) { return f.value.length < 3; });
      if (hasShortLanguageCode) {
        throw mergeError('Merged record has 041a field with length less than 3. This may break when saved to aleph.');
      }
    });


  
    var LOW_fields = otherRecord.fields.filter(byTag('LOW'));
    
    var other_id = findId(otherRecord);
    mergedRecord.fields = mergedRecord.fields.concat(LOW_fields);
    LOW_fields.forEach(function(field) {

      var libraryId = getSubfieldContent(field, 'a');
      if (libraryId === undefined) {
        return;
      }

      var SID_fields = recordHasSid(otherRecord, libraryId);

      if (SID_fields.length > 0) {

        SID_fields.forEach(function(field) {
          mergedRecord.fields.push(field);
        });
        
        return;
      }

      mergedRecord.fields.push({
        tag: 'SID',
        subfields: [
          { code: 'c', value:'FCC' + other_id },
          { code: 'b', value: libraryId.toLowerCase() },					
        ]
      });
    });

    // Now make sid links from preferred record to merged too.
    LOW_fields = preferredRecord.fields.filter(byTag('LOW'));
    var preferred_id = findId(preferredRecord);
    LOW_fields.forEach(function(field) {

      var libraryId = getSubfieldContent(field, 'a');
      if (libraryId === undefined) {
        return;
      }

      var SID_fields = recordHasSid(preferredRecord, libraryId);

      if (SID_fields.length > 0) {

        // because preferred record is used as base, any sid fields are already in the merged one.
        
        return;
      }

      mergedRecord.fields.push({
        tag: 'SID',
        subfields: [
          { code: 'c', value:'FCC' + preferred_id },
          { code: 'b', value: libraryId.toLowerCase() },					
        ]
      });
    });

    // Handle 035 tags by creating a,z fields to mergedRecrod from other and preferred records
    mergedRecord.fields.push({
      tag: '035',
      subfields: [
        { code: 'z', value:'(FI-MELINDA)' + other_id },
      ]
    });
    
    mergedRecord.fields.push({
      tag: '035',
      subfields: [
        { code: 'z', value:'(FI-MELINDA)' + preferred_id },
      ]
    });

    // Remove bib-id from mergedRecord 001, because we are going to save it as new
    mergedRecord.fields = mergedRecord.fields.filter(function(field) {
      return field.tag !== '001';
    });
    mergedRecord.fields.push({
      tag: '001',
      value: '000000000'
    });

    // add 583 field with comments about merge operation.
    
    mergedRecord.fields.push({
      tag: '583',
      subfields: [
        { code: 'a', value:'MERGED FROM ' + '(FI-MELINDA)' + other_id + ' + ' + '(FI-MELINDA)' + preferred_id },
        { code: 'c', value: formatDate(new Date()) },
        { code: '5', value:'MELINDA' },
      ]
    });

    // Remove CAT-fields from the merged record, history is kept in the source records.
    mergedRecord.fields = mergedRecord.fields.filter(function(f) { return f.tag !== 'CAT';});

    var reprintFields = otherRecord.fields.filter(byTag('250'));
    reprintFields.filter(function(field) {
      return !mergedRecord.fields.some(function(fieldInMerged) {
        return exactFieldComparator(fieldInMerged, field);
      });
    }).map(function(field) {
      return field.subfields.filter(function(sub) { 
        return sub.code === 'a'; 
      }).map(function(sub) { 
        return sub.value.trim();
      });
    }).forEach(function(reprintText) {
      var text = 'Lisäpainokset: ' + reprintText;
      
      var f008 = otherRecord.fields.filter(byTag('008'))[0];
      if (f008 !== undefined) {
        var year = f008.value.substr(7,4);

        if (!isNaN(year)) {
          text += ' ' + year;
        }
      }

      if (!/\.$/.test(text)) {
        text += '.';
      }

      const norm = (text) => text.replace(/\W/g, '');
      const isAlreadyIncluded = mergedRecord.fields.filter(byTag('500')).some(field => {
        return field.subfields
          .filter(subfield => subfield.code === 'a')
          .map(subfield => subfield.value)
          .some(value => norm(value) === norm(text));
      });

      if (!isAlreadyIncluded) {
        mergedRecord.fields.push({
          tag: '500',
          subfields: [
            { code: 'a', value: text },
          ]
        });
      }
    });

    /*
    // use 245 field from other record if it's superior to preferred records field.
    var other_245 = otherRecord.fields.filter(byTag('245'))[0];
    var preferred_245 = preferredRecord.fields.filter(byTag('245'))[0];
    if (other_245 !== undefined && preferred_245 !== undefined) {
      if (isSubset(preferred_245.subfields, other_245.subfields, normalizingSubfieldComparator) &&
        !isSubset(other_245.subfields, preferred_245.subfields, normalizingSubfieldComparator)) {

        mergedRecord.fields = mergedRecord.fields.filter(function(field) {
          return field.tag !== '245';
        });

        mergedRecord.fields.push(other_245);
    
      }
    }
    */
  
    // 780 + fenni<keep> drop thing
    // 
    // 
    // 
    

    // Check authorities from asteri.
    try {

      var otherQueryObject = toQueryObject(otherRecord);
      var prefQueryObject = toQueryObject(preferredRecord);
    
      if ( otherQueryObject === undefined || prefQueryObject === undefined || 
        otherQueryObject.name === prefQueryObject.name) {
    
        deferred.resolve();

      } else {

        if (otherQueryObject.tag !== prefQueryObject.tag) {
          deferred.reject(mergeError('Author type mismatch.'));
        } else {

          var tag = otherQueryObject.tag;

          var queries = [
            authorInAuthorizedFormat(otherRecord),
            authorInAuthorizedFormat(preferredRecord)
          ];
        
          Q.all(queries).then(function(results) {
            
            var otherIsAuthorized = results[0];
            var preferredIsAuthorized = results[1];

            var authorizedStatMessage = 'preferredIsAuthorized: ' + preferredIsAuthorized + ' otherIsAuthorized: ' + otherIsAuthorized;

            deferred.notify(authorizedStatMessage);
        
            if (otherIsAuthorized && preferredIsAuthorized) {
              return deferred.reject(mergeError('Both records are in authorized format.'));
            }

            if (otherIsAuthorized) {

              mergedRecord.fields = mergedRecord.fields.filter(function(field) {
                return field.tag !== tag;
              });

              var field = otherRecord.fields.filter(byTag(tag))[0];

              if (field === undefined) {
                return deferred.reject(mergeError('Could not find author from record'));
              }

              mergedRecord.fields.push(field);

            }

            deferred.resolve();
          }).catch(function(error) {

            deferred.reject(error);
          }).done();
        }
      }

    } catch (error) {

      deferred.reject(error);
    }

    deferred.promise.then(function() {
      mergedRecord.fields.sort(fieldSorter);
    });

    return deferred.promise;
  }

  function checkForDiacritics(tagList, otherRecord, preferredRecord) {
    var issues = [];
    tagList.forEach(function(tag) {
      
      var other_stopFields = otherRecord.fields.filter(byTag(tag));
      var preferred_stopFields = preferredRecord.fields.filter(byTag(tag));

      var preferredHasDiacritics = anyDiacritics(preferred_stopFields);
      var otherHasDiacritics = anyDiacritics(other_stopFields);

      if (preferredHasDiacritics && otherHasDiacritics) {
        issues.push('Both fields have diacritics in field: ' + tag);
      } else {
        if (preferredHasDiacritics) {
          issues.push('Preferred fields has diacritics in field: ' + tag);
        }
        if (otherHasDiacritics) {
          issues.push('Other fields has diacritics in field: ' + tag);
        }
      }
    });
    return issues;
  }

  function validateDiacritics(tagList, otherRecord, preferredRecord) {
    var issues = [];
    tagList.forEach(function(tag) {
      var other_stopFields = otherRecord.fields.filter(byTag(tag));
      var preferred_stopFields = preferredRecord.fields.filter(byTag(tag));

      var preferredHasDiacritics = anyDiacritics(preferred_stopFields);
      var otherHasDiacritics = anyDiacritics(other_stopFields);
      if (!preferredHasDiacritics && otherHasDiacritics) {
        issues.push('Other fields has diacritics in field: ' + tag);
      }
    });
    return issues;
  }

  function isSuppressed(record) {
    var STA_a_values = record.fields.filter(byTag('STA')).map(toFirstSubfieldValue('a'));
    if (STA_a_values.some(function(val) { return val.toLowerCase() == 'suppressed'; })) {
      return true;
    }
    return false;
  }

  function isDeleted(record) {

    if (record.leader.substr(5,1) === 'd') {
      return true;
    }

    var DEL_a_values = record.fields.filter(byTag('DEL')).map(toFirstSubfieldValue('a'));
    if (DEL_a_values.some(function(val) { return val == 'Y'; })) {
      return true;
    }
    var STA_a_values = record.fields.filter(byTag('STA')).map(toFirstSubfieldValue('a'));
    if (STA_a_values.some(function(val) { return val.toLowerCase() == 'deleted'; })) {
      return true;
    }
    return false;
  }

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

  function authorInAuthorizedFormat(record) {

    var qo = toQueryObject(record);
    
    return auth_db.query('fin11', 'WNA', qo.name).then(function(results) {
      
      var isAuthorizedFormat = results.map(toQueryObject).filter(function(o) {
    
        return norm(o.name) === norm(toQueryObject(record).name);
      }).length > 0;

      return isAuthorizedFormat;

      function norm(str) {
        str = str.replace(/\.|,|:|-/g,' ');
        str = str.replace(/\s{2}/g, ' ');
        str = str.trim();
        return str;
      }
    });

  }

  return {
    canMerge: canMerge,
    applyPostMergeModifications: applyPostMergeModifications,
    _validateFields: validateFields,
    _inferTypeAndCount: inferTypeAndCount
  };

}

module.exports = constructor;