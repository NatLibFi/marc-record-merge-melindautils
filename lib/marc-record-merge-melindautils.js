//mergeutils melinda
'use strict';

const RecordUtils = require('./record-utils');
const validateFields = require('./validate-fields');
const debug = require('debug')('melindautils');

const { 
  byTag,
  checkForDiacritics,
  exactFieldComparator,
  fieldSorter,
  findId,
  formatDate,
  getSubfieldContent,
  isDeleted,
  mergeError,
  propValue,
  recordHasSid,
  toQueryObject,
} = RecordUtils;

const { recordsNotSuppressed, noSameLOWTags, preferredRecordInFENNI, sameType, 
  checkFieldRequirements, checkDiacriticsFromTitle, sameAuthorType,
  noAlephMultifields, same300TypeAndCount, notHostRecord, notComponentRecord } = require('./mergeability-validators');

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

  async function canMerge(otherRecord, preferredRecord) {
  
    if (isDeleted(otherRecord)) {
      throw mergeError('Other record is deleted');
    }
    if (isDeleted(preferredRecord)) {
      throw mergeError('Preferred record is deleted');
    }

    let errors = [];
    const checks = [
      recordsNotSuppressed, 
      noSameLOWTags,
      sameType,
      checkFieldRequirements,
      preferredRecordInFENNI,
      checkDiacriticsFromTitle,
      sameAuthorType,
      noAlephMultifields,
      same300TypeAndCount,
      notComponentRecord,
      notHostRecord(bib_db)
    ];

    for (const checkFn of checks) {
      try {
        await checkFn.call(null, otherRecord, preferredRecord);
      } catch(checkErrors) {
        errors = errors.concat(checkErrors);
      }
    }

    validateFields({
      '245': { validate: 'preferredIsSuperset' },
    }, otherRecord, preferredRecord).forEach(function(msg) {
      debug('STAT 245] ' + msg);
    });

    checkForDiacritics(['245'], otherRecord, preferredRecord).forEach(function(msg) {
      debug('STAT DIAC] ' + msg);
    });
  
    if (errors.length > 0) {
      throw mergeError(errors.join('\n'));
    }
    return 'OK';
  }
  
  function applyPostMergeModifications(otherRecord, preferredRecord, mergedRecord) {
    // Handle low tags by moving them from 'otherRecord' to mergedRecord
    // and then creating SID links to both preferred and other record
   
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
    return new Promise((resolve, reject) => {

      try {

        var otherQueryObject = toQueryObject(otherRecord);
        var prefQueryObject = toQueryObject(preferredRecord);
      
        if ( otherQueryObject === undefined || prefQueryObject === undefined || 
          otherQueryObject.name === prefQueryObject.name) {
          
          resolve();
          
        } else {

          if (otherQueryObject.tag !== prefQueryObject.tag) {
            reject(mergeError('Author type mismatch.'));
          } else {

            var tag = otherQueryObject.tag;

            var queries = [
              authorInAuthorizedFormat(otherRecord),
              authorInAuthorizedFormat(preferredRecord)
            ];
          
            Promise.all(queries).then(function(results) {
              
              var otherIsAuthorized = results[0];
              var preferredIsAuthorized = results[1];

              var authorizedStatMessage = 'preferredIsAuthorized: ' + preferredIsAuthorized + ' otherIsAuthorized: ' + otherIsAuthorized;

              debug(authorizedStatMessage);
          
              if (otherIsAuthorized && preferredIsAuthorized) {
                return reject(mergeError('Both records are in authorized format.'));
              }

              if (otherIsAuthorized) {

                mergedRecord.fields = mergedRecord.fields.filter(function(field) {
                  return field.tag !== tag;
                });

                var field = otherRecord.fields.filter(byTag(tag))[0];

                if (field === undefined) {
                  return reject(mergeError('Could not find author from record'));
                }

                mergedRecord.fields.push(field);

              }

              resolve();
            }).catch(function(error) {

              reject(error);
            });
          }
        }

      } catch (error) {

        reject(error);
      }

    }).then(function() {
      mergedRecord.fields.sort(fieldSorter);
    });
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
    applyPostMergeModifications: applyPostMergeModifications
  };

}

module.exports = constructor;