export {};

const { sendMsgAsync } = require('../../utils/network');
const { types } = require('../../utils/proto');
const { getServerTimeSec } = require('../../utils/utils');
const { getBag, getBagItems } = require('../warehouse');
const shared = require('./shared');
const { getCurrentSolarTerms } = require('./snapshot');
const { createPetDiaryService } = require('./pet-diary');

let mutationTail: Promise<void> = Promise.resolve();

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = mutationTail.then(operation, operation);
    mutationTail = result.then(() => undefined, () => undefined);
    return result;
}

// Worker API calls already use main's account task queue. Keep the service's
// mutation guard local so direct service callers cannot spend resources twice.
module.exports = createPetDiaryService({
    ...shared,
    types, sendMsgAsync, getBag, getBagItems, getServerTimeSec,
    serializeMutation, getCurrentSolarTerms,
});
