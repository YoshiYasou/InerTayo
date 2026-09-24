'use strict';
/**
 * Shared auto-increment counter utility.
 * Each collection gets its own counter document.
 * Returns the next integer id for the given collection.
 */
const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
    _id: { type: String },
    seq: { type: Number, default: 0 }
});

const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);

async function nextId(collectionName) {
    const doc = await Counter.findByIdAndUpdate(
        collectionName,
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true }
    );
    return doc.seq;
}

module.exports = { Counter, nextId };
