const { findId, isSuppressed, byTag, toFirstSubfieldValue, validateDiacritics, selectValue, inferTypeAndCount, mergeError } = require('./record-utils');
const validateFields = require('./validate-fields');

const parseId = (record) => {
  const fields = record.fields.filter(byTag('001'));
  return fields[0] && fields[0].value || 'unknown';
};


async function recordsNotSuppressed(otherRecord, preferredRecord) {
  const errors = [];
  if (isSuppressed(otherRecord)) {
    errors.push('Record is suppressed');
  }
  if (isSuppressed(preferredRecord)) {
    errors.push('Record is suppressed');
  }
  if (errors) {
    throw errors;
  }
}

// Validate that the records do not contain same LOW tag. That would mean the records are duplicate in the local database.
async function noSameLOWTags(otherRecord, preferredRecord) {
  const errors = [];

  var other_LOW = otherRecord.fields.filter(byTag('LOW')).map(toFirstSubfieldValue('a'));
  var preferred_LOW = preferredRecord.fields.filter(byTag('LOW')).map(toFirstSubfieldValue('a'));

  other_LOW.forEach(function(oLow) {
    if (preferred_LOW.indexOf(oLow) !== -1) {
      errors.push('Both records have have LOW tag: ' + oLow);
    }
  });

  if (errors) {
    throw errors;
  }
}

async function preferredRecordInFENNI(otherRecord, preferredRecord) {

  function arrayContains(arr, item) {
    return arr.indexOf(item) !== -1;
  }
  var other_LOW = otherRecord.fields.filter(byTag('LOW')).map(toFirstSubfieldValue('a'));
  var preferred_LOW = preferredRecord.fields.filter(byTag('LOW')).map(toFirstSubfieldValue('a'));


  if (arrayContains(other_LOW, 'FENNI') && !arrayContains(preferred_LOW, 'FENNI')) {
    throw 'Other record has LOW: FENNI, but preferred does not.';
  }
}
async function sameType(otherRecord, preferredRecord) {

  // record type, leader index 6
  var oType = otherRecord.leader.substr(6,1);
  var pType = preferredRecord.leader.substr(6,1);

  if (oType !== pType) {
    throw `Records are of different type (leader/6): ${oType} - ${pType}`;
  }

}


const fieldRequirements = {
  '027': { validate: ['neitherHas'] },
  '240': { validate: ['identical', 'neitherHas'] },
  '830': { validate: ['identical', 'preferredIsSupersetExceptIfEmpty'] }, 
  '880': { validate: ['identical', 'otherHas']}
};
async function checkFieldRequirements(otherRecord, preferredRecord) {

  const fieldRequirementErrors = validateFields(fieldRequirements, otherRecord, preferredRecord);
  if (fieldRequirementErrors) {
    throw fieldRequirementErrors;
  }
}

async function checkDiacriticsFromTitle(otherRecord, preferredRecord) {
  const diacriticsErrors = validateDiacritics(['245'], otherRecord, preferredRecord);
  if (diacriticsErrors) {
    throw diacriticsErrors;
  }
}


function identicalCount(tag, rec1, rec2) {
  var r1fields = rec1.fields.filter(byTag(tag));
  var r2fields = rec2.fields.filter(byTag(tag));

  return r1fields.length === r2fields.length;
}

async function sameAuthorType(otherRecord, preferredRecord) {

  // Author type check
  const requiredIndenticalCounts = ['100', '110', '111'];
  requiredIndenticalCounts.forEach(function(countField) {
    if (!identicalCount(countField, otherRecord, preferredRecord)) {
      throw `Field count mismatch for field ${countField}`;
    }
  });
}
async function noAlephMultifields(otherRecord, preferredRecord) {

  // Aleph field-cutting
  [otherRecord, preferredRecord].forEach(function(record) {

    record.fields.some(function(field) {
      
      if (field.subfields !== undefined && field.subfields.length > 0) {
        
        if (field.subfields[0].value.substr(0,2) == '^^') {
          throw `Record ${parseId(record)} contains Aleph multifields`;
        }
      }
    });

  });
}

async function same300TypeAndCount(otherRecord, preferredRecord) {

  // 300a check
  var o300a = selectValue(otherRecord, '300', 'a');
  var p300a = selectValue(preferredRecord, '300', 'a');

  if (o300a !== null || p300a !== null) {

    if (o300a !== p300a) {
      var otherRecordType = inferTypeAndCount(o300a);
      var preferredRecordType = inferTypeAndCount(p300a);

      if (otherRecordType === null && preferredRecordType === null) {
        throw 'Could not infer the meaning of 300a.';
      }

      if (otherRecordType !== null && preferredRecordType !== null) {
        if (otherRecordType.type !== preferredRecordType.type) {
          throw 'Inferred record types differ (from field 300a): + ' + otherRecordType.type +' - ' + preferredRecordType.type;
        }
        if (otherRecordType.count !== preferredRecordType.count) {
          throw 'Records have different inferred count of types (from field 300a): ' + otherRecordType.count +' - ' + preferredRecordType.count;
        }
      }
    }
  }
}

function notHostRecord(bib_db) {
  return async (otherRecord, preferredRecord) => {
    // is Host record check
    const errors = [];
    try {
      const otherRecordMeta = await isHostRecord(bib_db, otherRecord);
      const preferredRecordMeta = await isHostRecord(bib_db, preferredRecord);

      if (otherRecordMeta.isHost) {
        errors.push('record is a host record: ' + otherRecordMeta.id);
      }
      if (preferredRecordMeta.isHost) {
        errors.push('record is a host record: ' + preferredRecordMeta.id);
      }
      if (errors.length > 0) {
        throw errors;
      }

    } catch(error) {
      throw error;
    }
    
  };
}

function isHostRecord(bib_db, record) {
  
  let id;
  try {
    id = findId(record);
  } catch(error) {
    return Promise.reject(error);
  }
  

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
function notComponentRecord(otherRecord, preferredRecord) {
  const isComponentByLeader = leader => ['a','b','d'].indexOf(leader.charAt(7)) !== -1;
  
  const errors = [];
  if (isComponentByLeader(otherRecord.leader)) {
    errors.push(`record is a component record: ${parseId(otherRecord)}`);
  }

  if (isComponentByLeader(preferredRecord.leader)) {
    errors.push(`record is a component record: ${parseId(preferredRecord)}`);
  }
    
  if (errors.length > 0) {
    throw errors;
  }
}
module.exports = {
  recordsNotSuppressed,
  noSameLOWTags,
  preferredRecordInFENNI,
  sameType,
  checkFieldRequirements,
  checkDiacriticsFromTitle,
  sameAuthorType,
  noAlephMultifields,
  same300TypeAndCount,
  notHostRecord,
  notComponentRecord
};
