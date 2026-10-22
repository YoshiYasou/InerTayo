const app = require('../server/server');
const { connectDB } = require('../server/db/connection');

let databaseConnection;

module.exports = async (req, res) => {
    if (!databaseConnection) {
        databaseConnection = connectDB().catch((error) => {
            databaseConnection = null;
            throw error;
        });
    }

    await databaseConnection;
    return app(req, res);
};
