const { mergeError, toAuthorityQueryObject, findId, byTag, getSubfieldContent, recordHasSid, formatDate, exactFieldComparator } = require('./record-utils');


const pick = (propName) => (obj) => obj[propName];
const head = (arr) => arr && arr.length > 0 ? arr[0] : undefined;
const last = (arr) => arr && arr.length > 0 ? arr[arr.length-1] : undefined;

const equals = (expectedValue) => (givenValue) => expectedValue === givenValue;
const equalsWith = (comparator, expectedValue) => (givenValue) => comparator(expectedValue, givenValue);

const includesWith = (comparator, hayStack) => (needle) => hayStack.some(hay => comparator(hay, needle));
const notIncludedWith = (comparator, hayStack) => (needle) => !includesWith(comparator, hayStack)(needle);


// Handle low tags by moving them from 'otherRecord' to mergedRecord
// and then creating SID links to both preferred and other record

async function syncLOWandSIDFields(otherRecord, preferredRecord, mergedRecord) {
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
}

function add035zLinksToSourceRecords(otherRecord, preferredRecord, mergedRecord) {

  const other_id = findId(otherRecord);
  const preferred_id = findId(preferredRecord);

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
}

function reset001FromMergedRecord(otherRecord, preferredRecord, mergedRecord) {

  mergedRecord.fields = mergedRecord.fields.filter(function(field) {
    return field.tag !== '001';
  });

  mergedRecord.fields.push({
    tag: '001',
    value: '000000000'
  });
}

function add583CommentAboutMergeOperation(otherRecord, preferredRecord, mergedRecord) {

  const other_id = findId(otherRecord);
  const preferred_id = findId(preferredRecord);

  mergedRecord.fields.push({
    tag: '583',
    subfields: [
      { code: 'a', value:'MERGED FROM ' + '(FI-MELINDA)' + other_id + ' + ' + '(FI-MELINDA)' + preferred_id },
      { code: 'c', value: formatDate(new Date()) },
      { code: '5', value:'MELINDA' },
    ]
  });
}

function removeCATFromMergedRecord(otherRecord, preferredRecord, mergedRecord) {
  mergedRecord.fields = mergedRecord.fields.filter(function(f) { return f.tag !== 'CAT';});
}

function parseYearFrom008(record) {

  const f008 = head(record.fields.filter(byTag('008')));
  if (f008 === undefined) {
    return undefined;
  }

  const year = f008.value.substr(7,4);
  return isNaN(year) ? undefined : year;
  
}

function addReprintNotes(otherRecord, preferredRecord, mergedRecord) {

  const reprintFields = otherRecord.fields.filter(byTag('250'));
  const reprintTexts = reprintFields.filter(notIncludedWith(exactFieldComparator, mergedRecord.fields))
    .map(field => field.subfields
      .filter(sub => sub.code === 'a')
      .map(pick('value'))
      .map(str => str.trim())
      .join(' ')
    );
    
  reprintTexts.forEach(function(reprintText) {
    let text = 'Lisäpainokset: ' + reprintText;
    
    const year = parseYearFrom008(otherRecord);
    if (year !== undefined) {
      text += ' ' + year;
    }
    
    if (last(text) !== '.') {
      text += '.';
    }

    const textNormalizer = (text) => text.replace(/\W/g, '');
    const isAlreadyIncluded   = mergedRecord.fields.filter(byTag('500')).some(field => {
      return field.subfields
        .filter(subfield => subfield.code === 'a')
        .map(pick('value'))
        .some(equalsWith(textNormalizer, text));
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
}

function updateMergedRecordWithAuthorizedFormat(auth_db) {
  return async(otherRecord, preferredRecord, mergedRecord) => {

    const otherQueryObject = toAuthorityQueryObject(otherRecord);
    const prefQueryObject = toAuthorityQueryObject(preferredRecord);

    if ( 
      otherQueryObject !== undefined && 
      prefQueryObject !== undefined && 
      otherQueryObject.name !== prefQueryObject.name) {
      
      if (otherQueryObject.tag !== prefQueryObject.tag) {
        throw mergeError('Author type mismatch.');
      } 

      var otherIsAuthorized = await authorInAuthorizedFormat(auth_db, otherRecord);
      var preferredIsAuthorized = await authorInAuthorizedFormat(auth_db, preferredRecord);

      if (otherIsAuthorized && preferredIsAuthorized) {
        throw mergeError('Both records are in authorized format.');
      }

      if (otherIsAuthorized) {

        mergedRecord.fields = mergedRecord.fields.filter(field => field.tag !== otherQueryObject.tag);

        var field = head(otherRecord.fields.filter(byTag(otherQueryObject.tag)));

        if (field === undefined) {
          throw mergeError('Could not find author from record');
        }

        mergedRecord.fields.push(field);
      }

    }
  };
}

function normalizeAuthorityQueryName(str) {
  return str
    .replace(/\.|,|:|-/g,' ')
    .replace(/\s{2}/g, ' ')
    .trim();
}

const normalizedComparator = (a,b) => normalizeAuthorityQueryName(a) === normalizeAuthorityQueryName(b);

async function authorInAuthorizedFormat(auth_db, record) {

  const query = toAuthorityQueryObject(record);

  const results = await auth_db.query('fin11', 'WNA', query.name);
  
  const isAuthorizedFormat = results
    .map(toAuthorityQueryObject)
    .map(pick('name'))
    .some(equalsWith(normalizedComparator, query.name));

  return isAuthorizedFormat;

}

module.exports = {
  syncLOWandSIDFields,
  add035zLinksToSourceRecords,
  reset001FromMergedRecord,
  add583CommentAboutMergeOperation,
  removeCATFromMergedRecord,
  addReprintNotes,
  updateMergedRecordWithAuthorizedFormat
};
