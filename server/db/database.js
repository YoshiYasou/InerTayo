'use strict';
/**
 * MongoDB connection module using Mongoose.
 * Replaces legacy SQLite connection layer.
 */
const { connectDB, disconnectDB } = require('./connection');
const mongoose = require('mongoose');

module.exports = {
    connectDB,
    disconnectDB,
    mongoose
};
