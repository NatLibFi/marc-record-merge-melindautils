//mergeutils melinda
'use strict';

const RecordUtils = require('./record-utils');
const validateFields = require('./validate-fields');
const debug = require('debug')('melindautils');

const { 
  byTag,
  checkForDiacritics,
  fieldSorter,
  isDeleted,
  mergeError,
  propValue,
} = RecordUtils;

const { recordsNotSuppressed, noSameLOWTags, preferredRecordInFENNI, sameType, 
  checkFieldRequirements, checkDiacriticsFromTitle, sameAuthorType,
  noAlephMultifields, same300TypeAndCount, notHostRecord, notComponentRecord } = require('./mergeability-validators');


const { 
  syncLOWandSIDFields, 
  add035zLinksToSourceRecords, 
  reset001FromMergedRecord,
  add583CommentAboutMergeOperation,
  removeCATFromMergedRecord,
  addReprintNotes,
  updateMergedRecordWithAuthorizedFormat
} = require('./post-merge-modifiers');

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
  
  async function applyPostMergeModifications(otherRecord, preferredRecord, mergedRecord) {
    // Post merge check
    mergedRecord.fields.filter(byTag('041')).forEach(function(field) {
      var hasShortLanguageCode = field.subfields.filter(propValue('code', 'a')).some(function(f) { return f.value.length < 3; });
      if (hasShortLanguageCode) {
        throw mergeError('Merged record has 041a field with length less than 3. This may break when saved to aleph.');
      }
    });

    // sync low tags by moving them from 'otherRecord' to mergedRecord
    // and then create SID links to both preferred and other record
    syncLOWandSIDFields(otherRecord, preferredRecord, mergedRecord);
   
    // Handle 035 tags by creating a,z fields to mergedRecrod from other and preferred records
    add035zLinksToSourceRecords(otherRecord, preferredRecord, mergedRecord);
   
    // reset bib-id from mergedRecord to zeros, because we are going to save it as new
    reset001FromMergedRecord(otherRecord, preferredRecord, mergedRecord);

    // add 583 field with comments about merge operation.
    add583CommentAboutMergeOperation(otherRecord, preferredRecord, mergedRecord);
  
    // Remove CAT-fields from the merged record, history is kept in the source records.
    removeCATFromMergedRecord(otherRecord, preferredRecord, mergedRecord);
  
    // Add notes on reprint
    addReprintNotes(otherRecord, preferredRecord, mergedRecord);


    
    // use 245 field from other record if it's superior to preferred records field.
    /*
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
    // this does not exist, should it?

    // Check authorities from asteri.
    await updateMergedRecordWithAuthorizedFormat(auth_db)(otherRecord, preferredRecord, mergedRecord);

    // sort any fields added by modifiers
    mergedRecord.fields.sort(fieldSorter);
  }

  return {
    canMerge: canMerge,
    applyPostMergeModifications: applyPostMergeModifications
  };

}

module.exports = constructor;